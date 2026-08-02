import { useEffect, useMemo, useRef, useState } from 'react';
import { TYPES, TYPE_ORDER } from '../screenplay/elements';

export function Modal({ title, onClose, children, wide, blocking }) {
  useEffect(() => {
    if (blocking) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, blocking]);

  return (
    <div
      className={`modal-backdrop${blocking ? ' modal-backdrop--blocking' : ''}`}
      onMouseDown={blocking ? undefined : onClose}
    >
      <div
        className={`modal${wide ? ' modal--wide' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal__head">
          <h2>{title}</h2>
          {!blocking && (
            <button className="btn" onClick={onClose} aria-label="Close">✕</button>
          )}
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

const FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'credit', label: 'Credit', placeholder: 'Written by' },
  { key: 'author', label: 'Author(s)' },
  { key: 'source', label: 'Source', placeholder: 'Based on the novel by…' },
  { key: 'draftDate', label: 'Draft date' },
];

export function TitlePageDialog({ titlePage, onChange, onClose }) {
  return (
    <Modal title="Title page" onClose={onClose}>
      <div className="form">
        {FIELDS.map((f) => (
          <label key={f.key}>
            <span>{f.label}</span>
            <input
              value={titlePage[f.key] || ''}
              placeholder={f.placeholder || ''}
              onChange={(e) => onChange({ ...titlePage, [f.key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          <span>Contact</span>
          <textarea
            rows={4}
            value={titlePage.contact || ''}
            placeholder={'Name\nEmail\nPhone'}
            onChange={(e) => onChange({ ...titlePage, contact: e.target.value })}
          />
        </label>
      </div>
      <p className="hint">The title page is included when you print, export to PDF, Fountain or Final Draft.</p>
    </Modal>
  );
}

/**
 * A watermark is what you put on a draft before it leaves your hands: the name
 * of whoever is receiving it, stamped across every page, so a leaked copy says
 * where it came from. It belongs to the script rather than to this browser, so
 * it travels with the file and appears on every printed page.
 */
export function WatermarkDialog({ watermark, onChange, onClose }) {
  const wm = { enabled: false, text: 'CONFIDENTIAL', opacity: 0.12, ...(watermark || {}) };
  const set = (patch) => onChange({ ...wm, ...patch });

  return (
    <Modal title="Watermark" onClose={onClose}>
      <div className="form">
        <label className="form__check">
          <input
            type="checkbox"
            checked={wm.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          <span>Stamp a watermark across every page</span>
        </label>

        <label>
          <span>Text</span>
          <input
            value={wm.text}
            placeholder="CONFIDENTIAL"
            maxLength={40}
            onChange={(e) => set({ text: e.target.value })}
          />
        </label>

        <label>
          <span>Strength</span>
          <input
            type="range"
            min="4"
            max="40"
            value={Math.round(wm.opacity * 100)}
            onChange={(e) => set({ opacity: Number(e.target.value) / 100 })}
          />
        </label>
      </div>

      {/* What it will look like, at the size and angle it prints. */}
      <div className="wm-preview" aria-hidden="true">
        <span style={{ opacity: wm.enabled ? wm.opacity : 0.06 }}>{wm.text || 'CONFIDENTIAL'}</span>
      </div>

      <p className="hint">
        Common uses: a reader's name, <b>DRAFT — NOT FOR CIRCULATION</b>, or a date. Keep it
        faint enough to read through — around 12% is legible on paper without fighting the type.
        It shows on screen and on every page you print or save as PDF.
      </p>
    </Modal>
  );
}

export function FindReplaceDialog({ elements, onJump, onReplaceAll, onClose }) {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => inputRef.current?.focus(), []);

  const hits = useMemo(() => {
    if (!query) return [];
    const found = [];
    const needle = caseSensitive ? query : query.toLowerCase();
    for (const el of elements) {
      const hay = caseSensitive ? el.text : el.text.toLowerCase();
      let from = 0;
      let at;
      while ((at = hay.indexOf(needle, from)) !== -1) {
        found.push({ id: el.id, pos: at, type: el.type, text: el.text });
        from = at + needle.length;
        if (found.length > 300) break;
      }
    }
    return found;
  }, [query, elements, caseSensitive]);

  return (
    <Modal title="Find & replace" onClose={onClose} wide>
      <div className="find">
        <input ref={inputRef} placeholder="Find…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <input placeholder="Replace with…" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} />
          Match case
        </label>
        <button
          className="btn btn--primary"
          disabled={!query || !hits.length}
          onClick={() => onReplaceAll(query, replacement, caseSensitive)}
        >
          Replace all ({hits.length})
        </button>
      </div>

      <ul className="find__results">
        {query && !hits.length && <li className="empty">No matches.</li>}
        {hits.slice(0, 100).map((h, i) => (
          <li key={`${h.id}-${h.pos}-${i}`}>
            <button onClick={() => { onJump(h.id, h.pos); onClose(); }}>
              <span className="find__type">{TYPES[h.type].short}</span>
              <span className="find__snippet">
                {h.text.slice(Math.max(0, h.pos - 30), h.pos)}
                <mark>{h.text.slice(h.pos, h.pos + query.length)}</mark>
                {h.text.slice(h.pos + query.length, h.pos + query.length + 40)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const SHORTCUTS = [
  ['Ctrl + B / I / U', 'Bold, italic or underline the selection'],
  ['Enter', 'New element (Character → Dialogue → Character…)'],
  ['Shift + Enter', 'Line break inside the current element'],
  ['Tab / Shift + Tab', 'Cycle the element type forwards / backwards'],
  ['Ctrl + 1…7', 'Set element type directly'],
  ['Ctrl + Enter', 'Insert a new scene heading below'],
  ['Backspace (empty line)', 'Revert type to Action, then delete the line'],
  ['Alt + ↑ / ↓', 'Move the current element up or down'],
  ['↑ / ↓', 'Move between elements at the top and bottom edges'],
  ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'],
  ['Ctrl + F', 'Find & replace'],
  ['Ctrl + P', 'Print / save as PDF'],
  ['Ctrl + S', 'Force a save (autosave runs constantly)'],
  ['Esc', 'Dismiss the autocomplete'],
];

export function ShortcutsDialog({ onClose }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <table className="shortcuts">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td><kbd>{k}</kbd></td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        Element order for Ctrl+1…7: {TYPE_ORDER.map((t) => TYPES[t].label).join(', ')}.
      </p>
      <p className="hint">
        Emphasis is stored beside the text, not inside it, so no markup characters ever appear on
        the page. Fountain and Final Draft export carry the styling out, and both read it back in.
      </p>
    </Modal>
  );
}
