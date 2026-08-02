import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * The menu that opens off the dock.
 *
 * It is a command list before it is a menu: everything is searchable, so a
 * writer who knows the name of a thing never has to remember which group it
 * was filed under.
 */
export default function MenuPanel({ items, onClose }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click anywhere else and the menu goes away, as menus do.
  useEffect(() => {
    const away = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target) && !e.target.closest('.dock')) {
        onClose();
      }
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [onClose]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) => !it.group && (it.label.toLowerCase().includes(q) || it.keywords?.includes(q)),
    );
  }, [items, query]);

  const runnable = shown.filter((it) => !it.group && !it.disabled);

  const run = (item) => {
    if (!item || item.disabled) return;
    onClose();
    item.run();
  };

  return (
    <div className="menupanel" ref={boxRef} role="dialog" aria-label="Menu">
      <header className="menupanel__head">
        <span>▾ Menu</span>
        {/* Which build is actually running. When something looks unchanged,
            this is the first thing to check. */}
        <em title="The build this app is running">{typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}</em>
      </header>

      <div className="menupanel__search">
        <input
          ref={inputRef}
          value={query}
          placeholder="Search menu"
          aria-label="Search menu"
          onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, runnable.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); run(runnable[cursor]); }
          }}
        />
        <kbd>Alt+/</kbd>
      </div>

      <ul className="menupanel__list">
        {shown.length === 0 && <li className="menupanel__empty">Nothing matches “{query}”.</li>}
        {shown.map((it) =>
          it.group ? (
            <li className="menupanel__group" key={`g-${it.label}`}>{it.label}</li>
          ) : (
            <li key={it.id}>
              <button
                className={runnable[cursor]?.id === it.id ? 'is-cursor' : ''}
                disabled={it.disabled}
                title={it.note || ''}
                onClick={() => run(it)}
                onMouseEnter={() => {
                  const i = runnable.findIndex((r) => r.id === it.id);
                  if (i >= 0) setCursor(i);
                }}
              >
                <span>{it.label}</span>
                {it.badge && <em className="menupanel__badge">{it.badge}</em>}
                {it.shortcut && <kbd>{it.shortcut}</kbd>}
                {it.arrow && <i aria-hidden="true">›</i>}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
