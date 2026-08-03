import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import AdminPage from './components/AdminPage';
import ProfilePage from './components/ProfilePage';
import Dock from './components/Dock';
import PadEditor from './components/PadEditor';
import HelpDesk from './components/HelpDesk';
import PasswordDialog from './components/PasswordDialog';
import { buildMenus } from './menus';
import DownloadDialog from './components/DownloadDialog';
import { isDesktopApp } from './downloads';
import AnalysisReport from './components/AnalysisReport';
import Preproduction from './components/Preproduction';
import { emptyBoard } from './screenplay/preproduction';
import {
  BackupsDialog,
  ExportPickDialog,
  NewDocumentDialog,
  PortfolioDialog,
} from './components/ProjectDialogs';
import { backupDoc, onBackupState, state as backupState } from './screenplay/backup';
import MenuPanel from './components/MenuPanel';
import {
  AlternatesDialog,
  FormattingDialog,
  ProgressiveDialog,
  ReadAloudDialog,
  RenameCharacterDialog,
  ScheduleDialog,
  ShortenDialog,
  TaggerDialog,
  WordCountDialog,
} from './components/ToolDialogs';
import { renameCharacter } from './screenplay/tools';
import ChatToasts from './components/ChatToasts';
import SettingsDialog from './components/SettingsDialog';
import AuthPage from './components/AuthPage';
import Editor from './components/Editor';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { currentSession, isAdmin, signOut } from './auth/session';
import { endSession, startTracking } from './auth/activity';
import SubscribeDialog from './components/SubscribeDialog';
import {
  FREE_SCRIPT_LIMIT,
  PRODUCTION_PLAN,
  hasProduction,
  subscriptionFor,
} from './billing/subscription';
import { cachedLicence, refreshLicence, worthChecking } from './billing/licence';
import { ensureTrial, spendTrial, trialLeft } from './billing/trial';
import { unreadCount } from './community/store';
import { getInstallPrompt, install, isInstalled, onInstallable } from './install';
import { isConfigured as hasServer } from './backend/supabase';
import { currentRemoteSession, signOutRemote } from './backend/account';
import { applyPendingUpdate, dismissUpdate, onUpdateReady, updatePending } from './update';

// Read once by the sign-in page to explain why a guest was thrown out.
export const GUEST_EXPIRED_FLAG = 'kirukals.guestExpired';
import { FindReplaceDialog, ShortcutsDialog, TitlePageDialog, WatermarkDialog } from './components/Dialogs';
import { useScriptDoc } from './hooks/useScriptDoc';
import { TYPES } from './screenplay/elements';
import { collectVocabulary, computeStats } from './screenplay/paginate';
import { importScriptFile } from './screenplay/import';
import {
  download,
  printScript,
  toFdx,
  toFountain,
  toPlainText,
} from './screenplay/formats';
import {
  StorageFullError,
  blankDoc,
  clearScope,
  deleteDoc,
  loadDoc,
  loadIndex,
  loadPrefs,
  saveDoc,
  savePrefs,
  setScope,
} from './screenplay/storage';
import './styles/app.css';

const slug = (s) =>
  (s || 'screenplay').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'screenplay';

/**
 * Session gate. Themes are owned up here so the sign-in page and the editor
 * share one preference, and the script library is scoped to the account before
 * any document is read.
 */
