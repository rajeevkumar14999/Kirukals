// The product was called Scriptwriter before it was called Kirukals, and its
// storage keys carried the old prefix. Rename them in place, once, so existing
// accounts, drafts and preferences survive the rebrand. Imported for its side
// effect at the top of main.jsx, before anything reads storage.

const OLD = 'scriptwriter.';
const NEW = 'kirukals.';

function rebrand(store) {
  try {
    for (const key of Object.keys(store)) {
      if (!key.startsWith(OLD)) continue;
      const renamed = NEW + key.slice(OLD.length);
      if (store.getItem(renamed) === null) store.setItem(renamed, store.getItem(key));
      store.removeItem(key);
    }
  } catch {
    /* private mode or a full quota: carry on with whatever we have */
  }
}

rebrand(localStorage);
rebrand(sessionStorage);
