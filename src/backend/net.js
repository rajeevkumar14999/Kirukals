/**
 * Is there a network?
 *
 * `navigator.onLine` only knows whether the machine has a connection, not
 * whether anything is at the other end of it — a laptop on a hotel wifi that
 * has not been paid for is "online" and can reach nothing. So the question is
 * asked twice: once before trying, to skip a request that is certain to fail,
 * and once afterwards by reading the failure.
 */

export const isOffline = () =>
  typeof navigator !== 'undefined' && navigator.onLine === false;

/** Did this error come from the network rather than from the server? */
export function looksOffline(err) {
  const m = String(err?.message || err || '').toLowerCase();
  return (
    isOffline() ||
    m.includes('failed to fetch') ||
    m.includes('networkerror') ||
    m.includes('network request failed') ||
    m.includes('could not be reached') ||
    m.includes('load failed') ||
    m.includes('err_internet_disconnected') ||
    m.includes('timeout')
  );
}

/** Run something when the machine comes back. Returns an unsubscribe. */
export function onBackOnline(fn) {
  window.addEventListener('online', fn);
  return () => window.removeEventListener('online', fn);
}
