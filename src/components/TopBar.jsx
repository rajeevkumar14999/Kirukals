import { useEffect, useRef, useState } from 'react';
import { TYPE_ORDER, TYPES } from '../screenplay/elements';
import { isAdmin } from '../auth/session';
import MenuBar from './MenuBar';
import { formatLeft } from '../billing/trial';
import '../styles/billing.css';
import '../styles/community.css';

export default function TopBar({
  doc,
  activeType,
  onSetType,
  onRenameTitle,
  undo,
  redo,
  canUndo,
  canRedo,
  prefs,
  setPrefs,
  onExport,
  onPrint,
  onTitlePage,
  menus,
  onFind,
  onComment,
  onWatermark,
  onNewScript,
  onShortcuts,
  onChangePassword,
  savedAt,
  syncState,
  stats,
  session,
  onSignOut,
  onOpenAdmin,
  onOpenProfile,
  unread,
  subscription,
  trialMs,
  canInstall,
  onInstall,
}) {
  const [menu, setMenu] = useState(false);
  const [account, setAccount] = useState(false);
  const menuRef = useRef(null);
  const accountRef = useRef(null);

  useEffect(() => {
    if (!menu && !account) return undefined;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(false);
      if (!accountRef.current?.contains(e.target)) setAccount(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu, account]);

  const initials = (session?.name || 'Guest')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <header className="topbar">
      <div className="topbar__left">
        <span className="brand">
          <span className="brand__mark">◗</span>
          Kirukals
        </span>

        {/* Everything the app can do lives here, so the bar itself can stay
            almost empty. */}
        <MenuBar menus={menus} />

        <input
          className="topbar__title"
          value={doc.titlePage?.title || ''}
          placeholder="Untitled Screenplay"
          onChange={(e) => onRenameTitle(e.target.value)}
          aria-label="Script title"
        />
        <span className="topbar__saved">
          {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : 'Saving…'}
        </span>
      </div>

      <div className="topbar__center">
        <select
          className="type-select"
          value={activeType || 'action'}
          onChange={(e) => onSetType(e.target.value)}
          aria-label="Element type"
        >
          {TYPE_ORDER.map((t, i) => (
            <option key={t} value={t}>
              {TYPES[t].label}  (Ctrl+{i + 1})
            </option>
          ))}
        </select>
      </div>

      <div className="topbar__right">
        <span className="pagecount">{stats.pageCount} pp · ~{stats.runtime} min</span>

        {session?.guest ? (
          // A guest cannot subscribe, so this is a warning rather than a button:
          // when it reaches zero their drafts are erased.
          trialMs != null && (
            <span
              className={`plan-chip plan-chip--guest${trialMs < 2 * 60_000 ? ' plan-chip--urgent' : ''}`}
              title="Guest drafts are erased when the 10 minutes are up. Create an account to keep them."
            >
              Guest · {formatLeft(trialMs)}
            </span>
          )
        ) : (
          // Status only — upgrading and renewing live in the profile, under
          // Membership, next to everything else about the account. The chip
          // appears only when it has something true to report.
          (subscription?.status === 'active' ||
            subscription?.status === 'pending' ||
            subscription?.status === 'expired' ||
            (trialMs != null && trialMs > 0)) && (
            <span
              className={[
                'plan-chip',
                'plan-chip--static',
                subscription?.status === 'active' ? 'plan-chip--pro' : '',
                subscription?.status === 'pending' ? 'plan-chip--pending' : '',
                // The last two minutes read as urgent rather than decorative.
                trialMs != null && trialMs > 0 && trialMs < 2 * 60_000 ? 'plan-chip--urgent' : '',
              ].filter(Boolean).join(' ')}
              title={
                subscription?.status === 'active'
                  ? `Pro — ${subscription.daysLeft} days left. Manage it in your profile.`
                  : 'Membership lives in your profile'
              }
            >
              {subscription?.status === 'active'
                ? `Pro · ${subscription.daysLeft}d`
                : subscription?.status === 'pending'
                  ? 'Payment pending'
                  : trialMs != null && trialMs > 0
                    ? `Free trial · ${formatLeft(trialMs)}`
                    : 'Membership expired'}
            </span>
          )
        )}

        {/* Find, Comment and Focus live in the Menu, where every other command
            already is. Their shortcuts are bound globally, so nothing here was
            the only way to reach them. */}
        {canInstall && (
          <button
            className="btn"
            onClick={onInstall}
            title="Install Kirukals so it opens in its own window and works offline"
          >
            Install
          </button>
        )}
        <button
          className="bell"
          onClick={() => onOpenProfile(unread ? 'alerts' : 'board')}
          title={unread ? `${unread} new notification${unread === 1 ? '' : 's'}` : 'Community'}
          aria-label="Community and notifications"
        >
          ⌂
          {unread > 0 && <span className="bell__count">{unread > 9 ? '9+' : unread}</span>}
        </button>

        <div className="menu" ref={accountRef}>
          <button
            className={`avatar${session?.guest ? ' avatar--guest' : ''}`}
            onClick={() => setAccount((a) => !a)}
            title={session?.name}
            aria-label="Account"
          >
            {session?.guest ? 'G' : initials}
          </button>
          {account && (
            <ul className="menu__list menu__list--account">
              <li className="account__head">
                <b>{session?.name}</b>
                <span>{session?.guest ? 'Guest session — drafts clear on sign out' : session?.email}</span>
                {/* Where this account's work has got to, said where the
                    account is — not in the corner of the writing. */}
                {syncState && syncState.state !== 'idle' && (
                  <em className={`account__sync account__sync--${syncState.state}`}>
                    {syncState.state === 'syncing' && 'Syncing with the server…'}
                    {syncState.state === 'synced' && (
                      <>
                        In the cloud
                        {syncState.at ? ` · ${new Date(syncState.at).toLocaleTimeString()}` : ''}
                        {syncState.pulled > 0 ? ` · ${syncState.pulled} brought down` : ''}
                      </>
                    )}
                    {syncState.state === 'error' && (
                      <span title={syncState.message}>
                        On this computer only — the server could not be reached
                      </span>
                    )}
                  </em>
                )}
              </li>
              <li className="menu__sep">
                <button onClick={() => { setAccount(false); onOpenProfile('board'); }}>
                  Profile &amp; community
                </button>
              </li>
              {!session?.guest && (
                <li>
                  <button onClick={() => { setAccount(false); onOpenProfile('plan'); }}>
                    Membership &amp; payment
                  </button>
                </li>
              )}
              {!session?.guest && (
                <li>
                  <button onClick={() => { setAccount(false); onChangePassword(); }}>
                    Change password
                  </button>
                </li>
              )}
              {isAdmin(session) && (
                <li className="menu__sep">
                  <button onClick={() => { setAccount(false); onOpenAdmin(); }}>Admin dashboard</button>
                </li>
              )}
              <li className="menu__sep">
                <button onClick={() => { setAccount(false); onSignOut(); }}>
                  {session?.guest ? 'Leave guest session' : 'Sign out'}
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </header>
  );
}
