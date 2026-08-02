/**
 * Holds on to the browser's install prompt.
 *
 * `beforeinstallprompt` fires once, moments after the page loads — long before
 * React has mounted, let alone before anyone has signed in. A listener attached
 * inside a component simply never sees it, and the install offer silently never
 * appears. So this listens at startup, keeps the event, and lets the UI ask for
 * it whenever it is ready.
 */

let prompt = null;
const listeners = new Set();

const announce = () => listeners.forEach((fn) => fn(prompt));

window.addEventListener('beforeinstallprompt', (event) => {
  // Preventing the default is what lets us show the offer on our own terms.
  event.preventDefault();
  prompt = event;
  announce();
});

window.addEventListener('appinstalled', () => {
  prompt = null;
  announce();
});

/** The pending prompt, if the browser has offered one. */
export const getInstallPrompt = () => prompt;

/** Already running as an installed app? Then there is nothing to offer. */
export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

export function onInstallable(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Show the browser's install dialog. Resolves once the user has answered. */
export async function install() {
  if (!prompt) return 'unavailable';
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  if (outcome === 'accepted') {
    prompt = null;
    announce();
  }
  return outcome;
}
