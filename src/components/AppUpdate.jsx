import { useEffect, useState } from 'react';
import { DESKTOP } from '../downloads';

/**
 * Updating the installed app.
 *
 * Nothing happens without being asked: the app checks when told, downloads
 * when told, and installs when told. A writer mid-scene should never have
 * their program restart itself because a new build appeared.
 */
export default function AppUpdate() {
  const api = typeof window !== 'undefined' ? window.kirukals : null;
  const [version, setVersion] = useState(null);
  const [status, setStatus] = useState({ state: 'idle' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!api) return undefined;
    api.version().then(setVersion);
    return api.update.on((payload) => {
      setStatus(payload);
      if (payload.state !== 'downloading' && payload.state !== 'checking') setBusy(false);
    });
  }, [api]);

  if (!api?.desktop) {
    return (
      <section className="cm-list">
        <article className="plan-card">
          <header>
            <div>
              <h2>Updates</h2>
              <p className="plan-card__price" style={{ fontSize: 15 }}>You are on the web version</p>
            </div>
          </header>
          <p className="hint">
            The web version updates itself: when a new build is published, a bar appears at the top
            of the editor with a Reload button, and the Menu keeps the offer until you take it.
            <br /><br />
            Version numbers and installers are only for the desktop app — Menu → Download for
            Windows, if you would like one.
          </p>
        </article>
      </section>
    );
  }

  const check = async () => {
    setBusy(true);
    setStatus({ state: 'checking' });
    const result = await api.update.check();
    if (result.state === 'dev') {
      setBusy(false);
      setStatus({ state: 'dev' });
    } else if (result.state === 'error') {
      setBusy(false);
      setStatus(result);
    }
  };

  const download = async () => {
    setBusy(true);
    setStatus({ state: 'downloading', percent: 0 });
    const result = await api.update.download();
    if (result.state === 'error') {
      setBusy(false);
      setStatus(result);
    }
  };

  const message = {
    idle: 'Check whether a newer version has been published.',
    checking: 'Looking for a newer version…',
    current: 'This is the newest version.',
    available: `Version ${status.version} is available.`,
    downloading: `Downloading… ${status.percent ?? 0}%`,
    ready: `Version ${status.version} is ready. It installs when you restart.`,
    dev: 'Updates only work in the installed app, not while running from source.',
    error: status.message || 'The update server could not be reached.',
  }[status.state] || '';

  return (
    <section className="cm-list">
      <article className="plan-card">
        <header>
          <div>
            <h2>Kirukals for Windows</h2>
            <p className="plan-card__price" style={{ fontSize: 22 }}>
              Version {version || DESKTOP.version}
            </p>
          </div>
          <span className={`plan-card__state${status.state === 'ready' ? ' is-active' : ''}${status.state === 'available' ? ' is-pending' : ''}`}>
            {status.state === 'current' ? 'Up to date'
              : status.state === 'available' ? 'Update available'
                : status.state === 'ready' ? 'Ready to install'
                  : status.state === 'downloading' ? `${status.percent ?? 0}%`
                    : 'Installed'}
          </span>
        </header>

        <p className="hint">{message}</p>

        {status.state === 'downloading' && (
          <div className="sched__bar" style={{ marginTop: 12 }}>
            <i style={{ width: `${status.percent ?? 0}%` }} />
          </div>
        )}

        <footer>
          {status.state === 'available' && (
            <button className="btn btn--primary" disabled={busy} onClick={download}>
              Download version {status.version}
            </button>
          )}

          {status.state === 'ready' && (
            <button className="btn btn--primary" onClick={() => api.update.install()}>
              Restart and install
            </button>
          )}

          {status.state !== 'available' && status.state !== 'ready' && (
            <button className="btn" disabled={busy} onClick={check}>
              {busy ? 'Checking…' : 'Check for updates'}
            </button>
          )}

          <p className="hint">
            Your scripts live outside the program and are untouched by an update — installing a new
            version never asks you to move anything.
          </p>
          {status.state === 'error' && (
            <p className="hint">
              This copy looks for updates on the server it was built against. If that server is not
              running, or the app was built for a different address, checking will fail here even
              though the app itself is fine.
            </p>
          )}
        </footer>
      </article>
    </section>
  );
}
