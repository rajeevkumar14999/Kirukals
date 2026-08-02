// Which visual (wrapped) row is the caret on, and how many rows are there?
// Measured with a hidden mirror div that copies the textarea's box + font, so
// arrow keys can move between elements only at the real top/bottom edges.

let mirror = null;

function getMirror() {
  if (mirror) return mirror;
  mirror = document.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '-9999px',
    left: '-9999px',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  });
  document.body.appendChild(mirror);
  return mirror;
}

function measure(el, text) {
  const m = getMirror();
  const cs = getComputedStyle(el);
  for (const p of [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textTransform', 'padding', 'borderWidth', 'boxSizing', 'width',
  ]) {
    m.style[p] = cs[p];
  }
  // A trailing newline collapses without a sentinel character.
  m.textContent = text + '​';
  return m.getBoundingClientRect().height;
}

export function caretRows(el) {
  const cs = getComputedStyle(el);
  let lineHeight = parseFloat(cs.lineHeight);
  if (!lineHeight || Number.isNaN(lineHeight)) lineHeight = parseFloat(cs.fontSize) * 1.2;

  const before = measure(el, el.value.slice(0, el.selectionStart));
  const total = measure(el, el.value);
  return {
    row: Math.max(0, Math.round(before / lineHeight) - 1),
    rows: Math.max(1, Math.round(total / lineHeight)),
  };
}

export const isOnFirstRow = (el) => caretRows(el).row === 0;

export function isOnLastRow(el) {
  const { row, rows } = caretRows(el);
  return row >= rows - 1;
}

// Column offset within the caret's own visual row, used to land the caret in
// roughly the same horizontal spot when stepping into a neighbouring element.
export function caretColumn(el) {
  const upto = el.value.slice(0, el.selectionStart);
  const nl = upto.lastIndexOf('\n');
  return el.selectionStart - (nl + 1);
}
