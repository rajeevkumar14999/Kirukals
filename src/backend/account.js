import { isConfigured, supabase } from './supabase';

/**
 * Accounts, when there is a server.
 *
 * The app's own session shape — { uid, name, email, role, guest } — is kept
 * exactly as it was, so nothing downstream needs to know whether the person
 * signed in against this browser or against Postgres. That is the whole point:
 * one set of screens, two ways of being signed in.
 */

const asSession = (user, profile) => ({
  uid: user.id,
  name: profile?.name || user.user_metadata?.name || (user.email || '').split('@')[0] || 'Writer',
  email: user.email || '',
  role: profile?.role || 'writer',
  guest: false,
  remote: true,
});

async function profileFor(user) {
  const { data } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .maybeSingle();
  return data;
}

/** Whoever is already signed in on this device, if anyone. */
export async function currentRemoteSession() {
  if (!isConfigured()) return null;
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.user;
  if (!user) return null;
  return asSession(user, await profileFor(user));
}

export async function signUp({ name, email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw new Error(friendly(error.message));

  // With email confirmation switched on there is no session yet — the person
  // has to open their inbox first, and should be told so plainly.
  if (!data.session) {
    return { pending: true, message: 'Check your email and confirm the address, then sign in.' };
  }
  return { session: asSession(data.user, await profileFor(data.user)) };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(friendly(error.message));
  return asSession(data.user, await profileFor(data.user));
}

export async function signOutRemote() {
  if (!isConfigured()) return;
  await supabase.auth.signOut();
}

/**
 * Google, on the web only. The desktop app is served from a file, and an
 * OAuth redirect has nowhere to come back to there.
 */
export async function signInWithGoogleRemote() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw new Error(friendly(error.message));
}

/** Watch for a session appearing or disappearing in another tab. */
export function onAuthChange(fn) {
  if (!isConfigured()) return () => {};
  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    fn(session?.user ? asSession(session.user, await profileFor(session.user)) : null);
  });
  return () => data.subscription.unsubscribe();
}

/* ---------------------------- entitlements ---------------------------- */

/** What this account may do, as the server sees it. */
export async function entitlements() {
  if (!isConfigured()) return {};
  const { data, error } = await supabase.rpc('my_entitlements');
  if (error || !data) return {};
  return Object.fromEntries(
    data.map((row) => [row.plan, { status: row.status, activeUntil: row.active_until }]),
  );
}

/** Trial time left, counted by the server so a fresh browser gains nothing. */
export async function spendTrial(deltaMs) {
  if (!isConfigured()) return null;
  const { data, error } = await supabase.rpc('spend_trial', { delta_ms: Math.round(deltaMs) });
  return error ? null : Number(data);
}

/**
 * Supabase speaks in error codes; a writer should read English.
 *
 * The rate limits are worth separating. A limit on *emails* is not a limit on
 * attempts, and telling someone to wait a minute when the real quota is
 * hourly sends them round the same loop until they give up.
 */
function friendly(message = '') {
  const m = message.toLowerCase();

  if (m.includes('invalid login')) return 'That email and password do not match an account.';
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'There is already an account with that email. Sign in instead.';
  }

  // Confirmation emails are capped per hour on a new project, and every signup
  // sends one while "Confirm email" is switched on.
  if (m.includes('email rate limit') || (m.includes('rate limit') && m.includes('email'))) {
    return (
      'The server has sent as many confirmation emails as it is allowed to this hour. ' +
      'Either wait, or turn off "Confirm email" in Supabase (Authentication → Providers → Email) ' +
      'so accounts work immediately without one.'
    );
  }

  // The one-minute cooldown between requests from the same address.
  const seconds = m.match(/after (\d+) seconds?/);
  if (seconds) return `Wait ${seconds[1]} seconds and try again — the server limits how often this can be asked.`;
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'The server is refusing further attempts for the moment. Wait a little and try again.';
  }

  if (m.includes('password should be') || m.includes('password must')) {
    return 'That password is too short — use at least eight characters.';
  }
  if (m.includes('email address') && m.includes('invalid')) return 'That email address does not look right.';
  if (m.includes('confirm') && m.includes('email')) {
    return 'Check your inbox and confirm the address, then sign in.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'The server could not be reached. Check your connection, or keep working offline.';
  }
  return message || 'Something went wrong signing in.';
}
