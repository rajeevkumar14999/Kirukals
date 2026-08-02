/**
 * Inline emphasis.
 *
 * Styles are stored as ranges beside the text, never as characters inside it:
 *
 *     { text: 'STAFF', styles: [{ from: 0, to: 5, kind: 'bold' }] }
 *
 * That is the whole point — the textarea holds exactly what the page shows, so
 * no `**` ever appears while writing and the caret cannot drift away from the
 * glyphs. Fountain markers still exist, but only at the edges: they are written
 * on export and parsed on import.
 */

export const KINDS = ['bold', 'italic', 'underline'];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Drop empties, merge touching ranges of the same kind, keep it tidy. */
export function normalise(styles = [], length = Infinity) {
  const out = [];
  for (const kind of KINDS) {
    const spans = styles
      .filter((s) => s.kind === kind)
      .map((s) => ({ from: clamp(s.from, 0, length), to: clamp(s.to, 0, length) }))
      .filter((s) => s.to > s.from)
      .sort((a, b) => a.from - b.from);

    for (const span of spans) {
      const last = out[out.length - 1];
      if (last && last.kind === kind && span.from <= last.to) {
        last.to = Math.max(last.to, span.to);
      } else {
        out.push({ ...span, kind });
      }
    }
  }
  return out;
}

const covers = (styles, from, to, kind) => {
  if (to <= from) return false;
  for (let i = from; i < to; i++) {
    if (!styles.some((s) => s.kind === kind && s.from <= i && i < s.to)) return false;
  }
  return true;
};

/** Add the style if the selection lacks it anywhere; otherwise take it away. */
export function toggleStyle(styles, from, to, kind) {
  const current = normalise(styles);
  if (to <= from) return current;

  if (!covers(current, from, to, kind)) {
    return normalise([...current, { from, to, kind }]);
  }

  // Remove: keep whatever sits outside the selection.
  const kept = [];
  for (const s of current) {
    if (s.kind !== kind || s.to <= from || s.from >= to) {
      kept.push(s);
      continue;
    }
    if (s.from < from) kept.push({ ...s, to: from });
    if (s.to > to) kept.push({ ...s, from: to });
  }
  return normalise(kept);
}

/**
 * Follow the text through an edit.
 *
 * Compares old and new text to find the one changed span, then shifts every
 * range around it. Typing inside or at the end of a styled run continues that
 * style, which is what every editor does and what writers expect.
 */
export function remap(styles = [], before = '', after = '') {
  if (!styles.length || before === after) return normalise(styles, after.length);

  let p = 0;
  const max = Math.min(before.length, after.length);
  while (p < max && before[p] === after[p]) p += 1;

  let s = 0;
  while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s += 1;

  const removed = before.length - p - s;
  const inserted = after.length - p - s;
  const delta = inserted - removed;
  const cutEnd = p + removed;

  const move = (pos, isEnd) => {
    if (pos <= p) return pos;
    if (pos >= cutEnd) return pos + delta;
    // Inside the replaced span: collapse to its edges.
    return isEnd ? p : p + inserted;
  };

  // Typing on the end of a styled word continues that word's style, but
  // starting a new word does not — so "bold" → "boldest" stays bold while
  // "bold" → "bold and more" leaves the new words plain.
  const continuesWord = inserted > 0 && !/^\s/.test(after.slice(p, p + inserted));

  const moved = styles.map((style) => {
    const from = move(style.from, false);
    let to = move(style.to, true);
    if (continuesWord && style.from < p && p <= style.to) to = Math.max(to, p + inserted);
    return { ...style, from, to };
  });

  return normalise(moved, after.length);
}

