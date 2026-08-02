import { TYPES, charsPerLine } from './elements';

/**
 * Dual dialogue — two people talking over each other.
 *
 * The flag lives on the second character cue and means "this speech runs
 * alongside the one before it". That is how Final Draft and Fountain both
 * think about it, and it keeps the document a flat list of elements: nothing
 * is nested, so every other part of the app carries on working unchanged.
 *
 * Only the three places that care about the *shape* of the page — the editor,
 * the paginator and the printer — ask this module to group them.
 */

/** A speech is a cue and everything spoken under it. */
export const SPEECH = new Set(['character', 'parenthetical', 'dialogue']);

/** Dual columns are half the dialogue measure, less the gutter between them. */
export const DUAL_WIDTH = 2.7; // inches
export const DUAL_CHARS = Math.floor(DUAL_WIDTH / 0.1); // 27 characters

/**
 * Walk the script and gather it into rows: either one element on its own, or a
 * pair of speeches sharing the same lines.
 *
 * Returns [{ kind: 'single', el } | { kind: 'dual', left: [els], right: [els] }]
 */
export function groupDual(elements) {
  const rows = [];
  let i = 0;

  while (i < elements.length) {
    const el = elements[i];

    // A dual cue reaches backwards for the speech it interrupts.
    if (el.type === 'character' && el.dual) {
      const right = [el];
      let j = i + 1;
      while (j < elements.length && SPEECH.has(elements[j].type) && elements[j].type !== 'character') {
        right.push(elements[j]);
        j += 1;
      }

      // Pull the previous speech out of the rows already gathered.
      const left = [];
      while (rows.length) {
        const prev = rows[rows.length - 1];
        if (prev.kind !== 'single' || !SPEECH.has(prev.el.type)) break;
        left.unshift(rows.pop().el);
        if (prev.el.type === 'character') break;
      }

      if (left.length && left[0].type === 'character') {
        rows.push({ kind: 'dual', left, right });
        i = j;
        continue;
      }

      // Nothing to pair with — fall through and treat it as an ordinary cue.
      for (const one of right) rows.push({ kind: 'single', el: one });
      i = j;
      continue;
    }

    rows.push({ kind: 'single', el });
    i += 1;
  }

  return rows;
}

/** The ids of every element drawn inside a dual pair, for the editor. */
export function dualIds(elements) {
  const ids = new Set();
  for (const row of groupDual(elements)) {
    if (row.kind !== 'dual') continue;
    for (const el of [...row.left, ...row.right]) ids.add(el.id);
  }
  return ids;
}

/** Can this element be made to speak at the same time as the one before it? */
export function canPair(elements, index) {
  const el = elements[index];
  if (!el || el.type !== 'character') return false;
  for (let i = index - 1; i >= 0; i -= 1) {
    const prev = elements[i];
    if (prev.type === 'character') return !prev.dual;
    if (!SPEECH.has(prev.type)) return false;
  }
  return false;
}

/**
 * How tall a dual pair stands: the taller of its two columns, measured at the
 * narrower dual width. Two speeches side by side cost the page one speech.
 */
export function dualLines(row, wrap) {
  const side = (els) =>
    els.reduce((n, el, i) => {
      const before = i === 0 ? 0 : TYPES[el.type].spaceBefore;
      return n + before + wrap(el.text || '', DUAL_CHARS).length;
    }, 0);
  return Math.max(side(row.left), side(row.right));
}

/** The measure a single element wraps at — narrower inside a dual pair. */
export const measureFor = (el, inDual) => (inDual ? DUAL_CHARS : charsPerLine(el.type));