export default function App() {
  const [prefs, setPrefs] = useState(() => loadPrefs());
  const [session, setSession] = useState(() => {
    const existing = currentSession();
    if (existing) setScope(existing.uid);
    return existing;
  });

  useEffect(() => savePrefs(prefs), [prefs]);

  // A session held by the server outranks whatever this browser remembers:
  // signing in on one machine should be enough for the next one.
  useEffect(() => {
    if (!hasServer() || session || signingOut.current) return;
    let cancelled = false;
    // A server that cannot be reached simply does not answer here, and the
    // session this device remembers is left standing.
    currentRemoteSession().catch(() => null).then((remote) => {
      if (signingOut.current) return;
      if (!cancelled && remote) {
        setScope(remote.uid);
        setSession(remote);
        ensureTrial(remote.uid);
      }
    });
    return () => { cancelled = true; };
  }, [session]);

  /**
   * Coming back onto the network.
   *
   * A session signed in against the copy on this device is not the real one,
   * so when the connection returns the app asks the server whether it still
   * recognises this browser. If it does, the session is swapped for the
   * server's own and the sync runs; if it does not — the token has expired, or
   * the app was reopened — nothing is disturbed and the work keeps saving
   * where it is, until the next sign-in with a connection sends it up.
   */
  useEffect(() => {
    if (!session?.offline || !hasServer()) return undefined;
    const reconnect = async () => {
      const remote = await currentRemoteSession().catch(() => null);
      if (remote && remote.uid === session.uid) setSession(remote);
    };
    if (navigator.onLine) reconnect();
    window.addEventListener('online', reconnect);
    return () => window.removeEventListener('online', reconnect);
  }, [session]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs.theme]);

  const [view, setView] = useState('editor');
  // Set while signing out, so the session restore below does not race it.
  const signingOut = useRef(false);
  const [profileTab, setProfileTab] = useState('board');
  const [profileThreadId, setProfileThreadId] = useState(null);

  // One activity record per signed-in session, heartbeating while the tab is
  // visible. Started here so it covers the admin view as well as the editor.
  useEffect(() => {
    if (!session) return undefined;
    const stop = startTracking(session);
    return () => {
      stop();
      endSession();
    };
  }, [session]);

  const enter = (next) => {
    setScope(next.uid);
    setSession(next);
    setView('editor');
    // Ten free minutes, once per account — a later sign-in resumes the same
    // clock rather than starting a new one.
    ensureTrial(next.uid);
  };

  const leave = async ({ guestExpired = false } = {}) => {
    // The server session must go first. Clearing the local one while the
    // remote is still alive lets the restore below sign the person straight
    // back in — which is why signing out used to take two attempts.
    signingOut.current = true;
    endSession();
    if (hasServer()) {
      try {
        await signOutRemote();
      } catch {
        /* offline: the local session is cleared regardless */
      }
    }
    // A guest has nowhere to sign back in to, so their drafts go with them.
    // The trial clock deliberately survives sign-out — that is what makes the
    // ten minutes per account rather than per login.
    if (session?.guest) clearScope(session.uid);
    if (guestExpired) sessionStorage.setItem(GUEST_EXPIRED_FLAG, '1');
    signOut();
    setSession(null);
    setView('editor');
    signingOut.current = false;
  };

  if (!session) {
    const guestExpired = sessionStorage.getItem(GUEST_EXPIRED_FLAG) === '1';
    return (
      <AuthPage
        onAuthed={enter}
        guestExpired={guestExpired}
        theme={prefs.theme}
        onToggleTheme={() => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}
      />
    );
  }

  if (view === 'admin' && isAdmin(session)) {
    return <AdminPage session={session} onExit={() => setView('editor')} />;
  }

  if (view === 'profile') {
    return (
      <ProfilePage
        session={session}
        initialTab={profileTab}
        initialThreadId={profileThreadId}
        onExit={() => setView('editor')}
      />
    );
  }

  // Remount the whole editor per account so no state leaks between libraries.
  return (
    <ScriptApp
      key={session.uid}
      session={session}
      onSignOut={leave}
      onGuestExpired={() => leave({ guestExpired: true })}
      onOpenAdmin={() => setView('admin')}
      onOpenProfile={(tab = 'board', threadId = null) => {
        setProfileTab(tab);
        setProfileThreadId(threadId);
        setView('profile');
      }}
      prefs={prefs}
      setPrefs={setPrefs}
    />
  );
}

