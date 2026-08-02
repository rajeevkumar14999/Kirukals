/**
 * The desktop build, offered from inside the web app.
 *
 * The installer sits in `public/downloads`, so it ships with the site and is
 * served from the same place — no second host to keep alive, and it works on a
 * local network as readily as on the internet.
 *
 * When a new installer is built, drop it in that folder and change the three
 * facts below. Nothing else needs touching.
 */
export const DESKTOP = {
  version: '1.0.1',
  file: 'Kirukals-Setup-1.0.1.exe',
  bytes: 106546685,
  built: '2026-08-02',
  platform: 'Windows 10 and 11 · 64-bit',
};

export const downloadUrl = () => `${import.meta.env.BASE_URL}downloads/${DESKTOP.file}`;

export const prettySize = (bytes = DESKTOP.bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Already the desktop app? Then there is nothing to offer. Electron announces
 * itself in the user agent, and a packaged build is loaded from disk.
 */
export const isDesktopApp = () =>
  typeof navigator !== 'undefined' &&
  (/Electron/i.test(navigator.userAgent) || window.location.protocol === 'file:');
