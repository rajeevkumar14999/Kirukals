import { useEffect, useMemo, useRef, useState } from 'react';
import { guestTrialSpent } from '../billing/trial';
import { isConfigured as googleConfigured, renderButton } from '../auth/google';
import { isDesktopApp } from '../downloads';
import { isConfigured as hasServer } from '../backend/supabase';
import {
  signIn as remoteSignIn,
  signInWithGoogleToken,
  signUp as remoteSignUp,
} from '../backend/account';
import {
  accountsExist,
  signInWithGoogle,
  emailLooksValid,
  mirrorRemoteAccount,
  offlineAccountFor,
  passwordStrength,
  signIn,
  signInOffline,
  signUp,
  startGuestSession,
} from '../auth/session';
import { isOffline, looksOffline } from '../backend/net';
import '../styles/auth.css';

const SCRIPT_LINES = [
  { type: 'scene_heading', text: 'INT. WRITERS ROOM - NIGHT' },
  { type: 'action', text: 'A single lamp. Index cards pinned wall to wall. WRITER, hunched, types the first line of something that might be good.' },
  { type: 'character', text: 'WRITER' },
  { type: 'parenthetical', text: '(quietly)' },
  { type: 'dialogue', text: 'Everything starts on page one.' },
  { type: 'transition', text: 'CUT TO:' },
];

const FULL_LENGTH = SCRIPT_LINES.reduce((n, l) => n + l.text.length, 0);

/** Types the sample scene out one character at a time, once, on mount. */
function useTypewriter(enabled) {
  const [count, setCount] = useState(enabled ? 0 : FULL_LENGTH);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      setCount((n) => {
        if (n >= FULL_LENGTH) {
          clearInterval(id);
          return n;
        }
        return n + 1;
      });
    }, 18);
    return () => clearInterval(id);
  }, [enabled]);

  // Slice the running character budget across the lines.
  let left = count;
  return SCRIPT_LINES.map((line) => {
    const shown = Math.max(0, Math.min(line.text.length, left));
    left -= line.text.length;
    return { ...line, shown: line.text.slice(0, shown), done: shown >= line.text.length };
  });
}

