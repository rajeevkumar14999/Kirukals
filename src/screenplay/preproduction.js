/**
 * Preproduction: what the script says you will need, and what you found.
 *
 * The left-hand column of both sheets is derived from the script itself and is
 * never edited here — rename a character or a location in the pages and it
 * follows. Everything to the right of it is the search: the places and the
 * people you are considering, kept as options until one is chosen.
 */

const SLUG = /^\s*(INT\.?\/EXT\.?|I\/E|INT\.?|EXT\.?|EST\.?)\s*[.\s]\s*(.+?)\s*$/i;

/** "INT. COFFEE SHOP - DAY" -> { where: 'COFFEE SHOP', when: 'DAY', kind: 'INT' } */
export function parseSlug(text) {
  const m = String(text).match(SLUG);
  if (!m) return { kind: '', where: String(text).trim().toUpperCase(), when: '' };
  const kind = m[1].toUpperCase().replace(/\.$/, '');
  const rest = m[2];
  // The time of day is what follows the last dash, when it looks like one.
  const dash = rest.lastIndexOf(' - ');
  const where = (dash === -1 ? rest : rest.slice(0, dash)).trim().toUpperCase();
  const when = dash === -1 ? '' : rest.slice(dash + 3).trim().toUpperCase();
  return { kind, where, when };
}

/**
 * Every place the script asks for, with how much of the film happens there.
 * INT. and EXT. of the same place are one location — you scout it once.
 */
export function extractLocations(elements, pageOf = {}) {
  const found = new Map();
  for (const el of elements) {
    if (el.type !== 'scene_heading' || !el.text.trim()) continue;
    const { kind, where, when } = parseSlug(el.text);
    if (!where) continue;
    if (!found.has(where)) {
      found.set(where, { name: where, scenes: 0, kinds: new Set(), times: new Set(), firstId: el.id, pages: new Set() });
    }
    const row = found.get(where);
    row.scenes += 1;
    if (kind) row.kinds.add(kind);
    if (when) row.times.add(when);
    if (pageOf[el.id]) row.pages.add(pageOf[el.id]);
  }
  return [...found.values()]
    .map((r) => ({ ...r, kinds: [...r.kinds], times: [...r.times], pages: [...r.pages].sort((a, b) => a - b) }))
    .sort((a, b) => b.scenes - a.scenes);
}

/** Everyone who speaks, with how much they speak. */
export function extractCast(elements) {
  const found = new Map();
  let current = null;
  for (const el of elements) {
    if (el.type === 'character') {
      const name = el.text.replace(/\s*\(.*$/, '').trim().toUpperCase();
      current = name || null;
      if (current && !found.has(current)) {
        found.set(current, { name: current, cues: 0, lines: 0, words: 0, firstId: el.id });
      }
      if (current) found.get(current).cues += 1;
    } else if (el.type === 'dialogue' && current && found.has(current)) {
      const row = found.get(current);
      row.lines += 1;
      row.words += (el.text.match(/[\p{L}\p{N}'’-]+/gu) || []).length;
    } else if (el.type === 'scene_heading' || el.type === 'action') {
      current = null;
    }
  }
  return [...found.values()].sort((a, b) => b.words - a.words);
}

/* ------------------------------- the board ------------------------------- */

export const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const emptyBoard = () => ({ locations: {}, cast: {} });

/** Options are lettered in order, so "option B" means the same to everyone. */
export const labelFor = (i) => LABELS[i] || `#${i + 1}`;

export function makeOption(extra = {}) {
  return {
    id: `o_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    note: '',
    ...extra,
  };
}

/** A Google Maps search for an address — a plain link, no API key involved. */
export const mapsSearchUrl = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

/** Accepts a pasted Maps link and keeps it only if it really is one. */
export function tidyMapUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  try {
    const url = new URL(v);
    const ok = /(^|\.)google\.[a-z.]+$/i.test(url.hostname) || /(^|\.)goo\.gl$/i.test(url.hostname);
    return ok ? url.toString() : '';
  } catch {
    return '';
  }
}

/* ------------------------------- portfolios ------------------------------ */

/** Storage is a few megabytes in total, so a headshot is kept as a thumbnail. */
export const MAX_EDGE = 520;
export const MAX_BYTES = 400 * 1024;

/**
 * An image reduced to something a browser store can hold. A reference frame
 * only has to be recognisable, so it is kept smaller than a headshot.
 */
export async function readImageFile(file, { maxEdge = MAX_EDGE, quality = 0.72 } = {}) {
  const data = await shrinkImage(file, maxEdge, quality);
  return { name: file.name, type: 'image/jpeg', data, kind: 'image' };
}

export async function readPortfolio(file) {
  if (!file) return null;

  if (!file.type.startsWith('image/')) {
    // A PDF cannot be shrunk, and a few of them would fill the whole store.
    if (file.size > MAX_BYTES) {
      throw new Error(
        `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Attach a photo, or a PDF under 400KB — everything is kept in this browser.`,
      );
    }
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
      reader.readAsDataURL(file);
    });
    return { name: file.name, type: file.type, data, kind: 'file' };
  }

  return readImageFile(file);
}

function shrinkImage(file, maxEdge = MAX_EDGE, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(`${file.name} is not an image this browser can open.`));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
