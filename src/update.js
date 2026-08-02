/**
 * Keeping the installed app honest about its own version.
 *
 * An installed PWA serves itself from a precache, so a rebuild is invisible
 * until the new service worker takes over — which is one reload later than
 * anyone expects. That gap looks exactly like "my change didn't work".
 *
 * So: check for a new build on startup and every few minutes, and when one is
 * ready say so and offer to reload into it. Nothing is swapped underneath a
 * writer mid-sentence without being told.
 */
import { registerSW } from 'virtual:pwa-register';

const listeners = new Set();
// `ready` is whether to show the offer; `pending` is whether there is actually
// a new build waiting. Dismissing the bar clears the first, never the second —
// the update is still there, and the menu keeps a way back to it.
let ready = false;
let pending = false;

const announce = () => listeners.forEach((fn) => fn(ready));

export const updateReady = () => ready;
export const updatePending = () => pending;

/** Put the bar away. The update stays waiting, and Menu can still apply it. */
export function dismissUpdate() {
  ready = false;
  announce();
}

export function onUpdateReady(fn) {
  listeners.add(fn);
  fn(ready);
  return () => listeners.delete(fn);
}

/**
 * Reload into the new build.
 *
 * The order matters. Reloading straight away lands back on the *old* app: the
 * worker that is still in charge answers from its own precache, the new one
 * stays stuck in "waiting", and the update bar comes back on the next load —
 * which reads as a Reload button that does nothing. So tell the waiting worker
 * to take over, wait until it actually has, and only then reload.
 */
export async function applyPendingUpdate() {
  const registration = await navigator.serviceWorker?.getRegistration?.();

  if (registration?.waiting) {
    const tookOver = new Promise((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    });
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    // Never hang on this: a reload with the old worker still in charge is
    // better than a button that appears to do nothing at all.
    await Promise.race([tookOver, new Promise((r) => { setTimeout(r, 4000); })]);
  }

  ready = false;
  pending = false;
  announce();
  window.location.reload();
}

const EVERY = 5 * 60 * 1000;

// A packaged desktop app is loaded from disk, where there is no service
// worker and nothing to update — the installer does that job there.
const canRegister =
  typeof window !== 'undefined' &&
  window.location.protocol.startsWith('http') &&
  'serviceWorker' in navigator;

if (canRegister) registerSW({
  immediate: true,
  onNeedRefresh() {
    ready = true;
    pending = true;
    announce();
  },
  onRegisteredSW(url, registration) {
    if (!registration) return;
    // The browser only checks for a new worker on navigation, which an
    // installed app might not do for days.
    setInterval(() => {
      if (navigator.onLine) registration.update().catch(() => {});
    }, EVERY);
  },
});
