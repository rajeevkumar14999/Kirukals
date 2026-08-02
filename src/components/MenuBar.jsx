import { useEffect, useRef, useState } from 'react';

/**
 * The menu bar.
 *
 * Seven menus, because that is how many kinds of thing this app does. Every
 * command in Kirukals is reachable from here, which is the point of a menu
 * bar: the toolbar can then carry only what is worth a permanent button, and
 * nothing has to be hunted for.
 *
 * It behaves the way a menu bar has behaved since 1984 — click to open, hover
 * to move between menus once one is open, Escape to close, arrows to walk the
 * items — because that is what people's hands already know.
 */
export default function MenuBar({ menus }) {
  const [open, setOpen] = useState(null);
  const [cursor, setCursor] = useState(-1);
  const barRef = useRef(null);

  useEffect(() => {
    if (open === null) return undefined;
    const away = (e) => {
      if (!barRef.current?.contains(e.target)) setOpen(null);
    };
    const key = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const run = (item) => {
    if (item.disabled) return;
    setOpen(null);
    item.run?.();
  };

  return (
    <nav className="menubar" ref={barRef} aria-label="Main menu">
      {menus.map((menu, i) => {
        const isOpen = open === i;
        const items = typeof menu.items === 'function' ? menu.items() : menu.items;

        return (
          <div className="menubar__menu" key={menu.label}>
            <button
              className={`menubar__title${isOpen ? ' is-open' : ''}`}
              aria-expanded={isOpen}
              aria-haspopup="menu"
              onClick={() => { setOpen(isOpen ? null : i); setCursor(-1); }}
              // Once one menu is open, sliding along the bar opens the others,
              // which is what makes a menu bar quick to scan.
              onMouseEnter={() => open !== null && open !== i && setOpen(i)}
            >
              {menu.label}
            </button>

            {isOpen && (
              <ul
                className="menubar__list"
                role="menu"
                onKeyDown={(e) => {
                  const usable = items.filter((it) => !it.sep && !it.disabled);
                  if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, usable.length - 1)); }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
                  if (e.key === 'Enter' && usable[cursor]) { e.preventDefault(); run(usable[cursor]); }
                }}
              >
                {items.map((item, n) =>
                  item.sep ? (
                    <li className="menubar__sep" key={`sep-${n}`} role="separator" />
                  ) : (
                    <li key={item.label} role="none">
                      <button
                        role="menuitem"
                        disabled={item.disabled}
                        title={item.note || ''}
                        onClick={() => run(item)}
                      >
                        <span>
                          {item.on !== undefined && (
                            <i className="menubar__tick" aria-hidden="true">{item.on ? '✓' : ''}</i>
                          )}
                          {item.label}
                        </span>
                        {item.keys && <kbd>{item.keys}</kbd>}
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}
