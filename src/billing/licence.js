import { isConfigured, supabase } from '../backend/supabase';

/**
 * Whether this account has paid, asked of the server.
 *
 * The old answer came from this machine's own records, which meant the machine
 * decided whether it had been paid for. That is not a licence, it is a
 * suggestion. The website's webhook writes a row when Razorpay confirms money
 * arrived, and this reads that row — the same fact, from the place that knows.
 *
 * Two rules shape the rest of it, and both are about not punishing a customer
 * for a bad connection:
 *
 *   The answer is remembered, with the date it expires. A writer on a plane is
 *   not asked to prove anything; the licence they had this morning is the
 *   licence they have at thirty thousand feet.
 *
 *   A licence that cannot be checked is assumed good for a while. If the
 *   server is unreachable — ours down, their wifi, an airport — the last known
 *   answer stands for a fortnight rather than locking somebody out of the
 *   month they paid for.
 *
 * And one rule that is not about connections at all: **a script is never held
 * hostage.** An expired licence stops new work being started and closes the
 * production tools. It never stops somebody opening what they wrote, and never
 * stops them exporting it. We were paid to write with, not to hold.
 */

const KEY = 'kirukals.licence';
const GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const RECHECK_MS = 6 * 60 * 60 * 1000;

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};

const write = (all) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // A licence that cannot be cached is checked again next time. Not fatal.
  }
};

/** What is remembered about this account, without asking anybody. */
export function cachedLicence(uid) {
  const held = read()[uid];
  if (!held) return { active: false, expiresAt: null, checkedAt: null, stale: true };
  const expired = held.expiresAt && new Date(held.expiresAt) <= new Date();
  return { ...held, active: Boolean(held.active) && !expired };
}

/**
 * Ask the server, and remember the answer.
 *
 * Read through the customer's own session, so row-level security is doing the
 * work: an account can see its own purchases and nobody else's. There is no
 * key in this app that could read anybody else's row.
 */
export async function refreshLicence(uid) {
  if (!isConfigured() || !uid) return cachedLicence(uid);

  try {
    const { data, error } = await supabase
      .from('purchases')
      .select('expires_at')
      .eq('user_id', uid)
      .eq('status', 'paid')
      .order('expires_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    const expiresAt = data?.[0]?.expires_at || null;
    const answer = {
      active: Boolean(expiresAt) && new Date(expiresAt) > new Date(),
      expiresAt,
      checkedAt: Date.now(),
    };
    write({ ...read(), [uid]: answer });
    return answer;
  } catch {
    // Unreachable is not the same as unpaid.
    const held = cachedLicence(uid);
    const withinGrace = held.checkedAt && Date.now() - held.checkedAt < GRACE_MS;
    return { ...held, active: held.active && Boolean(withinGrace), offline: true };
  }
}

/** Worth asking again? Not on every render, and not never. */
export const worthChecking = (uid) => {
  const held = cachedLicence(uid);
  return !held.checkedAt || Date.now() - held.checkedAt > RECHECK_MS;
};

/** How the state should be said to the person it concerns. */
export function licenceWording(licence) {
  if (!licence) return 'No licence on this account.';
  if (licence.active && licence.expiresAt) {
    const days = Math.ceil((new Date(licence.expiresAt) - Date.now()) / 86400000);
    if (days <= 3) return `Your licence ends in ${days} day${days === 1 ? '' : 's'}.`;
    return `Licensed until ${new Date(licence.expiresAt).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'long', year: 'numeric',
    })}.`;
  }
  if (licence.offline) return 'Could not reach the server to check your licence. Still working from the last check.';
  if (licence.expiresAt) return 'Your licence has run out. Your scripts are still here and still export.';
  return 'This account has no licence yet.';
}

export const forgetLicences = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to forget */
  }
};
