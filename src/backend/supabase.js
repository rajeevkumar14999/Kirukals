import { createClient } from '@supabase/supabase-js';

/**
 * The connection to the server, when there is one.
 *
 * Kirukals works with no backend at all — that is how it works on a train, and
 * how it worked before this file existed. So the client is optional: if the
 * two settings below are absent the app carries on exactly as before, keeping
 * everything in this browser. When they are present, accounts and scripts
 * follow the writer to any machine they sign in on.
 *
 * The anon key is meant to be public. It grants nothing on its own: every
 * table is governed by row-level security, so what a request may see is
 * decided by Postgres against the signed-in user, not by this file.
 */
const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = () => Boolean(URL && ANON);

export const supabase = isConfigured()
  ? createClient(URL, ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The desktop build is served from a file, where a redirect back into
        // the app has nowhere to land; email and password work everywhere.
        detectSessionInUrl: window.location.protocol.startsWith('http'),
        storageKey: 'kirukals.auth',
        // The desktop app finishes its sign-in by exchanging a code it is
        // handed, which is what PKCE is for — and it keeps the secret half of
        // the handshake inside the app rather than in a browser it does not own.
        flowType: 'pkce',
      },
    })
  : null;

/** A short, human explanation of why the server is not being used. */
export const whyOffline = () =>
  isConfigured()
    ? null
    : 'No server is configured, so accounts and scripts stay in this browser. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to switch that on.';
