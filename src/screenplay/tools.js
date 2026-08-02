import { TYPES } from './elements';
import { countLines } from './paginate';

/* ------------------------------------------------------------------ *
 * Counting
 * ------------------------------------------------------------------ */

const words = (text) => (String(text).match(/[\p{L}\p{N}'’-]+/gu) || []).length;

/**
 * What a script is made of, counted the way a writer asks about it: dialogue
 * separately from action, because the two do not read at the same speed.
 */
export function wordStats(elements) {
  const out = {
    words: 0,
    dialogueWords: 0,
    actionWords: 0,
    characters: 0,
    elements: elements.length,
    scenes: 0,
    speeches: 0,
    lines: 0,
  };
  for (const el of elements) {
    const n = words(el.text);
    out.words += n;
    out.characters += el.text.length;
    out.lines += countLines(el);
    if (el.type === 'dialogue') {
      out.dialogueWords += n;
      out.speeches += 1;
    }
    if (el.type === 'action') out.actionWords += n;
    if (el.type === 'scene_heading') out.scenes += 1;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Rename a character everywhere
 * ------------------------------------------------------------------ */

/** Every name that has spoken, with how often. */
export function castList(elements) {
  const seen = new Map();
  for (const el of elements) {
    if (el.type !== 'character') continue;
    // "MAYA (CONT'D)" and "MAYA (V.O.)" are the same person.
    const name = el.text.replace(/\s*\(.*$/, '').trim().toUpperCase();
    if (!name) continue;
    seen.set(name, (seen.get(name) || 0) + 1);
  }
  return [...seen.entries()]
    .map(([name, cues]) => ({ name, cues }))
    .sort((a, b) => b.cues - a.cues);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rename a character in the cues, and — when asked — everywhere the name is
 * spoken or written about. Mentions are matched on whole words only, so
 * renaming ANN does not maul ANNOUNCER.
 */
export function renameCharacter(elements, from, to, { includeMentions = true } = {}) {
  const cueRe = new RegExp(`^${escapeRe(from)}\\b`, 'i');
  const wordRe = new RegExp(`\\b${escapeRe(from)}\\b`, 'gi');
  let cues = 0;
  let mentions = 0;

  const next = elements.map((el) => {
    if (el.type === 'character' && cueRe.test(el.text.trim())) {
      cues += 1;
      return { ...el, text: el.text.trim().replace(cueRe, to.toUpperCase()) };
    }
    if (!includeMentions || el.type === 'character') return el;
    if (!wordRe.test(el.text)) return el;
    wordRe.lastIndex = 0;
    const text = el.text.replace(wordRe, (hit) =>
      // A mention in an action line is written the way the line writes it.
      hit === hit.toUpperCase() ? to.toUpperCase() : to,
    );
    if (text === el.text) return el;
    mentions += 1;
    return { ...el, text: TYPES[el.type].uppercase ? text.toUpperCase() : text };
  });

  return { elements: next, cues, mentions };
}

/* ------------------------------------------------------------------ *
 * Formatting check
 * ------------------------------------------------------------------ */

const SLUG_RE = /^(INT|EXT|INT\.?\/EXT|I\/E|EST)[.\s]/i;

/**
 * The faults a reader notices immediately. Every finding names the element it
 * is about so the report can jump straight to it.
 */
export function checkFormatting(elements) {
  const found = [];
  const add = (el, severity, message) => found.push({ id: el.id, severity, message, text: el.text });

  elements.forEach((el, i) => {
    const text = el.text.trim();
    const next = elements[i + 1];
    const prev = elements[i - 1];

    if (el.type === 'scene_heading') {
      if (!SLUG_RE.test(text)) {
        add(el, 'warn', 'Scene heading does not start with INT. or EXT.');
      } else if (!/\s[-–]\s\S/.test(text)) {
        add(el, 'info', 'Scene heading has no time of day (— DAY, — NIGHT).');
      }
      if (next && next.type === 'scene_heading') {
        add(el, 'warn', 'Two scene headings in a row, with no scene between them.');
      }
    }

    if (el.type === 'character') {
      if (!text) add(el, 'error', 'Empty character cue.');
      if (next && next.type !== 'dialogue' && next.type !== 'parenthetical') {
        add(el, 'error', 'Character cue with no dialogue under it.');
      }
      if (text.length > 30) add(el, 'info', 'Very long character cue — is this action written as a cue?');
    }

    if (el.type === 'parenthetical') {
      if (text && !(text.startsWith('(') && text.endsWith(')'))) {
        add(el, 'warn', 'Parenthetical is not wrapped in brackets.');
      }
      if (prev && prev.type === 'dialogue' && next && next.type !== 'dialogue') {
        add(el, 'info', 'Parenthetical with no dialogue following it.');
      }
    }

    if (el.type === 'dialogue') {
      if (!prev || (prev.type !== 'character' && prev.type !== 'parenthetical' && prev.type !== 'dialogue')) {
        add(el, 'error', 'Dialogue with no character cue above it.');
      }
    }

    if (el.type === 'action') {
      if (text && text === text.toUpperCase() && text.length > 24 && /[A-Z]{4}/.test(text)) {
        add(el, 'info', 'Whole action line in capitals — usually only names are shouted.');
      }
      if (countLines(el) > 5) {
        add(el, 'info', `Action block runs ${countLines(el)} lines. Four is the usual limit.`);
      }
    }

    if (el.type === 'transition' && !/(TO:|OUT\.?|IN:)$/i.test(text) && text) {
      add(el, 'info', 'Transition does not end the usual way (CUT TO:, FADE OUT.).');
    }

    if (!text && el.type !== 'action') add(el, 'info', `Empty ${TYPES[el.type].label.toLowerCase()}.`);
  });

  return found;
}

/* ------------------------------------------------------------------ *
 * Prose checks
 * ------------------------------------------------------------------ */

const PROGRESSIVE_RE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ing)\b/gi;

/**
 * Screen action is written in the present, and in the simple present at that:
 * "He opens the door", not "He is opening the door". This finds the second
 * kind and offers the first.
 */
export function presentProgressive(elements) {
  const hits = [];
  for (const el of elements) {
    if (el.type !== 'action' && el.type !== 'shot') continue;
    const re = new RegExp(PROGRESSIVE_RE.source, 'gi');
    let m;
    while ((m = re.exec(el.text))) {
      hits.push({
        id: el.id,
        phrase: m[0],
        at: m.index,
        suggestion: simplify(m[0]),
        text: el.text,
      });
    }
  }
  return hits;
}

/**
 * Verbs that lose an "e" before -ing, so the stem has to get it back:
 * "making" -> "mak" -> "make". There is no rule that separates these from
 * "opening" -> "open", only knowledge of the word, so this is a list of the
 * ones that actually turn up in action lines.
 */
const E_DROPPED = new Set([
  'mak', 'tak', 'com', 'giv', 'leav', 'writ', 'mov', 'clos', 'us', 'rid', 'driv',
  'smil', 'danc', 'star', 'plac', 'rais', 'notic', 'ris', 'wak', 'shak', 'chas',
  'fac', 'pac', 'hid', 'slid', 'typ', 'wip', 'shov', 'lov', 'liv', 'sav', 'wav',
  'serv', 'stroll', 'gaz', 'squeez', 'brac', 'trac', 'glanc', 'balanc', 'scrap',
]);

/** "is walking" -> "walks", "is quietly opening" -> "quietly opens". */
function simplify(phrase) {
  const m = phrase.match(/\b(am|is|are|was|were|be|been|being)\s+((?:\w+ly)\s+)?(\w+)ing\b/i);
  if (!m) return null;
  const plural = /^(are|were)$/i.test(m[1]);
  const adverb = m[2] ? m[2].trim() : '';
  let stem = m[3];

  // "runn" -> "run": undo the consonant that -ing doubled.
  if (/([bdgklmnprt])\1$/i.test(stem)) stem = stem.slice(0, -1);
  else if (E_DROPPED.has(stem.toLowerCase())) stem += 'e';

  const verb = plural
    ? stem
    : /(s|sh|ch|x|z|o)$/i.test(stem)
      ? `${stem}es`
      : `${stem}s`;
  return adverb ? `${adverb} ${verb}` : verb;
}

/**
 * Where the pages are going. Longest elements first, with what each one costs
 * in lines — the raw material for a cut.
 */
export function shortenCandidates(elements, { minLines = 3 } = {}) {
  return elements
    .map((el) => ({
      id: el.id,
      type: el.type,
      text: el.text,
      lines: countLines(el),
      words: words(el.text),
    }))
    .filter((c) => c.lines >= minLines && (c.type === 'action' || c.type === 'dialogue'))
    .sort((a, b) => b.lines - a.lines);
}
