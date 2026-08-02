/**
 * External backups.
 *
 * Everything Kirukals holds lives in this browser's storage, which is exactly
 * as durable as the browser profile — clear the site data and it is gone. So
 * the app can also keep a copy in a real folder on the disk, written through
 * the File System Access API with a folder the writer picks themselves.
 *
 * The handle cannot outlive the session in a way we can rely on (permission is
 * re-asked, and Firefox and Safari have no API at all), so the honest thing is
 * to say plainly whether a copy has been written this session.
 */

export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

let folder = null;
let lastWrite = null;
const listeners = new Set();

const announce = () => listeners.forEach((fn) => fn(state()));

export const state = () => ({
  supported: canPickFolder(),
  folderName: folder?.name || null,
  lastWrite,
});

export function onBackupState(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Ask for a folder. Returns its name, or null if the writer changed their mind. */
export async function pickFolder() {
  if (!canPickFolder()) throw new Error('This browser cannot write to a folder.');
  const handle = await window.showDirectoryPicker({ id: 'kirukals-backups', mode: 'readwrite' });
  const permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') return null;
  folder = handle;
  announce();
  return handle.name;
}

export function forgetFolder() {
  folder = null;
  lastWrite = null;
  announce();
}

const safeName = (s) =>
  (String(s || 'untitled').trim().replace(/[^\w\d-]+/g, '-').replace(/^-|-$/g, '') || 'untitled')
    .slice(0, 60)
    .toLowerCase();

/**
 * Write one script into the chosen folder as JSON. Same filename every time,
 * so the folder holds the current state of each script rather than a pile of
 * copies.
 */
export async function backupDoc(doc) {
  if (!folder) return false;
  const name = `${safeName(doc.titlePage?.title || doc.name)}-${doc.id}.json`;
  const file = await folder.getFileHandle(name, { create: true });
  const stream = await file.createWritable();
  await stream.write(JSON.stringify(doc, null, 2));
  await stream.close();
  lastWrite = Date.now();
  announce();
  return true;
}
