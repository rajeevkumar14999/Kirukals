/**
 * Usage tracking.
 *
 * Sessions used to leave no trace: sign in wrote a session object, sign out
 * deleted it. This keeps an append-only log of session records so the admin
 * page can report who signed in and for how long.
 *
 * What "logged in" means here: the app was open in a visible tab. A heartbeat
 * ticks every 30s while the tab is visible and stops when it is hidden or
 * closed, so a tab left open in the background does not accumulate hours. It
 * measures presence, not keystrokes — a writer staring at a page still counts.
 *
 * Everything is device-local, like the accounts themselves.
 */

const LOG_KEY = 'kirukals.activity';
const HEARTBEAT_MS = 30_000;
// A record whose heartbeat stopped more than this ago is treated as finished
// at its last beat — that is how a closed tab or a killed browser gets closed.
const IDLE_CUTOFF_MS = 5 * 60_000;
const MAX_RECORDS = 2000;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
  } catch {
    return [];
  }
};

const write = (records) => {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(records.slice(-MAX_RECORDS)));
  } catch {
    /* quota or private mode: tracking is best-effort, never blocks the app */
  }
};

let currentId = null;

const newId = () => `a_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Open a record for this sign-in. */
export function beginSession(session) {
  const now = Date.now();
  const record = {
    id: newId(),
    uid: session.uid,
    name: session.name,
    email: session.email || '',
    guest: Boolean(session.guest),
    startedAt: now,
    lastSeenAt: now,
    endedAt: null,
  };
  currentId = record.id;
  write([...read(), record]);
  return record.id;
}

const touch = (id, patch) => {
  const records = read();
  const i = records.findIndex((r) => r.id === id);
  if (i === -1) return;
  records[i] = { ...records[i], ...patch };
  write(records);
};

export const heartbeat = () => currentId && touch(currentId, { lastSeenAt: Date.now() });

export function endSession() {
  if (!currentId) return;
  const now = Date.now();
  touch(currentId, { lastSeenAt: now, endedAt: now });
  currentId = null;
}

/**
 * Track the signed-in session for as long as the app is on screen.
 * Returns a stop function for React cleanup.
 */
export function startTracking(session) {
  beginSession(session);

  const tick = () => {
    if (document.visibilityState === 'visible') heartbeat();
  };
  const timer = setInterval(tick, HEARTBEAT_MS);

  // A hidden tab stops counting; coming back resumes the same record unless it
  // has gone stale, in which case readActivity() will have closed it.
  const onVisibility = () => {
    if (document.visibilityState === 'visible') heartbeat();
  };
  const onLeave = () => heartbeat();

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onLeave);

  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', onLeave);
  };
}

/**
 * All session records with durations resolved. Records still open but past the
 * idle cutoff are closed at their last heartbeat, so a browser that was killed
 * does not read as an eternal session.
 */
export function readActivity(now = Date.now()) {
  return read().map((r) => {
    const stale = !r.endedAt && now - r.lastSeenAt > IDLE_CUTOFF_MS;
    const endedAt = r.endedAt ?? (stale ? r.lastSeenAt : null);
    const until = endedAt ?? now;
    return {
      ...r,
      endedAt,
      live: !endedAt,
      // Clock skew or an edited log could produce a negative span.
      durationMs: Math.max(0, until - r.startedAt),
    };
  });
}

/** Per-user totals, keyed by uid. */
export function summarise(records) {
  const byUser = new Map();
  for (const r of records) {
    const acc = byUser.get(r.uid) || {
      uid: r.uid,
      name: r.name,
      guest: r.guest,
      sessions: 0,
      totalMs: 0,
      firstSeen: r.startedAt,
      lastSeen: 0,
      live: false,
    };
    acc.sessions += 1;
    acc.totalMs += r.durationMs;
    acc.firstSeen = Math.min(acc.firstSeen, r.startedAt);
    acc.lastSeen = Math.max(acc.lastSeen, r.endedAt ?? r.lastSeenAt);
    acc.live = acc.live || r.live;
    byUser.set(r.uid, acc);
  }
  return byUser;
}

/** Buckets of a daily metric for the last `days` days, oldest first. */
export function daily(records, days, pick) {
  const out = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const from = new Date(start);
    from.setDate(from.getDate() - i);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    out.push({
      date: from,
      value: records.reduce((sum, r) => sum + pick(r, from.getTime(), to.getTime()), 0),
    });
  }
  return out;
}

/* ----------------------------- presence ---------------------------- */

// The heartbeat is every 30s, so allow three beats before calling someone gone
// — a slow tab should not blink people offline and back.
const ONLINE_MS = 90_000;
const AWAY_MS = 10 * 60_000;

const PRIVACY_KEY = (uid) => `kirukals.privacy.${uid}`;

/** Presence is opt-out: on by default, and the person decides. */
export function sharesPresence(uid) {
  try {
    const raw = localStorage.getItem(PRIVACY_KEY(uid));
    return raw ? JSON.parse(raw).sharePresence !== false : true;
  } catch {
    return true;
  }
}

export const setSharePresence = (uid, sharePresence) =>
  localStorage.setItem(PRIVACY_KEY(uid), JSON.stringify({ sharePresence }));

/**
 * Where someone is, as far as this device can tell.
 *
 * `online` means a session record is still beating; `away` means they were here
 * within the last ten minutes; otherwise `offline` with the time they were last
 * seen. Anyone who has turned presence off reads as `hidden`.
 */
export function presenceOf(uid, now = Date.now()) {
  if (!sharesPresence(uid)) return { status: 'hidden', lastSeen: 0 };

  const mine = read().filter((r) => r.uid === uid);
  if (!mine.length) return { status: 'offline', lastSeen: 0 };

  const lastSeen = mine.reduce((max, r) => Math.max(max, r.endedAt ?? r.lastSeenAt), 0);
  const beating = mine.some((r) => !r.endedAt && now - r.lastSeenAt <= ONLINE_MS);

  if (beating) return { status: 'online', lastSeen };
  if (now - lastSeen <= AWAY_MS) return { status: 'away', lastSeen };
  return { status: 'offline', lastSeen };
}

/** Everyone currently beating — used for the "N online" count. */
export function onlineUids(now = Date.now()) {
  const live = read()
    .filter((r) => !r.endedAt && now - r.lastSeenAt <= ONLINE_MS)
    .map((r) => r.uid)
    .filter((uid) => sharesPresence(uid));
  return [...new Set(live)];
}

export function clearActivity() {
  localStorage.removeItem(LOG_KEY);
  currentId = null;
}

/** The log as CSV, for taking the numbers somewhere else. */
export function toCsv(records) {
  const head = ['user', 'email', 'guest', 'started', 'ended', 'minutes'];
  const rows = records.map((r) => [
    r.name,
    r.email,
    r.guest ? 'yes' : 'no',
    new Date(r.startedAt).toISOString(),
    r.endedAt ? new Date(r.endedAt).toISOString() : '',
    (r.durationMs / 60000).toFixed(1),
  ]);
  return [head, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}
