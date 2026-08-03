import { useEffect, useState } from 'react';
import { Modal } from './Dialogs';
import { PLAN } from '../billing/subscription';
import { refreshLicence } from '../billing/licence';
import { formatInr } from '../billing/upi';
import '../styles/billing.css';

/**
 * Buying a licence.
 *
 * The payment happens on the website, not here, and that is not laziness — it
 * is the only version that can be trusted. Money confirmed inside this program
 * is money confirmed by a program on somebody else's computer, and that
 * program will say whatever they want it to. On the website, Razorpay tells
 * the server, the server writes the licence, and this app reads it. Nothing in
 * the chain is anybody's word for it.
 *
 * It also means no card number, no UPI reference and no bank record ever
 * passes through here — a smaller support burden, and a far smaller thing to
 * get wrong.
 */

const SITE = (import.meta.env.VITE_SITE_URL || 'https://milliondollarscriptsuite.com').replace(/\/$/, '');
const BUY = `${SITE}/account`;

export default function SubscribeDialog({ session, onClose, onChanged, blocking, onSignOut, plan = PLAN }) {
  const [opened, setOpened] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState('');

  const open = () => {
    setOpened(true);
    setNote('');
    // In the installed app the browser is where a payment belongs: it has the
    // person's saved cards and their bank's app, and this window has neither.
    if (window.kirukals?.auth?.open) window.kirukals.auth.open(BUY);
    else window.open(BUY, '_blank', 'noopener');
  };

  /** Ask the server whether the money arrived. */
  const check = async () => {
    if (checking) return;
    setChecking(true);
    setNote('');
    try {
      const licence = await refreshLicence(session.uid);
      if (licence.active) {
        onChanged?.();
        onClose?.();
        return;
      }
      setNote(
        licence.offline
          ? 'Could not reach the server. Try again when you have a connection.'
          : 'No payment against this account yet. If you have just paid, give it a few seconds and check again.',
      );
    } finally {
      setChecking(false);
    }
  };

  // Coming back to this window is the usual sign somebody has finished paying,
  // so that is when to look — rather than making them find a button.
  useEffect(() => {
    if (!opened) return undefined;
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal
      title={blocking ? 'Your trial has ended' : 'Upgrade'}
      onClose={blocking ? undefined : onClose}
      blocking={blocking}
    >
      <div className="plan-card">
        <header>
          <div>
            <h2>{plan.name}</h2>
            <p className="plan-card__price">{formatInr(plan.amountPaise)} / month</p>
          </div>
        </header>

        <ul className="plan-card__list">
          <li>Unlimited scripts</li>
          <li>Every export format — PDF, Final Draft, Fountain</li>
          <li>Scene navigator, cast breakdown and page stats</li>
          <li>The whole preproduction suite — shots, costumes, budget, call sheets</li>
        </ul>

        <p className="hint">
          Paying happens on our website, by UPI, card or netbanking through Razorpay. Your card
          details never touch this program, and the licence appears here by itself once the
          payment clears.
        </p>

        {!opened ? (
          <button className="btn btn--primary btn--wide" onClick={open}>
            Pay {formatInr(plan.amountPaise)} on the website
          </button>
        ) : (
          <>
            <p className="hint">
              The website is open in your browser. Finish there and come back — this window will
              notice.
            </p>
            <div className="modal__actions">
              <button className="btn" onClick={open}>Open it again</button>
              <button className="btn btn--primary" disabled={checking} onClick={check}>
                {checking ? 'Checking…' : 'I have paid — check now'}
              </button>
            </div>
          </>
        )}

        {note && <p className="fld__error">{note}</p>}

        <p className="hint">
          Your scripts are on this machine and stay there whether you pay or not. An expired
          licence stops new work and closes the production tools; it never stops you opening or
          exporting what you have already written.
        </p>

        {blocking && (
          <div className="modal__actions">
            <button className="btn" onClick={onSignOut}>Sign out</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
