/**
 * The picture vault.
 *
 * Reference shots, location photographs and costume boards live here: on this
 * machine, in this browser's own database, and nowhere else. That is the point
 * — the same reason the scripts never leave, applied to the pictures, which
 * are often more revealing than the pages. A location photograph has a street
 * in it.
 *
 * Why IndexedDB rather than the store the scripts use:
 *
 *   localStorage holds text, so a picture has to be base64 first — which makes
 *   it a third larger — and everything shares one cap of about five megabytes.
 *   A dozen reference shots fill it, and then a script cannot be saved.
 *
 *   IndexedDB holds the file itself, at its own size, with a limit measured in
 *   hundreds of megabytes or more.
 *
 * What is kept in the script is a reference — a short id. The picture is
 * fetched when it is shown and released when it is not, so a shot list of two
 * hundred images does not sit in memory at once.
 */

const DB = 'kirukals-media';
const STORE = 'images';
const VERSION = 1;

let open;

function database() {
  if (open) return open;
  open = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('This browser would not open its picture store.'));
  });
  return open;
}

const run = async (mode, work) => {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result;
    try {
      result = work(store);
    } catch (err) {
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('The picture store refused the change.'));
  });
};

const newId = () => `img_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Put a picture in, and get back the reference to write into the script.
 *
 * `at` is recorded so a vault can be swept of pictures no script mentions —
 * deleting a shot should not silently leave its photograph behind forever.
 */
export async function keep(blob, meta = {}) {
  const id = newId();
  await run('readwrite', (store) =>
    store.put({
      id,
      blob,
      name: meta.name || 'picture',
      type: blob.type || meta.type || 'image/jpeg',
      bytes: blob.size,
      at: Date.now(),
    }),
  );
  return id;
}

export const fetchOne = (id) => run('readonly', (store) => store.get(id));

/** Everything, for a backup. */
export const fetchAll = () => run('readonly', (store) => store.getAll());

export const drop = (id) => run('readwrite', (store) => store.delete(id));

/**
 * A picture's address for an <img>.
 *
 * Object URLs are cached, because the same reference shot is drawn every time
 * the list re-renders and minting a new URL each time leaks them.
 */
const urls = new Map();

export async function url(id) {
  if (!id) return null;
  if (urls.has(id)) return urls.get(id);
  const row = await fetchOne(id);
  if (!row?.blob) return null;
  const made = URL.createObjectURL(row.blob);
  urls.set(id, made);
  return made;
}

export function forget(id) {
  const made = urls.get(id);
  if (made) {
    URL.revokeObjectURL(made);
    urls.delete(id);
  }
}

/** What the vault is holding, for the storage figure on screen. */
export async function usage() {
  const all = await fetchAll();
  return {
    count: all.length,
    bytes: all.reduce((n, row) => n + (row.bytes || row.blob?.size || 0), 0),
  };
}

/**
 * Take a picture out of a backup and put it back under its own id.
 *
 * The id is kept rather than made afresh, because the scripts in the same
 * backup refer to it by that id — restoring under a new one would restore
 * every photograph and attach none of them.
 */
export async function restore(row) {
  if (!row?.id || !row.blob) return null;
  await run('readwrite', (store) => store.put(row));
  return row.id;
}

/** A data URL from an older script, moved into the vault as a real file. */
export async function adopt(dataUrl, meta = {}) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null;
  const blob = await (await fetch(dataUrl)).blob();
  return keep(blob, meta);
}

/**
 * Pictures nothing refers to any more.
 *
 * Given every reference the scripts still hold, anything else is a photograph
 * whose shot was deleted. Swept rather than deleted on the spot because a shot
 * can be un-deleted, and a picture that is gone cannot.
 */
export async function sweep(stillUsed) {
  const keep_ = new Set(stillUsed);
  const all = await fetchAll();
  const stale = all.filter((row) => !keep_.has(row.id));
  for (const row of stale) await drop(row.id);
  return stale.length;
}
