import { useState } from 'react';
import { Modal } from './Dialogs';
import { passwordStrength, changePassword as changeLocalPassword } from '../auth/session';
import { isConfigured as hasServer } from '../backend/supabase';
import { changeRemotePassword } from '../backend/account';
import { mirrorRemoteAccount } from '../auth/session';

/**
 * Changing a password.
 *
 * The current one is asked for even though the person is already signed in.
 * Being signed in proves a browser was left open, not that the owner is at the
 * keyboard — and on a local account there is no email to recover through, so
 * an unlocked laptop would otherwise be enough to take someone's work away.
 */
export default function PasswordDialog({ session, onClose, onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const strength = passwordStrength(next);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    if (next.length < 8) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    if (next === current) {
      setError('That is the password you already have.');
      return;
    }

    setBusy(true);
    try {
      if (hasServer()) {
        await changeRemotePassword({
          email: session.email,
          currentPassword: current,
          newPassword: next,
        });
        // The copy kept for signing in offline has to learn the new password
        // too, or the next flight would lock this account out of its own work.
        await mirrorRemoteAccount({ session, password: next });
      } else {
        await changeLocalPassword({
          uid: session.uid,
          currentPassword: current,
          newPassword: next,
        });
      }
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (session?.guest) {
    return (
      <Modal title="Change password" onClose={onClose}>
        <p className="hint">
          A guest session has no account and no password. Create an account to keep what you write
          and to sign in on another machine.
        </p>
      </Modal>
    );
  }

  if (done) {
    return (
      <Modal title="Password changed" onClose={onClose}>
        <p className="hint">
          Done. Use the new password the next time you sign in
          {hasServer() ? ', on any machine' : ' on this machine'}.
        </p>
        <div className="modal__actions">
          <button className="btn btn--primary" onClick={onClose}>Close</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Change password" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>
          <span>Current password</span>
          <input
            type="password"
            autoFocus
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          <span>New password</span>
          <input
            type="password"
            value={next}
            placeholder="At least 8 characters"
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        {next && (
          <div className="pw-meter">
            <i
              className={`pw-meter--${strength.score >= 4 ? 'strong' : strength.score >= 3 ? 'good' : 'weak'}`}
              style={{ width: `${(strength.score / 5) * 100}%` }}
            />
            <span>{strength.label}</span>
          </div>
        )}
        <label>
          <span>Confirm new password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        {error && <p className="fld__error">{error}</p>}

        <p className="hint">
          {session?.email
            ? `Changing the password for ${session.email}.`
            : 'Changing the password for this account.'}
          {hasServer()
            ? ' It applies everywhere you sign in.'
            : ' This account lives in this browser, so the change applies here.'}
        </p>

        <div className="modal__actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="submit"
            className="btn btn--primary"
            disabled={busy || !current || !next || !confirm}
          >
            {busy ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
