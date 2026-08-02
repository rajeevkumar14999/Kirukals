import { useEffect, useState } from 'react';
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
              <button className="linkish" title="Delete this script" onClick={() => onDelete(f.id)}>✕</button>
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

export function ExportPickDialog({ onPick, onPrint, onClose }) {
  return (
    <Modal title="Export" onClose={onClose}>
      <ul className="exportpick">
        <li>
          <button onClick={() => { onPrint(); onClose(); }}>
            <b>PDF</b>
            <span>Opens the print dialog — choose “Save as PDF”, margins None.</span>
          </button>
        </li>
        {FORMATS.map(([id, label, note]) => (
          <li key={id}>
            <button onClick={() => { onPick(id); onClose(); }}>
              <b>{label}</b>
              <span>{note}</span>
            </button>
          </li>
        ))}
      </ul>
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
