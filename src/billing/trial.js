/**
 * The free trial: ten minutes per account, once.
 *
 * The clock counts the same thing the admin dashboard counts — time with the
 * app open in a visible tab — so a backgrounded tab does not burn the trial.
 * Elapsed time is persisted per user and is never reset by signing out and in
 * again: once an account's ten minutes are gone, the next sign-in goes straight
 * to the payment screen.
 *
 * The guest account gets the same single ten minutes, after which its drafts
 * are erased and guest mode is closed on this browser.
 */

const KEY = (uid) => `kirukals.trial.${uid}`;

export const TRIAL_MS = 10 * 60 * 1000;

const read = (uid) => {
  try {
    return JSON.parse(localStorage.getItem(KEY(uid))) || null;
  } catch {
    return null;
  }
};

const write = (uid, state) => {
  try {
    localStorage.setItem(KEY(uid), JSON.stringify(state));
  } catch {
    /* private mode: the trial just restarts, which fails open rather than shut */
  }
};

/**
 * Begin the trial the first time an account signs in. Idempotent by design —
 * calling it on a later sign-in must not hand out more minutes.
 */
export function ensureTrial(uid) {
  const existing = read(uid);
  if (existing) return existing;
  const state = { startedAt: Date.now(), usedMs: 0 };
  write(uid, state);
  return state;
}

/** Support action: give an account its ten minutes back. */
export function resetTrial(uid) {
  write(uid, { startedAt: Date.now(), usedMs: 0 });
}

/** Add time to the clock and return what is left. */
export function spendTrial(uid, deltaMs) {
  const state = read(uid) || ensureTrial(uid);
  const next = { ...state, usedMs: Math.min(TRIAL_MS, state.usedMs + Math.max(0, deltaMs)) };
  write(uid, next);
  return remaining(next);
}

const remaining = (state) => Math.max(0, TRIAL_MS - (state?.usedMs ?? 0));

/** Milliseconds of trial left; 0 once it is spent. */
export function trialLeft(uid) {
  const state = read(uid);
  return state ? remaining(state) : TRIAL_MS;
}

export const trialExpired = (uid) => trialLeft(uid) <= 0;

export const GUEST_UID = 'guest';

/** Has this browser already used up its one guest session? */
export const guestTrialSpent = () => trialLeft(GUEST_UID) <= 0;

export const clearTrial = (uid) => localStorage.removeItem(KEY(uid));

/** "9m 40s" while it matters, "0s" at the end. */
export function formatLeft(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}