function ScriptApp({ session, onSignOut, onGuestExpired, onOpenAdmin, onOpenProfile, prefs, setPrefs }) {
  const [index, setIndex] = useState(() => loadIndex());
  const [savedAt, setSavedAt] = useState(null);
  const [dialog, setDialog] = useState(null); // 'title' | 'find' | 'shortcuts'
  const [settingsPage, setSettingsPage] = useState(null); // which Customize page
  const [jump, setJump] = useState(null);
  // Bumped by the toolbar's Comment button; the editor knows which line is live.
  const [commentTick, setCommentTick] = useState(0);
  // Bumped by the menu's dual-dialogue command; the editor knows the line.
  const [dualTick, setDualTick] = useState(0);
  const [notice, setNotice] = useState(null);
  const [billingTick, setBillingTick] = useState(0);
  // Notifications live in storage, so poll rather than subscribe.
  const [unread, setUnread] = useState(() => unreadCount(session.uid));
  // The prompt is captured at startup (see install.js) — read whatever is
  // already waiting, then follow it.
  const [canInstall, setCanInstall] = useState(() => Boolean(getInstallPrompt()));
  const [trialMs, setTrialMs] = useState(() => trialLeft(session.uid));
  const [active, setActive] = useState({ element: null, i: 0 });
  const [section, setSection] = useState('project');
  const [menuOpen, setMenuOpen] = useState(false);
  // The panel beside the rail can be put away to give the page the screen.
  const [panelOpen, setPanelOpen] = useState(true);
  // Which document of this project is on the canvas: the script, the private
  // pad, or one the writer added.
  const [docView, setDocView] = useState('screenplay');
  // Which preproduction sheet is on the canvas, when that section is showing.
  const [ppSheet, setPpSheet] = useState('locations');
  const [backup, setBackup] = useState(() => backupState());
  const [updateReady, setUpdateReady] = useState(false);
  // Set when a save is refused for want of room; cleared by the next save that works.
  const [storageFull, setStorageFull] = useState(null);
  // How the copy on the server is doing. Never blocks the writing.

  // Reopen the most recent script, or start a fresh one on first run.
  const initial = useRef(null);
  if (!initial.current) {
    const first = loadIndex()[0];
    initial.current = (first && loadDoc(first.id)) || saveDoc(blankDoc());
  }

  const { doc, update, reset, undo, redo, canUndo, canRedo } = useScriptDoc(initial.current);

  // Derived from the payment ledger, so a verified payment shows up as soon as
  // the dialog closes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  /**
   * What the server says about this account.
   *
   * Asked on the way in and every few hours after, and remembered in
   * between so a lost connection is not a lost month. The machine no
   * longer decides whether it has been paid for.
   */
  const [licence, setLicence] = useState(() => cachedLicence(session.uid));

  useEffect(() => {
    if (session.guest) return undefined;
    let stopped = false;
    const ask = () => {
      if (!worthChecking(session.uid)) return;
      refreshLicence(session.uid).then((found) => { if (!stopped) setLicence(found); });
    };
    ask();
    const timer = setInterval(ask, 60 * 60 * 1000);
    return () => { stopped = true; clearInterval(timer); };
  }, [session.uid, session.guest]);

  const subscription = useMemo(() => subscriptionFor(session.uid), [session.uid, billingTick]);

  // Paid is what the server says. The old on-device ledger is still honoured
  // so that nobody who was already approved is suddenly not.
  const paid = licence.active || subscription.status === 'active';
  const isPro = paid;
  // Preproduction is sold on its own; billingTick refreshes it after a payment.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // One price now buys the whole program, preproduction included. The old
  // separate production plan is still honoured for anybody who bought it.
  const production = paid || hasProduction(session); // eslint-disable-line
  // Whoever administers this install is not charged to use their own app.
  const exempt = isPro || session.role === 'admin';

  /**
   * Burn trial time only while the tab is visible, and only for accounts that
   * have not paid. When it runs out the paywall opens and stays open.
   */
  useEffect(() => {
    if (exempt) return undefined;

    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      const delta = now - last;
      last = now;
      if (document.visibilityState !== 'visible') return;
      setTrialMs(spendTrial(session.uid, delta));
    };

    const timer = setInterval(tick, 1000);
    const onVisible = () => { last = Date.now(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [exempt, session.uid]);

  /**
   * The pad is locked once the trial is spent and the account is not paid up.
   * A *pending* payment is not a paid account — the lock stays on until an
   * admin approves it, which is the whole point of verifying.
   */
  const locked = !exempt && trialMs <= 0 && !paid;

  // A guest cannot subscribe, so their time ending erases the session instead.
  useEffect(() => {
    if (locked && session.guest) onGuestExpired();
  }, [locked, session.guest, onGuestExpired]);

  // While locked, re-read the ledger so an approval on this device lifts the
  // lock without the writer having to reload.
  useEffect(() => {
    if (!locked || session.guest) return undefined;
    const timer = setInterval(() => setBillingTick((t) => t + 1), 4000);
    return () => clearInterval(timer);
  }, [locked, session.guest]);

  useEffect(() => {
    const timer = setInterval(() => setUnread(unreadCount(session.uid)), 5000);
    return () => clearInterval(timer);
  }, [session.uid]);

  useEffect(() => onInstallable((p) => setCanInstall(Boolean(p))), []);

  const stats = useMemo(() => computeStats(doc.elements), [doc.elements]);

  /**
   * The panels read the script; nobody types into them.
   *
   * Every keystroke used to rebuild the scene list, the cast, the locations
   * and the shot breakdown before the letter appeared on the page. Deferring
   * lets the letter land first and the panels catch up a beat later — and if
   * the next key comes before they have finished, React abandons that work and
   * starts again, so a fast typist never pays for a list they are not looking
   * at.
   */
  const quietDoc = useDeferredValue(doc);
  const vocab = useMemo(() => collectVocabulary(quietDoc.elements), [quietDoc.elements]);
  const commentCount = useMemo(
    () => doc.elements.reduce((n, el) => n + (el.comments?.length || 0), 0),
    [doc.elements],
  );

  /* ---------------- project documents ---------------- */

  useEffect(() => onBackupState(setBackup), []);

  /**
   * There is no script sync, and that is the design.
   *
   * A screenplay is a file on the writer's own machine and stays there. The
   * account exists to know who somebody is and that they have paid; it has
   * never held a page of anybody's work and is not going to.
   *
   * The cost of that is real and is said plainly on the website rather than
   * discovered: a second computer starts empty, and a dead hard drive takes
   * the drafts with it. External backups answers both, which is why it is a
   * menu item and not a promise nobody checks.
   */
  useEffect(() => onUpdateReady(setUpdateReady), []);

  const openDocument = (doc.documents || []).find((d) => d.id === docView) || null;

  const addDocument = (name) => {
    const id = `d_${Date.now().toString(36)}`;
    update((d) => ({ ...d, documents: [...(d.documents || []), { id, name, body: '' }] }));
    setDocView(id);
  };

  const deleteDocument = (id) => {
    update((d) => ({ ...d, documents: (d.documents || []).filter((x) => x.id !== id) }));
    setDocView((v) => (v === id ? 'screenplay' : v));
  };

  const setDocumentBody = (id, body) =>
    update(
      (d) =>
        id === 'pad'
          ? { ...d, pad: body }
          : { ...d, documents: (d.documents || []).map((x) => (x.id === id ? { ...x, body } : x)) },
      { coalesceKey: `doc:${id}` },
    );

  /** Write the open script into the backup folder, and say so either way. */
  const backupNow = async () => {
    try {
      const done = await backupDoc(doc);
      setNotice(
        done
          ? { kind: 'ok', text: 'A copy has been written to your backup folder.' }
          : { kind: 'warn', text: 'No backup folder chosen yet.' },
      );
    } catch (e) {
      setNotice({ kind: 'error', text: `Backup failed: ${e.message || e}` });
    }
  };

  /* ---------------- pins, graveyard, alternates, tags ---------------- */

  const patchElement = (id, patch) =>
    update((d) => ({
      ...d,
      elements: d.elements.map((el) => (el.id === id ? { ...el, ...patch(el) } : el)),
    }));

  /** Pin the line you are on, or let it go if it is already pinned. */
  const togglePin = (id = active.element?.id) => {
    if (!id) return;
    update((d) => {
      const pins = d.pins || [];
      return { ...d, pins: pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id] };
    });
  };

  /** Put a buried line back at the end of the script. */
  const exhume = (buriedId) =>
    update((d) => {
      const row = (d.graveyard || []).find((g) => g.buriedId === buriedId);
      if (!row) return d;
      const { buriedId: _drop, at: _when, ...el } = row;
      return {
        ...d,
        elements: [...d.elements, { ...el, id: `e_${Date.now().toString(36)}` }],
        graveyard: d.graveyard.filter((g) => g.buriedId !== buriedId),
      };
    });

  const forget = (buriedId) =>
    update((d) => ({ ...d, graveyard: (d.graveyard || []).filter((g) => g.buriedId !== buriedId) }));

  // Alternates: swapping trades the line on the page for the one in the list,
  // so the version you are leaving is never thrown away.
  const pickAlternate = (i) =>
    patchElement(active.element.id, (el) => ({
      text: el.alts[i],
      styles: [],
      alts: el.alts.map((t, n) => (n === i ? el.text : t)),
    }));

  const addAlternate = (text) =>
    patchElement(active.element.id, (el) => ({ alts: [...(el.alts || []), text] }));

  const dropAlternate = (i) =>
    patchElement(active.element.id, (el) => ({ alts: el.alts.filter((_, n) => n !== i) }));

  const addTag = (tag) =>
    patchElement(active.element.id, (el) => ({ tags: [...(el.tags || []), tag] }));

  const dropTag = (i) =>
    patchElement(active.element.id, (el) => ({ tags: el.tags.filter((_, n) => n !== i) }));

  /** Swap one phrase inside one line, for the prose checker's "fix". */
  const replacePhrase = (id, at, phrase, replacement) =>
    patchElement(id, (el) =>
      el.text.slice(at, at + phrase.length) === phrase
        ? { text: el.text.slice(0, at) + replacement + el.text.slice(at + phrase.length), styles: [] }
        : {},
    );

  /* ---------------- writing schedule ---------------- */

  // Count pages written today: the day's first reading is the baseline, and
  // anything above it is progress. Nothing is logged for a day not worked.
  useEffect(() => {
    const day = new Date().toISOString().slice(0, 10);
    setPrefs((p) => {
      const s = { goal: 3, history: {}, baseline: {}, ...(p.schedule || {}) };
      const base = s.baseline[day] ?? stats.pageCount;
      const done = Math.max(0, stats.pageCount - base, s.history[day] || 0);
      if (s.baseline[day] === base && s.history[day] === done) return p;
      return {
        ...p,
        schedule: {
          ...s,
          baseline: { ...s.baseline, [day]: base },
          history: { ...s.history, [day]: done },
        },
      };
    });
  }, [stats.pageCount, setPrefs]);

  /* ---------------- persistence ---------------- */

  // Autosave must never take the app down with it. A full browser store is a
  // condition to report, not an exception to throw during a keystroke.
  const flushSave = useCallback(
    (d) => {
      try {
        const stamped = saveDoc(d);
        setSavedAt(stamped.updatedAt);
        setIndex(loadIndex());
        setStorageFull(null);
      } catch (e) {
        if (e instanceof StorageFullError) setStorageFull(e.message);
        else throw e;
      }
    },
    [session],
  );

  useEffect(() => {
    setSavedAt(null);
    const t = setTimeout(() => flushSave(doc), 700);
    return () => clearTimeout(t);
  }, [doc, flushSave]);

  // Closing with a save still in flight.
  //
  // The save is written on the way out either way — that is free and it is the
  // work. The prompt on top of it is the setting's doing, and it is worth
  // having because the local write is only half the job: the copy in the cloud
  // needs the network, which a closing window does not wait for.
  useEffect(() => {
    const leaving = (e) => {
      if (savedAt !== null) return;
      flushSave(doc);
      if (prefs.confirmClose === false) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', leaving);
    return () => window.removeEventListener('beforeunload', leaving);
  }, [savedAt, doc, flushSave, prefs.confirmClose]);

  /* ---------------- script management ---------------- */

  const openDoc = (id) => {
    const next = loadDoc(id);
    if (next) reset(next);
  };

  const newDoc = () => {
    // The free tier keeps a few scripts; past that the upgrade is the next step.
    if (subscription.status !== 'active' && index.length >= FREE_SCRIPT_LIMIT) {
      setNotice({
        kind: 'warn',
        text: `A free account keeps ${FREE_SCRIPT_LIMIT} scripts. Upgrade to Kirukals Pro for unlimited scripts.`,
      });
      setDialog('subscribe');
      return;
    }
    const d = saveDoc(blankDoc(`Untitled ${index.length + 1}`));
    setIndex(loadIndex());
    reset(d);
  };

  const removeDoc = (id) => {
    if (!window.confirm('Delete this script? This cannot be undone.')) return;
    deleteDoc(id);
    setIndex(loadIndex());
  };

  const importFile = async (file) => {
    setNotice(null);
    try {
      const parsed = await importScriptFile(file);
      const base = blankDoc(file.name.replace(/\.[^.]+$/, ''));
      const title = parsed.titlePage?.title || base.name;
      const d = saveDoc({
        ...base,
        name: title,
        titlePage: { ...base.titlePage, ...parsed.titlePage, title },
        elements: parsed.elements,
      });
      setIndex(loadIndex());
      reset(d);
      setNotice({
        kind: parsed.notes.length ? 'warn' : 'ok',
        text: [
          `Imported ${parsed.elements.length} elements from ${file.name}.`,
          ...parsed.notes,
        ].join(' '),
      });
    } catch (err) {
      setNotice({ kind: 'error', text: `Could not import ${file.name}: ${err.message}` });
    }
  };

  const exportAs = (kind) => {
    const name = slug(doc.titlePage?.title || doc.name);
    if (kind === 'fountain') download(`${name}.fountain`, toFountain(doc));
    if (kind === 'fdx') download(`${name}.fdx`, toFdx(doc), 'application/xml');
    if (kind === 'txt') download(`${name}.txt`, toPlainText(doc));
    if (kind === 'json') download(`${name}.json`, JSON.stringify(doc, null, 2), 'application/json');
  };

  /* ---------------- the menu ---------------- */

  const pinned = (doc.pins || []).includes(active.element?.id);

  const menuItems = [
    ...(updatePending() && !updateReady
      ? [{
          id: 'm-update',
          label: 'Reload into the new version',
          badge: 'ready',
          keywords: 'update reload version',
          run: applyPendingUpdate,
        }]
      : []),
    { group: true, label: 'Script' },
    { id: 'm-new', label: 'New script', run: newDoc },
    { id: 'm-title', label: 'Title page…', run: () => setDialog('title') },
    { id: 'm-portfolio', label: 'Open Portfolio', shortcut: 'Ctrl+O', keywords: 'scripts library', run: () => setDialog('portfolio') },
    { id: 'm-backups', label: 'Set External Backups', keywords: 'backup folder', run: () => setDialog('backups') },
    { id: 'm-watermark', label: 'Watermark…', run: () => setDialog('watermark') },
    {
      id: 'm-pins',
      label: pinned ? 'Unpin this line' : 'Pin this line',
      shortcut: 'Ctrl+Alt+K',
      badge: (doc.pins || []).length || undefined,
      keywords: 'pins',
      run: () => { togglePin(); setSection('project'); },
    },
    {
      id: 'm-alts', label: 'Line Alternates', shortcut: 'Ctrl+Alt+A', arrow: true,
      keywords: 'alternates versions', run: () => setDialog('alternates'),
    },
    {
      id: 'm-dual',
      label: active.element?.dual ? 'Separate this speech' : 'Speak at the same time',
      shortcut: 'Ctrl+Alt+D',
      keywords: 'dual dialogue simultaneous overlap together',
      run: () => setDualTick((n) => n + 1),
    },

    {
      id: 'm-grave', label: 'Graveyard', arrow: true,
      badge: (doc.graveyard || []).length || undefined,
      keywords: 'deleted restore', run: () => setSection('project'),
    },
    {
      id: 'm-comments', label: 'Comments', arrow: true,
      badge: commentCount || undefined,
      shortcut: 'Ctrl+Alt+M', run: () => setSection('comments'),
    },
    {
      id: 'm-spell', label: 'Spelling & Grammar', arrow: true,
      keywords: 'spelling', run: () => setSection('tools'),
    },
    { group: true, label: 'Edit' },
    {
      id: 'm-find', label: 'Find & replace', shortcut: 'Ctrl+F',
      keywords: 'search replace', run: () => setDialog('find'),
    },
    {
      id: 'm-comment', label: 'Comment on this line', shortcut: 'Ctrl+Alt+M',
      keywords: 'note comment', run: () => setCommentTick((n) => n + 1),
    },
    {
      id: 'm-focus',
      label: prefs.focusMode ? 'Leave focus mode' : 'Focus mode',
      keywords: 'focus dim concentrate',
      run: () => setPrefs((p) => ({ ...p, focusMode: !p.focusMode })),
    },
    {
      id: 'm-theme',
      label: prefs.theme === 'dark' ? 'Light theme' : 'Dark theme',
      keywords: 'theme dark light',
      run: () => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' })),
    },

    { group: true, label: 'Tools' },
    { id: 'm-tagger', label: 'Tagger', shortcut: 'Ctrl+Alt+T', run: () => setDialog('tagger') },
    { id: 'm-read', label: 'ReadAloud', keywords: 'speech voice', run: () => setDialog('readaloud') },
    {
      id: 'm-translate', label: 'AutoTranslate', disabled: true,
      note: 'Translation needs a service to call. Kirukals runs entirely offline, so it is not available.',
      run: () => {},
    },
    { id: 'm-sched', label: 'Writing Schedule', keywords: 'goal pages', run: () => setDialog('schedule') },
    { id: 'm-rename', label: 'Rename Character…', run: () => setDialog('rename') },
    { id: 'm-prog', label: 'Present Progressive…', keywords: 'ing prose', run: () => setDialog('progressive') },
    { id: 'm-short', label: 'Shorten Document…', keywords: 'cut trim', run: () => setDialog('shorten') },
    { id: 'm-fmt', label: 'Check Formatting…', keywords: 'lint errors', run: () => setDialog('formatting') },
    { id: 'm-count', label: 'Word Count', keywords: 'words pages', run: () => setDialog('wordcount') },

    ...(isDesktopApp()
      ? []
      : [{
          id: 'm-download',
          label: 'Download for Windows',
          keywords: 'desktop exe install download offline app',
          run: () => setDialog('download'),
        }]),

    { group: true, label: 'Help' },
    {
      id: 'm-shortcuts', label: 'Keyboard shortcuts', shortcut: '?',
      keywords: 'keys shortcuts help', run: () => setDialog('shortcuts'),
    },
    {
      id: 'm-account', label: 'Profile & account',
      keywords: 'account profile sign out membership',
      run: () => onOpenProfile('board'),
    },

    { group: true, label: 'Share' },
    { id: 'm-print', label: 'Print / Save as PDF', shortcut: 'Ctrl+P', run: () => printScript(doc, prefs) },
    { id: 'm-fountain', label: 'Export Fountain (.fountain)', run: () => exportAs('fountain') },
    { id: 'm-fdx', label: 'Export Final Draft (.fdx)', run: () => exportAs('fdx') },
    { id: 'm-txt', label: 'Export plain text (.txt)', run: () => exportAs('txt') },
    { id: 'm-json', label: 'Backup (.json)', run: () => exportAs('json') },
  ];

  // The shortcuts that belong to the menu rather than to a line of text.
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && !e.ctrlKey && e.key === '/') {
        e.preventDefault();
        setMenuOpen((m) => !m);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.code === 'KeyO' || e.key.toLowerCase() === 'o')) {
        e.preventDefault();
        setDialog('portfolio');
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || !e.altKey) return;
      const k = e.code === 'KeyT' ? 't' : e.code === 'KeyA' ? 'a' : e.code === 'KeyK' ? 'k' : e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); setDialog('tagger'); }
      if (k === 'a') { e.preventDefault(); setDialog('alternates'); }
      if (k === 'k') { e.preventDefault(); togglePin(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // rebound each render so it always sees the current line

  /* ---------------- editing operations ---------------- */

  // Move a whole scene: its heading plus everything up to the next heading.
  const moveScene = (sceneId, delta) => {
    update((d) => {
      const els = d.elements;
      const starts = els.map((e, i) => (e.type === 'scene_heading' ? i : -1)).filter((i) => i >= 0);
      const at = starts.indexOf(els.findIndex((e) => e.id === sceneId));
      const target = at + delta;
      if (at === -1 || target < 0 || target >= starts.length) return d;

      const blockOf = (n) =>
        els.slice(starts[n], n + 1 < starts.length ? starts[n + 1] : els.length);

      const a = Math.min(at, target);
      const b = Math.max(at, target);
      const head = els.slice(0, starts[a]);
      const tail = els.slice(b + 1 < starts.length ? starts[b + 1] : els.length);
      return { ...d, elements: [...head, ...blockOf(b), ...blockOf(a), ...tail] };
    });
  };

  const replaceAll = (query, replacement, caseSensitive) => {
    const re = new RegExp(
      query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      caseSensitive ? 'g' : 'gi',
    );
    update((d) => ({
      ...d,
      elements: d.elements.map((el) => {
        const text = el.text.replace(re, replacement);
        if (text === el.text) return el;
        return { ...el, text: TYPES[el.type].uppercase ? text.toUpperCase() : text };
      }),
    }));
    setDialog(null);
  };

  const setActiveType = (type) => {
    const el = active.element;
    if (!el) return;
    update((d) => ({
      ...d,
      elements: d.elements.map((x) =>
        x.id === el.id
          ? { ...x, type, text: TYPES[type].uppercase ? x.text.toUpperCase() : x.text }
          : x,
      ),
    }));
    setJump({ id: el.id, pos: el.text.length, at: Date.now() });
  };

  /** Open one of the production sheets, from wherever it was asked for. */
  const openSheet = (sheet) => {
    setPpSheet(sheet);
    setSection('preproduction');
    setPanelOpen(true);
    setDocView(`pp:${sheet}`);
  };

  /** Customize, opened straight onto the page that was asked for. */
  const openSettings = (page) => setSettingsPage(page);

  const menus = buildMenus({
    doc, session, prefs, setPrefs, active, pinned,
    canUndo, canRedo, undo, redo,
    section, panelOpen, setSection, setPanelOpen,
    setDialog, setDocView, openSheet, setActiveType, openSettings,
    newDoc, printScript, togglePin,
    setCommentTick, setDualTick,
    onOpenProfile, onSignOut,
    onImport: () => document.getElementById('kirukals-import')?.click(),
    onHelp: () => window.dispatchEvent(new CustomEvent('kirukals:help')),
  });

  /* ---------------- global shortcuts ---------------- */

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 'f') {
        e.preventDefault();
        setDialog('find');
      } else if (k === 'p') {
        e.preventDefault();
        printScript(doc, prefs);
      } else if (k === 's') {
        e.preventDefault();
        flushSave(doc);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doc, undo, redo, flushSave]);

  const onActiveChange = useCallback((element, i) => {
    setActive((prev) => (prev.element === element && prev.i === i ? prev : { element, i }));
  }, []);

  return (
    <div className={`app${prefs.focusMode ? ' app--focus' : ''}`}>
      <TopBar
        doc={doc}
        stats={stats}
        activeType={active.element?.type}
        onSetType={setActiveType}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        prefs={prefs}
        setPrefs={setPrefs}
        onExport={exportAs}
        onPrint={() => printScript(doc, prefs)}
        onTitlePage={() => setDialog('title')}
        onFind={() => setDialog('find')}
        onComment={() => setCommentTick((n) => n + 1)}
        onWatermark={() => setDialog('watermark')}
        onNewScript={newDoc}
        onShortcuts={() => setDialog('shortcuts')}
        onChangePassword={() => setDialog('password')}
        menus={menus}
        savedAt={savedAt}
        session={session}
        onSignOut={onSignOut}
        onOpenAdmin={onOpenAdmin}
        onOpenProfile={onOpenProfile}
        unread={unread}
        subscription={subscription}
        canInstall={canInstall && !isInstalled()}
        onInstall={install}
        trialMs={exempt ? null : trialMs}
      />

      {storageFull && (
        <div className="notice notice--error" role="alert">
          <span>{storageFull}</span>
          <button className="btn" onClick={() => setDialog('backups')}>Back up now</button>
        </div>
      )}

      {updateReady && prefs.notifyUpdates !== false && (
        <div className="notice notice--ok" role="status">
          <span>
            A newer version of Kirukals is ready. Reload to use it — your open script is already
            saved.
          </span>
          <button className="btn btn--primary" onClick={applyPendingUpdate}>Reload</button>
          <button
            className="notice__close"
            onClick={dismissUpdate}
            aria-label="Dismiss — the update stays available in Menu"
            title="Later. It stays in Menu."
          >
            ✕
          </button>
        </div>
      )}

      {notice && (
        <div className={`notice notice--${notice.kind}`} role="status">
          <span>{notice.text}</span>
          <button className="notice__close" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {!session.guest && prefs.notifyChat !== false && (
        <ChatToasts session={session} onOpen={(threadId) => onOpenProfile('chat', threadId)} />
      )}

      <HelpDesk />

      <div className="workspace">
        <Dock
          active={panelOpen ? section : null}
          menuOpen={menuOpen}
          badges={{ comments: commentCount, account: unread }}
          onSelect={(id) => {
            setMenuOpen(false);
            // Clicking the section already showing puts the panel away; any
            // other icon switches to it and brings the panel back.
            if (id === section && panelOpen) {
              setPanelOpen(false);
              return;
            }
            setSection(id);
            setPanelOpen(true);
            // The two production sheets take the canvas; anything else hands
            // it back to the script.
            if (id === 'preproduction') setDocView(`pp:${ppSheet}`);
            else if (id === 'analysis') setDocView('analysis');
            else if (String(docView).startsWith('pp:') || docView === 'analysis') setDocView('screenplay');
          }}
          onMenu={() => setMenuOpen((m) => !m)}
          theme={prefs.theme}
          onToggleTheme={() => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }))}
        />

        {menuOpen && <MenuPanel items={menuItems} onClose={() => setMenuOpen(false)} />}

        {panelOpen && (
        <Sidebar
          doc={quietDoc}
          section={section}
          stats={stats}
          index={index}
          prefs={prefs}
          setPrefs={setPrefs}
          onJump={(id) => setJump({ id, pos: 0, at: Date.now() })}
          onMoveScene={moveScene}
          onNew={newDoc}
          onOpen={openDoc}
          onDelete={removeDoc}
          onImportFile={importFile}
          docView={docView}
          ppSheet={ppSheet}
          onOpenSheet={(sheet) => { setPpSheet(sheet); setDocView(`pp:${sheet}`); }}
          owner={session.name}
          backup={backup}
          onCommand={(id) => {
            if (id === 'print') return printScript(doc, prefs);
            if (id === 'export') return setDialog('exportpick');
            if (id === 'analyse') return setDocView('analysis');
            return setDialog(id);
          }}
          onOpenDocument={setDocView}
          onAddDocument={() => setDialog('newdoc')}
          onDeleteDocument={deleteDocument}
          onUnpin={togglePin}
          onExhume={exhume}
          onBury={forget}
        />
        )}

        <main
          className={`canvas${
            docView === 'screenplay'
              ? ''
              : String(docView).startsWith('pp:') || docView === 'analysis'
                ? ' canvas--sheet'
                : ' canvas--pad'
          }`}
        >
          {docView === 'analysis' ? (
            <AnalysisReport
              doc={doc}
              stats={stats}
              onCommand={(id) => (id === 'print' ? printScript(doc, prefs) : setDialog(id))}
            />
          ) : String(docView).startsWith('pp:') ? (
            <Preproduction
              doc={doc}
              stats={stats}
              sheet={docView.slice(3)}
              locked={!production}
              onUnlock={() => setDialog('production')}
              board={doc.preproduction || emptyBoard()}
              onChange={(board) => update((d) => ({ ...d, preproduction: board }), { coalesceKey: 'preprod' })}
              onJump={(id) => { setDocView('screenplay'); setJump({ id, pos: 0, at: Date.now() }); }}
              onNotice={setNotice}
            />
          ) : docView !== 'screenplay' ? (
            <PadEditor
              title={docView === 'pad' ? 'Private Pad' : openDocument?.name || 'Document'}
              note={
                docView === 'pad'
                  ? 'Only you see this. It is never printed, exported or counted in the page count.'
                  : 'A document beside the script — never printed or exported.'
              }
              value={docView === 'pad' ? doc.pad || '' : openDocument?.body || ''}
              onChange={(body) => setDocumentBody(docView, body)}
            />
          ) : (
          <Editor
            doc={doc}
            update={update}
            prefs={prefs}
            pages={stats.pages}
            vocab={vocab}
            jump={jump}
            author={session.name}
            commentTick={commentTick}
            dualTick={dualTick}
            onNotice={setNotice}
            watermark={doc.watermark}
            onActiveChange={onActiveChange}
          />
          )}
        </main>
      </div>

      {dialog === 'title' && (
        <TitlePageDialog
          titlePage={doc.titlePage || {}}
          onChange={(titlePage) =>
            update((d) => ({ ...d, titlePage, name: titlePage.title || d.name }), {
              coalesceKey: 'titlepage',
            })
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'watermark' && (
        <WatermarkDialog
          watermark={doc.watermark}
          onChange={(watermark) =>
            update((d) => ({ ...d, watermark }), { coalesceKey: 'watermark' })
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'find' && (
        <FindReplaceDialog
          elements={doc.elements}
          onJump={(id, pos) => setJump({ id, pos, at: Date.now() })}
          onReplaceAll={replaceAll}
          onClose={() => setDialog(null)}
        />
      )}
      {(dialog === 'subscribe' || (locked && !session.guest)) && (
        <SubscribeDialog
          session={session}
          blocking={locked}
          onSignOut={onSignOut}
          onChanged={() => {
            setBillingTick((t) => t + 1);
            setTrialMs(trialLeft(session.uid));
          }}
          onClose={() => {
            if (locked) return; // the wall is not dismissible
            setDialog(null);
            setBillingTick((t) => t + 1);
          }}
        />
      )}
      {dialog === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
      {settingsPage && (
        <SettingsDialog
          prefs={prefs}
          setPrefs={setPrefs}
          page={settingsPage}
          onClose={() => setSettingsPage(null)}
        />
      )}
      {dialog === 'password' && (
        <PasswordDialog session={session} onClose={() => setDialog(null)} />
      )}

      {dialog === 'production' && (
        <SubscribeDialog
          session={session}
          plan={PRODUCTION_PLAN}
          onChanged={() => setBillingTick((t) => t + 1)}
          onClose={() => {
            setDialog(null);
            setBillingTick((t) => t + 1);
          }}
        />
      )}
      {dialog === 'download' && (
        <DownloadDialog
          onClose={() => setDialog(null)}
          onBackup={() => setDialog('backups')}
        />
      )}
      {dialog === 'portfolio' && (
        <PortfolioDialog
          index={index}
          currentId={doc.id}
          onOpen={openDoc}
          onDelete={removeDoc}
          onNew={newDoc}
          onImportFile={importFile}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'backups' && (
        <BackupsDialog
          backup={backup}
          doc={doc}
          onBackupNow={backupNow}
          onDownload={(d) => download(`${slug(d.titlePage?.title || d.name)}.json`, JSON.stringify(d, null, 2), 'application/json')}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'newdoc' && (
        <NewDocumentDialog onCreate={addDocument} onClose={() => setDialog(null)} />
      )}
      {dialog === 'exportpick' && (
        <ExportPickDialog onPick={exportAs} onPrint={() => printScript(doc, prefs)} onClose={() => setDialog(null)} />
      )}
      {dialog === 'wordcount' && (
        <WordCountDialog doc={doc} stats={stats} onClose={() => setDialog(null)} />
      )}
      {dialog === 'rename' && (
        <RenameCharacterDialog
          doc={doc}
          onApply={(from, to, mentions) =>
            update((d) => ({
              ...d,
              elements: renameCharacter(d.elements, from, to, { includeMentions: mentions }).elements,
            }))
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'formatting' && (
        <FormattingDialog
          doc={doc}
          onJump={(id) => setJump({ id, pos: 0, at: Date.now() })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'progressive' && (
        <ProgressiveDialog
          doc={doc}
          onJump={(id) => setJump({ id, pos: 0, at: Date.now() })}
          onFix={replacePhrase}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'shorten' && (
        <ShortenDialog
          doc={doc}
          stats={stats}
          onJump={(id) => setJump({ id, pos: 0, at: Date.now() })}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'schedule' && (
        <ScheduleDialog
          schedule={prefs.schedule}
          stats={stats}
          onChange={(schedule) => setPrefs((p) => ({ ...p, schedule }))}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'readaloud' && <ReadAloudDialog doc={doc} onClose={() => setDialog(null)} />}
      {dialog === 'alternates' && (
        <AlternatesDialog
          element={active.element}
          onPick={pickAlternate}
          onSave={addAlternate}
          onDelete={dropAlternate}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'tagger' && (
        <TaggerDialog
          element={active.element}
          onTag={addTag}
          onUntag={dropTag}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
