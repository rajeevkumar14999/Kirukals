import '../styles/dock.css';

/**
 * The rail down the left edge.
 *
 * Everything the app can show is one click away from here: the panels are
 * mutually exclusive, so the rail is also the answer to "where am I".
 */
const ICONS = {
  menu: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  ),
  project: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5" />
    </svg>
  ),
  cards: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  comments: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  ),
  preproduction: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 8h18v12H3z" />
      <path d="M3 8l1.6-3.6 16-1.4L21 8" />
      <path d="M8.4 4.1L10 8M13.4 3.8L15 7.7" />
    </svg>
  ),
  tools: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 3a5 5 0 0 0-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 1 0 15 3z" />
    </svg>
  ),
  analysis: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
    </svg>
  ),
  help: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.6 2.6 0 1 1 3.4 2.5c-.6.3-.9.8-.9 1.5v.5" />
      <path d="M12 17.2h.01" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  ),
};

const TOP = [
  { id: 'menu', label: 'Menu' },
  { id: 'project', label: 'Project' },
  { id: 'cards', label: 'Cards' },
  { id: 'comments', label: 'Comments' },
  { id: 'preproduction', label: 'Preprod' },
  { id: 'tools', label: 'Tools' },
  { id: 'analysis', label: 'Analysis' },
];

/**
 * Declared out here on purpose. Defined inside Dock it would be a new
 * component type on every render, so React would throw away every button and
 * build it again — which loses focus mid-interaction and detaches the very
 * node that was just clicked.
 */
function Item({ id, label, on, badge, onClick }) {
  // No waiting to find out whether a second click is coming: a click opens,
  // a double click closes, and since a double click delivers its two clicks
  // first, the pair still ends closed. Holding the first click back behind a
  // timer only made the panel feel slow and land the wrong way when the user
  // was quick.
  return (
    <button
      className={`dock__item${on ? ' is-active' : ''}`}
      onClick={onClick}
      title={label}
      aria-pressed={Boolean(on)}
    >
      {ICONS[id]}
      <i>{label}</i>
      {badge > 0 && <b className="dock__badge">{badge > 9 ? '9+' : badge}</b>}
    </button>
  );
}

export default function Dock({
  active, menuOpen, badges = {}, theme, onSelect, onMenu, onToggleTheme,
}) {
  return (
    <nav className="dock" aria-label="Sections">
      <div className="dock__group">
        {TOP.map((t) => (
          <Item
            key={t.id}
            id={t.id}
            label={t.label}
            badge={badges[t.id]}
            on={t.id === 'menu' ? menuOpen : active === t.id}
            onClick={t.id === 'menu' ? onMenu : () => onSelect(t.id)}
          />
        ))}
      </div>

      <div className="dock__group dock__group--foot">
        {/* The one setting people reach for constantly. It was in the menu and
            nobody found it there. */}
        <Item
          id={theme === 'dark' ? 'light' : 'dark'}
          label={theme === 'dark' ? 'Light' : 'Dark'}
          onClick={onToggleTheme}
        />
      </div>
    </nav>
  );
}
