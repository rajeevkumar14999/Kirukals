import { createClient } from '@supabase/supabase-js';
import { isDesktopApp } from '../downloads';

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
        /*
         * The installed app signs out when it closes.
         *
         * A desktop program sits on a machine other people can reach, and a
         * writer who quits it reasonably expects to have left. Session storage
         * survives a reload but not a restart, which is exactly that rule —
         * and no scripts are touched, only the token.
         */
        storage: isDesktopApp() && typeof sessionStorage !== 'undefined'
          ? sessionStorage
          : undefined,
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

/**
 * The screen shown while a hand-off is being exchanged.
 *
 * Plain DOM and inline styles on purpose: it has to be on screen before the
 * bundle has finished evaluating, and it must not wait for a stylesheet that
 * may itself still be arriving.
 */
function welcome() {
  const box = document.createElement('div');
  box.id = 'kirukals-welcome';
  box.setAttribute('role', 'status');
  box.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:#0f1115', 'color:#edeff2',
    'font:400 15px/1.6 "Segoe UI",system-ui,-apple-system,sans-serif',
    'opacity:1', 'transition:opacity .45s ease',
  ].join(';');

  /* A template literal with single-quoted attributes: the font stack needs
     quotes of its own, and nesting three kinds inside a joined array is how
     the last attempt at this failed to parse. */
  box.innerHTML = `
    <div style='text-align:center;max-width:320px;padding:24px'>
      <p style='font:700 11.5px/1 ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;color:#d9a441;margin-bottom:14px'>Million Dollar</p>
      <h1 style='font-size:24px;font-weight:700;letter-spacing:-.02em;margin-bottom:8px'>Welcome to the Script Suite</h1>
      <p style='font-size:13.5px;color:#99a1ae'>Signing you in&hellip;</p>
      <span style='display:block;width:150px;height:2px;margin:22px auto 0;border-radius:999px;background:#242830;overflow:hidden'>
        <i style='display:block;width:40%;height:100%;background:#d9a441;border-radius:999px;animation:kirukals-slide 1.1s ease-in-out infinite'></i>
      </span>
    </div>
    <style>@keyframes kirukals-slide{from{transform:translateX(-110%)}to{transform:translateX(310%)}}</style>
  `;

  document.body.appendChild(box);
}

/**
 * Take it away once the app is actually there.
 *
 * Faded rather than cut, and only after a frame has been painted — removing it
 * the instant React returns can still show a flash of an unstyled first paint.
 */
export function welcomeOver() {
  const box = document.getElementById('kirukals-welcome');
  if (!box) return;
  requestAnimationFrame(() => {
    setTimeout(() => {
      box.style.opacity = '0';
      setTimeout(() => box.remove(), 500);
    }, 250);
  });
}

/** A short, human explanation of why the server is not being used. */
export const whyOffline = () =>
  isConfigured()
    ? null
    : 'No server is configured, so accounts and scripts stay in this browser. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to switch that on.';

/**
 * Arriving already signed in.
 *
 * The shop and this app are different origins — different ports in
 * development, different hosts later — and a browser keeps their storage
 * apart. Somebody who has just paid on the shop would otherwise land here a
 * stranger and be asked to sign in again ten seconds after buying, which is
 * the worst possible moment to ask.
 *
 * The shop hands the session over in the URL fragment, in the shape Supabase's
 * own OAuth redirect uses. detectSessionInUrl usually picks that up on its
 * own, but this client is configured for PKCE and that is a detail of the
 * library rather than a promise it makes — so the hand-off is done here
 * explicitly and the address cleaned afterwards.
 *
 * A fragment is never sent to any server, which is why it is the fragment. It
 * does land in this browser's history, so it is removed the moment it has been
 * read: replaceState rather than pushState, leaving nothing to go back to.
 *
 * Returns the account id when it worked, so whatever called this can go and
 * ask about the licence straight away. Somebody arriving from a payment made
 * ten seconds ago must not be told they have not paid because the cached
 * answer is six hours old.
 */
export async function acceptHandover() {
  if (!supabase || typeof window === 'undefined') return false;

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
  if (!hash.includes('access_token')) return false;

  /*
    Something to look at while the session is exchanged.

    Between leaving the shop and this app painting, a browser shows white —
    and white immediately after paying reads as a page that has failed. The
    shop puts up the same words as it leaves, so the two form one continuous
    screen across the jump rather than two flashes.

    Written into the document rather than rendered by React, because React has
    not started yet and this is precisely the gap before it does.
  */
  welcome();

  const carried = new URLSearchParams(hash);
  const access_token = carried.get('access_token');
  const refresh_token = carried.get('refresh_token');

  // Cleaned before anything can go wrong with it, so a failed hand-off does
  // not leave a token sitting in the address bar.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  if (!access_token || !refresh_token) return false;

  try {
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) {
      console.warn('[handover]', error.message);
      return null;
    }
    return data?.user?.id || null;
  } catch (err) {
    console.warn('[handover]', err.message);
    return null;
  }
}
