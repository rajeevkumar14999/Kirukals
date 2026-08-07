import { useEffect, useState } from 'react';
import TrashIcon from './TrashIcon';
import { Modal } from './Dialogs';
import { IMPORT_ACCEPT } from '../screenplay/import';
import { canPickFolder, forgetFolder, pickFolder } from '../screenplay/backup';

/* ------------------------------- portfolio ------------------------------- */

/** Everything written under this account, in one place. */
export function PortfolioDialog({ index, currentId, onOpen, onDelete, onNew, onImportFile, onClose }) {
  const [query, setQuery] = useState('');
  const shown = index.filter((f) => !query || (f.name || '').toLowerCase().includes(query.toLowerCase()));

  return (
    <Modal title="Portfolio" onClose={onClose} wide>
      <div className="portfolio__bar">
        <input
          className="sidebar__search"
          placeholder="Search scripts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn btn--primary" onClick={() => { onNew(); onClose(); }}>New project</button>
        <label className="btn">
          Import
          <input
            type="file"
            accept={IMPORT_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) { onImportFile(file); onClose(); }
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {shown.length === 0 && <p className="hint">Nothing here yet.</p>}
      <ul className="portfolio">
        {shown.map((f) => (
          <li key={f.id} className={f.id === currentId ? 'is-current' : ''}>
            <button onClick={() => { onOpen(f.id); onClose(); }}>
              <b>{f.name || 'Untitled'}</b>
              <span>
                {new Date(f.updatedAt).toLocaleString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
                {f.id === currentId ? ' · open' : ''}
              </span>
            </button>
            {f.id !== currentId && (
              <button className="linkish" title="Delete this script" onClick={() => onDelete(f.id)}><TrashIcon /></button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* -------------------------------- backups -------------------------------- */

export function BackupsDialog({ backup, doc, onBackupNow, onDownload, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [folderName, setFolderName] = useState(backup.folderName);

  useEffect(() => setFolderName(backup.folderName), [backup.folderName]);

  const choose = async () => {
    setError(null);
    setBusy(true);
    try {
      const name = await pickFolder();
      if (name) {
        setFolderName(name);
        await onBackupNow();
      }
    } catch (e) {
      // A cancelled picker is not a failure worth shouting about.
      if (e?.name !== 'AbortError') setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="External backups" onClose={onClose}>
      <p className="hint">
        Your scripts live in this browser's storage. That is fast and works offline, but it is
        also as durable as this browser profile — clearing site data would take everything with
        it. Pointing Kirukals at a real folder keeps a plain <b>.json</b> copy of each script on
        disk, rewritten every time it saves.
      </p>

      {canPickFolder() ? (
        <>
          <div className="backup__row">
            <span>{folderName ? `Backing up to ${folderName}` : 'No folder chosen'}</span>
            <button className="btn" disabled={busy} onClick={choose}>
              {folderName ? 'Change folder' : 'Choose folder'}
            </button>
          </div>

          {folderName && (
            <div className="backup__row">
              <span>
                {backup.lastWrite
                  ? `Last written ${new Date(backup.lastWrite).toLocaleTimeString()}`
                  : 'Nothing written yet this session'}
              </span>
              <span className="backup__actions">
                <button className="btn" disabled={busy} onClick={onBackupNow}>Back up now</button>
                <button className="btn" onClick={() => { forgetFolder(); setFolderName(null); }}>Stop</button>
              </span>
            </div>
          )}

          <p className="hint">
            The browser asks permission for the folder once per session, so after a restart the
            first save re-opens that prompt. The panel says plainly whether a copy has been
            written this session.
          </p>
          {error && <p className="hint hint--error">{error}</p>}
        </>
      ) : (
        <p className="hint">
          This browser has no folder access — that API is only in Chrome and Edge. You can still
          save a copy by hand.
        </p>
      )}

      <div className="modal__actions">
        <button className="btn" onClick={() => onDownload(doc)}>Download a copy now</button>
        <button className="btn btn--primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

/* -------------------------------- export --------------------------------- */

const FORMATS = [
  ['fdx', 'Final Draft (.fdx)', 'What most production offices and script readers expect.'],
  ['fountain', 'Fountain (.fountain)', 'Plain text every screenplay app can read. The safest archive.'],
  ['txt', 'Plain text (.txt)', 'The page as characters — for email, or a phone with nothing installed.'],
  ['json', 'Backup (.json)', 'Everything, including comments, tags and notes. Only Kirukals reads it.'],
];

/**
 * Export, in the order a writer thinks about it.
 *
 * Name the file, choose what kind of file it is, then say where it goes. The
 * last part belongs to the operating system — a save dialog the writer already
 * knows how to drive, which opens in the folder their scripts live in. Picking
 * a format and picking a folder are two different decisions, and a dialog that
 * folds them together makes the writer answer both at once.
 */
export function ExportPickDialog({ doc, onPick, onClose }) {
  const suggested = ((doc?.titlePage?.title || doc?.name || 'Untitled')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()) || 'Untitled';
  const [name, setName] = useState(suggested);
  const [kind, setKind] = useState('pdf');
  const [working, setWorking] = useState(false);

  const KINDS = [
    ['pdf', 'PDF', 'For sending to anyone. The pages exactly as they print.'],
    ['fountain', 'Fountain (.fountain)', 'Plain text any screenwriting app can read.'],
    ['fdx', 'Final Draft (.fdx)', 'Opens in Final Draft.'],
    ['txt', 'Plain text (.txt)', 'The words, without the formatting.'],
    ['json', 'Kirukals backup (.json)', 'Everything, to restore later.'],
  ];
  const note = KINDS.find(([id]) => id === kind)?.[2];

  const go = async () => {
    setWorking(true);
    try {
      const res = await onPick(kind, (name || 'Untitled').trim());
      // Backing out of the save dialog returns you here, with the filename
      // still typed, rather than throwing the whole thing away.
      if (res && res.canceled) return;
      onClose();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal title="Export" onClose={onClose}>
      <div className="form">
        <label>
          <span>Filename</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !working) go(); }}
            placeholder="Untitled"
          />
        </label>

        <label>
          <span>File type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>

        <p className="hint">{note}</p>
      </div>

      <div className="modal__actions">
        <button className="btn" onClick={onClose} disabled={working}>Cancel</button>
        <button className="btn btn--primary" onClick={go} disabled={working || !name.trim()}>
          {working ? 'Exporting…' : 'Export'}
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------- add document ---------------------------- */

export function NewDocumentDialog({ onCreate, onClose }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Add document" onClose={onClose}>
      <div className="form">
        <label>
          <span>Name</span>
          <input
            autoFocus
            value={name}
            placeholder="Outline, research, character notes…"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) { onCreate(name.trim()); onClose(); }
            }}
          />
        </label>
      </div>
      <p className="hint">
        A plain writing surface that lives inside this project. It is never printed, exported or
        counted in the page count — it is for you.
      </p>
      <div className="modal__actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn btn--primary"
          disabled={!name.trim()}
          onClick={() => { onCreate(name.trim()); onClose(); }}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}
