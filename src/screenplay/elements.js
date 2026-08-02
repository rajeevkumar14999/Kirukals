// Industry-standard screenplay element geometry.
// Courier 12pt renders at exactly 10 characters per inch, so every width below
// doubles as a character count (width / 0.1).
//
// Page: US Letter, 1" top/bottom, 1.5" left, 1" right => 6.0" of text.
// All `indent` values are measured from the left text margin, not the paper edge.

export const PAGE = {
  width: 8.5,
  height: 11,
  marginTop: 1,
  marginBottom: 1,
  marginLeft: 1.5,
  marginRight: 1,
  linesPerPage: 55,
};

export const TEXT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight; // 6.0"

export const TYPES = {
  scene_heading: {
    id: 'scene_heading',
    label: 'Scene Heading',
    short: 'Scene',
    indent: 0,
    width: 6.0,
    uppercase: true,
    bold: true,
    align: 'left',
    spaceBefore: 2,
    next: 'action',
  },
  action: {
    id: 'action',
    label: 'Action',
    short: 'Action',
    indent: 0,
    width: 6.0,
    uppercase: false,
    align: 'left',
    spaceBefore: 1,
    next: 'action',
  },
  character: {
    id: 'character',
    label: 'Character',
    short: 'Char',
    indent: 2.2,
    width: 3.8,
    uppercase: true,
    align: 'left',
    spaceBefore: 1,
    next: 'dialogue',
  },
  parenthetical: {
    id: 'parenthetical',
    label: 'Parenthetical',
    short: 'Paren',
    indent: 1.6,
    width: 2.5,
    uppercase: false,
    align: 'left',
    spaceBefore: 0,
    next: 'dialogue',
  },
  dialogue: {
    id: 'dialogue',
    label: 'Dialogue',
    short: 'Dial',
    indent: 1.0,
    width: 3.5,
    uppercase: false,
    align: 'left',
    spaceBefore: 0,
    next: 'character',
  },
  transition: {
    id: 'transition',
    label: 'Transition',
    short: 'Trans',
    indent: 0,
    width: 6.0,
    uppercase: true,
    align: 'right',
    spaceBefore: 1,
    next: 'scene_heading',
  },
  shot: {
    id: 'shot',
    label: 'Shot',
    short: 'Shot',
    indent: 0,
    width: 6.0,
    uppercase: true,
    align: 'left',
    spaceBefore: 1,
    next: 'action',
  },
};

// Order used by Tab / Shift+Tab cycling and by the Ctrl+1..7 shortcuts.
export const TYPE_ORDER = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
];

export const charsPerLine = (type) => Math.round(TYPES[type].width / 0.1);

export const nextTypeAfterEnter = (type) => TYPES[type].next;

export function cycleType(type, backwards = false) {
  const i = TYPE_ORDER.indexOf(type);
  const n = TYPE_ORDER.length;
  return TYPE_ORDER[(i + (backwards ? -1 : 1) + n) % n];
}

export const displayText = (type, text) =>
  TYPES[type].uppercase ? text.toUpperCase() : text;

let seq = 0;
export const newId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

export const makeElement = (type = 'action', text = '') => ({
  id: newId(),
  type,
  text,
});

const SCENE_PREFIX = /^(INT\.|EXT\.|EST\.|INT\.\/EXT\.|I\/E\.|INT |EXT )/i;
const TRANSITION_RE = /^(CUT TO:|FADE OUT\.?|FADE TO:|DISSOLVE TO:|SMASH CUT TO:|MATCH CUT TO:|FADE IN:)$/i;

// Typing "INT. " into an empty Action line should silently become a Scene
// Heading — the single most common auto-format in screenwriting software.
export function autoDetectType(type, text) {
  const t = text.trim();
  if (!t) return type;
  if (type === 'action' && SCENE_PREFIX.test(t)) return 'scene_heading';
  if (type === 'action' && TRANSITION_RE.test(t)) return 'transition';
  return type;
}

export function isSceneHeading(el) {
  return el.type === 'scene_heading';
}

// "INT. KITCHEN - NIGHT" -> { setting: 'INT.', location: 'KITCHEN', time: 'NIGHT' }
export function parseSlugline(text) {
  const t = text.trim().toUpperCase();
  const m = t.match(/^(INT\.\/EXT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*(.*)$/);
  if (!m) return { setting: '', location: t, time: '' };
  const rest = m[2];
  const dash = rest.lastIndexOf(' - ');
  if (dash === -1) return { setting: m[1], location: rest, time: '' };
  return {
    setting: m[1],
    location: rest.slice(0, dash).trim(),
    time: rest.slice(dash + 3).trim(),
  };
}
