import { PAGE, TYPES, charsPerLine } from './elements';
import { DUAL_CHARS, groupDual } from './dual';

// Word-wrap the way a fixed-pitch page does: break on spaces, hard-break words
// that are longer than the column.
export function wrapLines(text, cpl) {
  const out = [];
  for (const hard of String(text).split('\n')) {
    if (!hard) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of hard.split(' ')) {
      if (!line) {
        line = word;
      } else if (line.length + 1 + word.length <= cpl) {
        line += ' ' + word;
      } else {
        out.push(line);
        line = word;
      }
      while (line.length > cpl) {
        out.push(line.slice(0, cpl));
        line = line.slice(cpl);
      }
    }
    out.push(line);
  }
  return out;
}

export const countLines = (el, inDual = false) =>
  wrapLines(el.text || '', inDual ? DUAL_CHARS : charsPerLine(el.type)).length;

/**
 * Lay elements out onto pages.
 *
 * Returns { pages, pageOf } where `pages` is an array of arrays of element ids
 * and `pageOf` maps element id -> 1-based page number. Blank lines that fall at
 * the top of a page are swallowed, matching how real pages break.
 */
/**
 * Elements that announce something and are meaningless without what follows:
 * a cue with no speech under it, a slug line with no scene under it. When a
 * page fills up, these travel to the next page rather than being left hanging
 * at the foot of this one.
 */
const NEVER_LAST = new Set(['character', 'parenthetical', 'scene_heading', 'shot']);

export function paginate(elements) {
  const pages = [];
  let current = []; // the elements on the page being filled
  let used = 0;

  // Two speeches side by side occupy the page once, at the taller column's
  // height — so measure the pair, not its halves.
  const dualHeights = new Map();
  for (const row of groupDual(elements)) {
    if (row.kind !== 'dual') continue;
    const side = (els) =>
      els.reduce((n, el, i) => n + (i === 0 ? 0 : TYPES[el.type].spaceBefore) + countLines(el, true), 0);
    const tall = Math.max(side(row.left), side(row.right));
    // The pair is charged to its first element; the rest cost nothing.
    dualHeights.set(row.left[0].id, tall);
    for (const el of [...row.left.slice(1), ...row.right]) dualHeights.set(el.id, 0);
  }

  const cost = (el, first) => {
    if (dualHeights.has(el.id)) {
      const height = dualHeights.get(el.id);
      return height === 0 ? 0 : (first ? 0 : TYPES[el.type].spaceBefore) + height;
    }
    return (first ? 0 : TYPES[el.type].spaceBefore) + countLines(el);
  };
  const measure = (els) => els.reduce((n, el, i) => n + cost(el, i === 0), 0);

  // Close the page, carrying any dangling announcement lines forward with it.
  const flush = () => {
    const carried = [];
    while (current.length > 1 && NEVER_LAST.has(current[current.length - 1].type)) {
      carried.unshift(current.pop());
    }
    pages.push(current.map((el) => el.id));
    current = carried;
    used = measure(carried);
  };

  for (const el of elements) {
    let need = cost(el, current.length === 0);
    // Carrying lines forward can leave the new page still too full, so make
    // room more than once if it comes to that.
    for (let guard = 0; used + need > PAGE.linesPerPage && current.length && guard < 4; guard++) {
      flush();
      need = cost(el, current.length === 0);
    }

    used += need;
    current.push(el);

    // An element longer than a whole page simply overflows onto the next.
    while (used > PAGE.linesPerPage) {
      used -= PAGE.linesPerPage;
      pages.push(current.map((e) => e.id));
      current = [];
    }
  }

  if (current.length || pages.length === 0) pages.push(current.map((el) => el.id));

  // Page numbers come from the finished layout — an element's page is not
  // settled until everything that could pull it forward has been placed.
  const pageOf = {};
  pages.forEach((ids, i) => ids.forEach((id) => { pageOf[id] = i + 1; }));
  return { pages, pageOf, pageCount: pages.length };
}

export function computeStats(elements) {
  const { pageCount, pageOf, pages } = paginate(elements);
  const scenes = [];
  const characters = new Map();
  let words = 0;
  let lastCharacter = null;

  for (const el of elements) {
    const text = (el.text || '').trim();
    if (text) words += text.split(/\s+/).length;

    if (el.type === 'scene_heading') {
      scenes.push({ id: el.id, text: text || '(untitled scene)', page: pageOf[el.id] });
      lastCharacter = null;
    }
    if (el.type === 'character') {
      // Strip "(CONT'D)", "(V.O.)" etc. so cues collapse onto one character.
      lastCharacter = text.replace(/\s*\(.*\)\s*$/, '').toUpperCase();
      if (lastCharacter && !characters.has(lastCharacter)) {
        characters.set(lastCharacter, { name: lastCharacter, lines: 0, words: 0, scenes: new Set() });
      }
    }
    if (el.type === 'dialogue' && lastCharacter && characters.has(lastCharacter)) {
      const c = characters.get(lastCharacter);
      c.lines += countLines(el);
      c.words += text ? text.split(/\s+/).length : 0;
      if (scenes.length) c.scenes.add(scenes[scenes.length - 1].id);
    }
  }

  const cast = [...characters.values()]
    .map((c) => ({ ...c, scenes: c.scenes.size }))
    .sort((a, b) => b.lines - a.lines);

  return {
    pageCount,
    pageOf,
    // Element ids grouped per page, so the editor can render real sheets.
    pages,
    scenes,
    cast,
    words,
    // The old rule of thumb: one formatted page runs about one screen minute.
    runtime: pageCount,
  };
}

// Values already typed elsewhere in the script, offered back as autocomplete.
export function collectVocabulary(elements) {
  const locations = new Set();
  const times = new Set();
  const names = new Set();
  for (const el of elements) {
    const text = (el.text || '').trim();
    if (!text) continue;
    if (el.type === 'character') {
      names.add(text.replace(/\s*\(.*\)\s*$/, '').toUpperCase());
    } else if (el.type === 'scene_heading') {
      const m = text.toUpperCase().match(/^(?:INT\.\/EXT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*(.*)$/);
      const rest = m ? m[1] : text.toUpperCase();
      const dash = rest.lastIndexOf(' - ');
      if (dash === -1) {
        if (rest) locations.add(rest.trim());
      } else {
        if (rest.slice(0, dash).trim()) locations.add(rest.slice(0, dash).trim());
        if (rest.slice(dash + 3).trim()) times.add(rest.slice(dash + 3).trim());
      }
    }
  }
  return {
    locations: [...locations].sort(),
    times: [...times].sort(),
    names: [...names].sort(),
  };
}
