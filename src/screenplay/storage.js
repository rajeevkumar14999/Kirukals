import { makeElement } from './elements';
import { normaliseElement } from './markup';

// Every signed-in account (and the guest) gets its own script library, keyed by
// the session's uid. `setScope` must run before anything else touches storage.
let scope = 'guest';

const INDEX_KEY = () => `kirukals.index.${scope}`;
const DOC_KEY = (id) => `kirukals.doc.${scope}.${id}`;
const PREFS_KEY = 'kirukals.prefs';

const LEGACY_INDEX = 'kirukals.index';
const LEGACY_DOC = (id) => `kirukals.doc.${id}`;
const LEGACY_DONE = 'kirukals.migrated';

export function setScope(uid) {
  scope = uid || 'guest';
  adoptLegacyLibrary();
}

// Scripts written before accounts existed sit in un-scoped keys. Merge them
// into the first library that opens — once — so nobody loses a draft to the
// upgrade and no second account inherits a copy.
function adoptLegacyLibrary() {
  if (localStorage.getItem(LEGACY_DONE)) return;
  const legacy = localStorage.getItem(LEGACY_INDEX);
  if (!legacy) {
    localStorage.setItem(LEGACY_DONE, '1');
    return;
  }
  try {
    const entries = JSON.parse(legacy) || [];
    for (const entry of entries) {
      const doc = localStorage.getItem(LEGACY_DOC(entry.id));
      if (doc) localStorage.setItem(DOC_KEY(entry.id), doc);
      localStorage.removeItem(LEGACY_DOC(entry.id));
    }
    const existing = loadIndex().filter((d) => !entries.some((e) => e.id === d.id));
    localStorage.setItem(INDEX_KEY(), JSON.stringify([...entries, ...existing]));
  } catch {
    /* nothing worth rescuing */
  }
  localStorage.removeItem(LEGACY_INDEX);
  localStorage.setItem(LEGACY_DONE, '1');
}

// Guest work is deliberately temporary — clear it when the guest signs out.
export function clearScope(uid) {
  const prev = scope;
  scope = uid || 'guest';
  for (const entry of loadIndex()) localStorage.removeItem(DOC_KEY(entry.id));
  localStorage.removeItem(INDEX_KEY());
  scope = prev;
}

/**
 * A browser gives a site a few megabytes and then simply refuses. Left
 * unhandled that refusal throws in the middle of an edit, React unmounts, and
 * the writer loses the page they were on — the worst failure this app has.
 *
 * So every write goes through here: the throw is caught, the previous saved
 * copy is left untouched, and the caller is handed something it can explain.
 */
export class StorageFullError extends Error {
  constructor(bytes) {
    super(
      `This browser's storage is full${bytes ? ` (this script is ${(bytes / 1024 / 1024).toFixed(1)}MB)` : ''}. ` +
        'Nothing was lost — the last saved copy is intact. Remove some uploaded images, ' +
        'or back the script up and delete an old one.',
    );
    this.name = 'StorageFullError';
    this.bytes = bytes;
  }
}

const isQuotaError = (e) =>
  e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);

function write(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (isQuotaError(e)) throw new StorageFullError(value.length);
    throw e;
  }
}

/** Roughly what this account is using, for the warning before the wall. */
export function usageBytes() {
  let total = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith('kirukals.')) continue;
    total += key.length + (localStorage.getItem(key)?.length || 0);
  }
  return total;
}

/** Browsers stop at about five megabytes; warn while there is still room. */
export const STORAGE_BUDGET = 5 * 1024 * 1024;
export const usageRatio = () => usageBytes() / STORAGE_BUDGET;

const uid = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function blankDoc(name = 'Untitled Screenplay') {
  return {
    id: uid(),
    name,
    titlePage: {
      title: name,
      credit: 'Written by',
      author: '',
      source: '',
      draftDate: new Date().toLocaleDateString(),
      contact: '',
    },
    elements: [
      makeElement('scene_heading', 'INT. COFFEE SHOP - DAY'),
      makeElement('action', 'Rain streaks the window. MAYA, 30s, stares at a blinking cursor on her laptop. The blank page stares back.'),
      makeElement('character', 'MAYA'),
      makeElement('parenthetical', '(to herself)'),
      makeElement('dialogue', "Okay. Page one. How hard can it be?"),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadIndex() {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY())) || [];
  } catch {
    return [];
  }
}

function saveIndex(list) {
  write(INDEX_KEY(), JSON.stringify(list));
}

export function loadDoc(id) {
  try {
    const raw = localStorage.getItem(DOC_KEY(id));
    if (!raw) return null;
    const doc = JSON.parse(raw);
    // Scripts written before styles were ranges keep their emphasis as `**`
    // characters in the text. Convert once, on the way in.
    return { ...doc, elements: (doc.elements || []).map(normaliseElement) };
  } catch {
    return null;
  }
}

export function saveDoc(doc) {
  const stamped = { ...doc, updatedAt: Date.now() };
  // The document goes down first: if it does not fit, the index is never
  // touched, so the library still points at the last copy that did.
  write(DOC_KEY(doc.id), JSON.stringify(stamped));
  const index = loadIndex().filter((d) => d.id !== doc.id);
  index.unshift({
    id: doc.id,
    name: doc.titlePage?.title || doc.name,
    updatedAt: stamped.updatedAt,
    pages: doc.elements.length,
  });
  saveIndex(index);
  return stamped;
}

export function deleteDoc(id) {
  localStorage.removeItem(DOC_KEY(id));
  saveIndex(loadIndex().filter((d) => d.id !== id));
}

/** How many scripts a given account holds — read without switching scope. */
export function scriptCountFor(uid) {
  try {
    return (JSON.parse(localStorage.getItem(`kirukals.index.${uid}`)) || []).length;
  } catch {
    return 0;
  }
}

export function loadPrefs() {
  try {
    return { theme: 'dark', zoom: 1, focusMode: false, ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { theme: 'dark', zoom: 1, focusMode: false };
  }
}

export function savePrefs(prefs) {
  try {
    write(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are not worth interrupting anyone over.
  }
}
