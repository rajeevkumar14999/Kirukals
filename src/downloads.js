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
  version: '1.1.0',
  file: 'Kirukals-Setup-1.1.0.exe',
  bytes: 101411781,
  built: '2026-08-02',
  platform: 'Windows 10 and 11 · 64-bit',
};

/**
 * Where the installer is served from.
 *
 * Not from the site itself: it is a hundred megabytes, and a static host
 * should not be asked to carry — or re-upload — that on every deploy. Point
 * VITE_DOWNLOAD_URL at a release host (a GitHub release, or a public bucket)
 * and the download button follows it. Without the setting it falls back to
 * the local copy, which is what makes development work offline.
 */
export const downloadUrl = () => {
  const base = import.meta.env.VITE_DOWNLOAD_URL;
  if (!base) return `${import.meta.env.BASE_URL}downloads/${DESKTOP.file}`;
  return base.endsWith('/') ? `${base}${DESKTOP.file}` : base;
};

export const prettySize = (bytes = DESKTOP.bytes) => `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Already the desktop app? Then there is nothing to offer. Electron announces
 * itself in the user agent, and a packaged build is loaded from disk.
 */
/**
 * Already the desktop app? Then there is nothing to offer.
 *
 * The test is the preload bridge, which only our own packaged app installs,
 * and the file:// protocol it is served from. Sniffing the user agent for
 * "Electron" was wrong: plenty of ordinary browsers are built on Electron,
 * and their users are on the web like anybody else.
 */
export const isDesktopApp = () =>
  typeof window !== 'undefined' &&
  (Boolean(window.kirukals?.desktop) || window.location.protocol === 'file:');