/** Split text into styled segments for rendering. */
export function runs(text, styles = []) {
  const marks = normalise(styles, text.length);
  if (!marks.length) return text ? [{ text, bold: false, italic: false, underline: false }] : [];

  const edges = new Set([0, text.length]);
  for (const s of marks) {
    edges.add(s.from);
    edges.add(s.to);
  }
  const points = [...edges].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);

  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (to <= from) continue;
    out.push({
      text: text.slice(from, to),
      bold: marks.some((s) => s.kind === 'bold' && s.from <= from && to <= s.to),
      italic: marks.some((s) => s.kind === 'italic' && s.from <= from && to <= s.to),
      underline: marks.some((s) => s.kind === 'underline' && s.from <= from && to <= s.to),
    });
  }
  return out;
}

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The styled mirror painted over the textarea. */
export function toHtml(text, styles) {
  return runs(text, styles)
    .map((run) => {
      const cls = [run.bold && 'b', run.italic && 'i', run.underline && 'u']
        .filter(Boolean)
        .join(' ');
      const body = escapeHtml(run.text);
      return cls ? `<span class="${cls}">${body}</span>` : body;
    })
    .join('');
}

/** Which styles apply across a selection — drives the toolbar's on/off state. */
export function activeStyles(styles, from, to) {
  const current = normalise(styles);
  const at = to > from ? null : from;
  return Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      at === null
        ? covers(current, from, to, kind)
        : current.some((s) => s.kind === kind && s.from < at && at <= s.to),
    ]),
  );
}

/* ------------------------------------------------------------------ *
 * Fountain markers — used only when text crosses the app's boundary
 * ------------------------------------------------------------------ */

const MARKER = { bold: '**', italic: '*', underline: '_' };

// A literal asterisk or underscore in the script would be read back as a
// marker, so it is escaped on the way out — Fountain's own convention.
const escapeMarkers = (s) => s.replace(/([*_\\])/g, '\\$1');

/** Text with Fountain markers, for Fountain export and plain reading. */
export function toMarkers(text, styles) {
  return runs(text, styles)
    .map((run) => {
      let out = escapeMarkers(run.text);
      if (run.underline) out = `${MARKER.underline}${out}${MARKER.underline}`;
      if (run.italic) out = `${MARKER.italic}${out}${MARKER.italic}`;
      if (run.bold) out = `${MARKER.bold}${out}${MARKER.bold}`;
      return out;
    })
    .join('');
}

/** Parse Fountain markers into clean text plus ranges. */
export function fromMarkers(source = '') {
  let text = '';
  const styles = [];
  const open = { bold: null, italic: null, underline: null };

  const toggle = (kind) => {
    if (open[kind] === null) open[kind] = text.length;
    else {
      styles.push({ from: open[kind], to: text.length, kind });
      open[kind] = null;
    }
  };

  for (let i = 0; i < source.length; i++) {
    const rest = source.slice(i);
    if (source[i] === '\\' && /[*_\\]/.test(source[i + 1] || '')) {
      text += source[i + 1];
      i += 1;
      continue;
    }
    if (rest.startsWith('***')) {
      toggle('bold');
      toggle('italic');
      i += 2;
      continue;
    }
    if (rest.startsWith('**')) {
      toggle('bold');
      i += 1;
      continue;
    }
    if (source[i] === '*') {
      toggle('italic');
      continue;
    }
    if (source[i] === '_') {
      toggle('underline');
      continue;
    }
    text += source[i];
  }

  return { text, styles: normalise(styles, text.length) };
}

/** Runs with Final Draft's style attribute. */
export function toStyledRuns(text, styles) {
  return runs(text, styles)
    .filter((run) => run.text)
    .map((run) => ({
      text: run.text,
      style: [run.bold && 'Bold', run.italic && 'Italic', run.underline && 'Underline']
        .filter(Boolean)
        .join('+'),
    }));
}

/**
 * Bring an element up to date. Scripts written before styles were ranges have
 * markers sitting in their text; convert them once, on the way in.
 */
export function normaliseElement(el) {
  if (el.styles) return { ...el, styles: normalise(el.styles, el.text.length) };
  if (!/[*_\\]/.test(el.text || '')) return el;
  const { text, styles } = fromMarkers(el.text || '');
  return { ...el, text, styles };
}