export default function AuthPage({ onAuthed, theme, onToggleTheme, guestExpired }) {
  // Guest mode is a single ten-minute window per browser.
  const guestUsed = guestTrialSpent();
  const [mode, setMode] = useState(() => (accountsExist() ? 'signin' : 'signup'));
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' });
  // The installed app deliberately does not keep anyone signed in across a
  // restart, so there is nothing to offer to remember.
  const [remember, setRemember] = useState(!isDesktopApp());
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  // Whether there is a network, watched rather than asked once: a laptop can
  // lose its wifi while someone is still typing their password.
  const [offline, setOffline] = useState(() => isOffline());
  const [busy, setBusy] = useState(false);
  const firstFieldRef = useRef(null);
  const googleRef = useRef(null);
  const [googleError, setGoogleError] = useState('');
  // The installed app waits for the browser to hand the sign-in back.
  const [waitingForBrowser, setWaitingForBrowser] = useState(false);

  const reduceMotion = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    [],
  );
  const lines = useTypewriter(!reduceMotion);
  const strength = passwordStrength(values.password);
  const isSignup = mode === 'signup';

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  // Google's own button, per their brand terms — and the only thing that can
  // produce a token their servers will vouch for.
  useEffect(() => {
    // With a server, Google is handled by Supabase's redirect rather than by
    // Google's own button, so this one is not rendered at all.
    // The installed app is served from disk, and a file:// page has no origin
    // for Google to trust — their button cannot work there either.
    if (isDesktopApp() || !googleConfigured() || !googleRef.current) return;
    let cancelled = false;
    renderButton(googleRef.current, {
      theme,
      onProfile: async (profile) => {
        if (cancelled) return;
        try {
          // With a server, Google's token is traded for a Supabase session so
          // the account exists beyond this browser. Without one, the sign-in
          // stays local, exactly as it always did.
          onAuthed(
            hasServer()
              ? await signInWithGoogleToken(profile.idToken)
              : signInWithGoogle(profile),
          );
        } catch (err) {
          setGoogleError(err.message);
        }
      },
      onError: (err) => !cancelled && setGoogleError(err.message),
    }).catch((err) => !cancelled && setGoogleError(err.message));
    return () => { cancelled = true; };
  }, [theme, onAuthed]);

  /**
   * The installed app's Google sign-in. The browser does the talking to a
   * listener this app opened on itself, and what comes back is a token that
   * buys a Supabase session — no redirect into the app, nothing for Windows
   * to route, and no address to configure anywhere.
   */
  const withGoogle = async () => {
    setGoogleError('');
    setWaitingForBrowser(true);
    try {
      const result = await window.kirukals.auth.google();
      if (!result.ok) throw new Error(result.message);
      onAuthed(await signInWithGoogleToken(result.idToken, result.accessToken));
    } catch (err) {
      setGoogleError(err.message);
      setWaitingForBrowser(false);
    }
  };

  useEffect(() => {
    const sync = () => setOffline(isOffline());
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  // What this device can do for the email that has been typed, with no network.
  const localCopy = offline && hasServer() && emailLooksValid(values.email)
    ? offlineAccountFor(values.email)
    : null;

  const set = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setErrors((x) => ({ ...x, [key]: undefined }));
    setFormError('');
  };

  const validate = () => {
    const next = {};
    if (isSignup && !values.name.trim()) next.name = 'We need a name for the title page.';
    if (!values.email.trim()) next.email = 'Enter your email address.';
    else if (!emailLooksValid(values.email)) next.email = 'That does not look like an email address.';
    if (!values.password) next.password = 'Enter your password.';
    else if (isSignup && values.password.length < 8) next.password = 'Use at least 8 characters.';
    if (isSignup && values.confirm !== values.password) next.confirm = 'The two passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setFormError('');
    try {
      // With a server configured the account lives there, so the same
      // credentials work on any machine. Without one, nothing changes: the
      // account is this browser's, exactly as it was.
      if (hasServer()) {
        if (isSignup) {
          if (isOffline()) {
            throw new Error(
              'Creating an account needs a connection — the account has to exist on the server before it can exist here.',
            );
          }
          const result = await remoteSignUp({
            name: values.name,
            email: values.email,
            password: values.password,
          });
          if (result.pending) {
            setFormError(result.message);
            setBusy(false);
            return;
          }
          // Signing up hands over the password once; keep what is needed to
          // recognise it again when the server cannot be asked.
          await mirrorRemoteAccount({ session: result.session, password: values.password });
          onAuthed(result.session);
          return;
        }

        // Offline, there is no point waiting for a request that cannot go
        // anywhere — go straight to the copy on this device.
        if (isOffline()) {
          onAuthed(
            await signInOffline({
              email: values.email,
              password: values.password,
              remember: remember && !isDesktopApp(),
            }),
          );
          return;
        }

        try {
          const remoteSession = await remoteSignIn({
            email: values.email,
            password: values.password,
          });
          await mirrorRemoteAccount({ session: remoteSession, password: values.password });
          onAuthed(remoteSession);
        } catch (err) {
          // A server that says no is answered; a server that says nothing is
          // absent. Only the second one falls back — otherwise a wrong
          // password could be let through by unplugging the network.
          if (!looksOffline(err)) throw err;
          onAuthed(
            await signInOffline({
              email: values.email,
              password: values.password,
              remember: remember && !isDesktopApp(),
            }),
          );
        }
        return;
      }

      const session = isSignup
        ? await signUp({ name: values.name, email: values.email, password: values.password })
        : await signIn({
            email: values.email,
            password: values.password,
            remember: remember && !isDesktopApp(),
          });
      onAuthed(session);
    } catch (err) {
      setFormError(err.message);
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? 'signin' : 'signup');
    setErrors({});
    setFormError('');
    setValues((v) => ({ ...v, password: '', confirm: '' }));
  };

  const field = (key) => ({
    id: `auth-${key}`,
    value: values[key],
    onChange: set(key),
    'aria-invalid': errors[key] ? 'true' : undefined,
    'aria-describedby': errors[key] ? `auth-${key}-error` : undefined,
    className: errors[key] ? 'is-invalid' : '',
    disabled: busy,
  });

  return (
    <div className="auth">
      <button className="auth__theme" onClick={onToggleTheme} title="Toggle theme">
        {theme === 'dark' ? '☾' : '☀'}
      </button>

      {/* ------------------------ cinematic panel ------------------------ */}
      <section className="auth__stage" aria-hidden="true">
        <div className="auth__sprockets" />
        <div className="auth__stage-inner">
          <div className="auth__brand">
            <span className="auth__slate">◗</span>
            Kirukals
          </div>

          <h1 className="auth__headline">
            Everything starts<br />on page one.
          </h1>
          <p className="auth__sub">
            Industry-standard formatting, page-accurate breaks, and Fountain or Final Draft
            export — from the first slugline to FADE OUT.
          </p>

          <div className="auth__sample">
            {lines.map((line, i) => (
              <p key={i} className={`sample sample--${line.type}`}>
                {line.shown}
                {!line.done && line.shown && <span className="sample__caret" />}
              </p>
            ))}
          </div>

          <ul className="auth__points">
            <li>Tab and Enter move you through every element</li>
            <li>Scene navigator, cast breakdown and page count as you type</li>
            <li>Your drafts stay in this browser — no cloud, no lock-in</li>
          </ul>
        </div>
      </section>

      {/* -------------------------- script page -------------------------- */}
      <section className="auth__panel">
        <div className="sheet">
          <span className="sheet__holes" aria-hidden="true" />

          <p className="sheet__slug">{isSignup ? 'FADE IN:' : 'INT. YOUR DESK - CONTINUOUS'}</p>

          {guestExpired && (
            <p className="sheet__expired" role="status">
              Your 10-minute guest session ended and its drafts were erased. Create an account —
              accounts keep their work, and their own 10 free minutes.
            </p>
          )}

          <header className="sheet__head">
            <h2 className="sheet__title">{isSignup ? 'New Writer' : 'Welcome Back'}</h2>
            <p className="sheet__credit">{isSignup ? 'Written by' : 'Continue your draft'}</p>
          </header>

          {hasServer() && isDesktopApp() && (
            <div className="sheet__google">
              <button
                type="button"
                className="sheet__google-btn"
                disabled={busy || waitingForBrowser}
                onClick={withGoogle}
              >
                <svg viewBox="0 0 18 18" aria-hidden="true" width="17" height="17">
                  <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
                  <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
                  <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
                  <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.42 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
                </svg>
                {waitingForBrowser ? 'Waiting for your browser…' : 'Continue with Google'}
              </button>
              {waitingForBrowser && (
                <p className="sheet__hint">
                  Finish signing in in the browser window that just opened. This app takes over
                  as soon as you do.
                </p>
              )}
              {googleError && <p className="fld__error">{googleError}</p>}
              <div className="sheet__or"><span>or use an email address</span></div>
            </div>
          )}

          {googleConfigured() && !isDesktopApp() && (
            <div className="sheet__google">
              <div ref={googleRef} />
              {googleError && <p className="fld__error">{googleError}</p>}
              <div className="sheet__or"><span>or use an email address</span></div>
            </div>
          )}

          <form className="sheet__form" onSubmit={submit} noValidate>
            {isSignup && (
              <div className="fld">
                <label htmlFor="auth-name">Name</label>
                <input
                  {...field('name')}
                  ref={firstFieldRef}
                  type="text"
                  autoComplete="name"
                  placeholder="Jane Q. Screenwriter"
                />
                {errors.name && <p className="fld__error" id="auth-name-error">{errors.name}</p>}
              </div>
            )}

            <div className="fld">
              <label htmlFor="auth-email">Email</label>
              <input
                {...field('email')}
                ref={isSignup ? undefined : firstFieldRef}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
              />
              {errors.email && <p className="fld__error" id="auth-email-error">{errors.email}</p>}
            </div>

            <div className="fld">
              <label htmlFor="auth-password">Password</label>
              <div className="fld__wrap">
                <input
                  {...field('password')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                />
                <button
                  type="button"
                  className="fld__reveal"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {errors.password && <p className="fld__error" id="auth-password-error">{errors.password}</p>}

              {isSignup && values.password && (
                <div className="strength" aria-live="polite">
                  <div className="strength__track">
                    <i data-score={strength.score} style={{ width: `${(strength.score / 5) * 100}%` }} />
                  </div>
                  <span>{strength.label}</span>
                </div>
              )}
            </div>

            {isSignup && (
              <div className="fld">
                <label htmlFor="auth-confirm">Confirm password</label>
                <input
                  {...field('confirm')}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Type it once more"
                />
                {errors.confirm && <p className="fld__error" id="auth-confirm-error">{errors.confirm}</p>}
              </div>
            )}

            {!isSignup && !isDesktopApp() && (
              <label className="remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={busy}
                />
                Keep me signed in on this device
              </label>
            )}

            {!isSignup && isDesktopApp() && (
              <p className="remember remember--fixed">
                Closing Kirukals signs you out. Your scripts stay where they are.
              </p>
            )}

            {offline && hasServer() && !isSignup && (
              <p className={`sheet__offline${localCopy?.hasPassword ? ' sheet__offline--ready' : ''}`}>
                {localCopy?.hasPassword
                  ? 'No connection — you will be signed in against the copy on this device, and your work will sync when the network is back.'
                  : 'No connection. Sign-in works offline once you have signed in on this device with a connection at least once.'}
              </p>
            )}
            {offline && hasServer() && isSignup && (
              <p className="sheet__offline">
                No connection — a new account has to be made on the server first.
              </p>
            )}

            {formError && <p className="sheet__alert" role="alert">{formError}</p>}

            <button className="sheet__submit" type="submit" disabled={busy}>
              {busy ? 'One moment…' : isSignup ? 'Create account' : 'Sign in'}
            </button>

            <p className="sheet__switch">
              {isSignup ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" onClick={switchMode}>
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </p>

            <div className="sheet__or"><span>or</span></div>

            <button
              type="button"
              className="sheet__guest"
              onClick={() => onAuthed(startGuestSession())}
              disabled={busy || guestUsed}
              title={guestUsed ? 'The guest session on this browser has been used' : undefined}
            >
              {guestUsed ? 'Guest time already used' : 'Continue as a guest'}
            </button>
            <p className="sheet__note">
              {guestUsed
                ? 'Guest mode gives one 10-minute session per browser, and this one has been used. Create an account to keep writing.'
                : 'Accounts are stored in this browser only, so your pages never leave your machine. Guest mode lasts 10 minutes and its drafts are erased when the time is up.'}
            </p>
          </form>

          <p className="sheet__page-no">1.</p>
        </div>
      </section>
    </div>
  );
}
