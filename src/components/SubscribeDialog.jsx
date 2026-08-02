import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from './Dialogs';
import { PLAN, loadMerchant, submitPayment, subscriptionFor } from '../billing/subscription';
import { buildUpiUri, formatInr, isValidUtr, isValidVpa, newTxnRef } from '../billing/upi';
import '../styles/billing.css';

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function SubscribeDialog({ session, onClose, onChanged, blocking, onSignOut, plan = PLAN }) {
  const merchant = useMemo(loadMerchant, []);
  const [txnRef] = useState(() => newTxnRef());
  const [utr, setUtr] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [copied, setCopied] = useState('');
  const [refresh, setRefresh] = useState(0);
  const canvasRef = useRef(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read the ledger after submitting
  const sub = useMemo(() => subscriptionFor(session.uid, plan.id), [session.uid, submitted, refresh]);
  const configured = isValidVpa(merchant.vpa);
  // A claim already in the queue — submitted just now, or found after a reload.
  const awaiting = sub.payments.find((p) => p.status === 'pending');

  const upiUri = useMemo(() => {
    if (!configured) return '';
    return buildUpiUri({
      vpa: merchant.vpa,
      payeeName: merchant.payeeName,
      amountPaise: plan.amountPaise,
      note: `${plan.name} ${txnRef}`,
      txnRef,
    });
  }, [configured, merchant.vpa, merchant.payeeName, txnRef, plan]);

  // Render the QR onto a canvas at a size that scans reliably from a phone.
  useEffect(() => {
    if (!upiUri || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, upiUri, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    }).catch(() => setError('Could not render the QR code.'));
  }, [upiUri]);

  const copy = async (value, what) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setError('Could not copy — select the text and copy it manually.');
    }
  };

  const confirm = () => {
    setError('');
    if (!isValidUtr(utr)) {
      setError('Enter the 12-digit UPI reference (UTR) shown in your payment app.');
      return;
    }
    submitPayment({ session, txnRef, utr, plan });
    setSubmitted(true);
    onChanged?.();
  };

  return (
    <Modal title="Kirukals Pro" onClose={onClose} wide blocking={blocking}>
      <div className="sub">
        {blocking && (
          <p className="sub__wall">
            <b>Your free 10 minutes are up.</b> Subscribe to keep writing — your scripts are saved
            and waiting.
          </p>
        )}

        <header className="sub__plan">
          <div>
            <h3>{plan.name}</h3>
            <p>Everything in Kirukals, billed monthly. Cancel by simply not renewing.</p>
          </div>
          <div className="sub__price">
            <b>{formatInr(plan.amountPaise)}</b>
            <span>per {plan.periodLabel}</span>
          </div>
        </header>

        <ul className="sub__features">
          {plan.features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>

        {sub.status === 'active' && (
          <p className="sub__state sub__state--ok">
            Active until <b>{fmtDate(sub.activeUntil)}</b> — {sub.daysLeft} days left. Paying again
            adds another month on top.
          </p>
        )}
        {sub.status === 'expired' && (
          <p className="sub__state">Your last month ended on {fmtDate(sub.activeUntil)}.</p>
        )}

        {awaiting ? (
          <div className="sub__done">
            <span className="sub__spinner" aria-hidden="true" />
            <h4>Waiting for approval</h4>
            <p>
              Reference <code>{awaiting.txnRef}</code> · UTR <code>{awaiting.utr}</code>
            </p>
            <p className="hint">
              {blocking
                ? 'The writing pad stays locked until an admin matches this against the bank statement and approves it. This screen unlocks itself the moment they do.'
                : 'An admin checks this against the bank statement and approves it. Your month starts the moment they do.'}
            </p>
            <div className="sub__done-actions">
              <button className="btn" onClick={() => setRefresh((n) => n + 1)}>Check again</button>
              {!blocking && (
                <button className="btn btn--primary" onClick={onClose}>Close</button>
              )}
            </div>
          </div>
        ) : !configured ? (
          <p className="sub__state sub__state--warn">
            No UPI ID has been set for this app yet. An admin sets the receiving UPI ID under
            <b> Admin → Payments</b> before subscriptions can be collected.
          </p>
        ) : (
          <>
            <div className="sub__pay">
              <div className="sub__qr">
                <canvas ref={canvasRef} aria-label={`UPI QR code for ${formatInr(plan.amountPaise)}`} />
                <b className="sub__qr-amount">{formatInr(plan.amountPaise)}</b>
                <span>Scan with any UPI app</span>
              </div>

              <div className="sub__details">
                <ol className="sub__steps">
                  <li>Scan the QR — or open the link on this phone.</li>
                  <li>Confirm the {formatInr(plan.amountPaise)} payment in your app.</li>
                  <li>Copy the 12-digit UTR your app shows and paste it below.</li>
                </ol>

                {/* The payer sees the amount and the QR — never the receiving
                    UPI ID as text. (It is necessarily encoded inside the QR.) */}
                <dl className="sub__kv">
                  <div>
                    <dt>Amount payable</dt>
                    <dd><code className="sub__amount">{formatInr(plan.amountPaise)}</code></dd>
                  </div>
                  <div>
                    <dt>Reference</dt>
                    <dd>
                      <code>{txnRef}</code>
                      <button className="linkish" onClick={() => copy(txnRef, 'ref')}>
                        {copied === 'ref' ? 'copied' : 'copy'}
                      </button>
                    </dd>
                  </div>
                </dl>

                <a className="btn sub__open" href={upiUri}>Open in a UPI app</a>
              </div>
            </div>

            {session.guest && (
              <p className="sub__state sub__state--warn">
                Guest sessions cannot hold a subscription. Create an account first — your guest
                drafts stay in this browser until you sign out.
              </p>
            )}

            <div className="sub__confirm">
              <label htmlFor="utr">After paying, enter the UTR / UPI reference number</label>
              <div className="sub__confirm-row">
                <input
                  id="utr"
                  inputMode="numeric"
                  maxLength={12}
                  placeholder="12 digits"
                  value={utr}
                  onChange={(e) => setUtr(e.target.value.replace(/\D/g, ''))}
                />
                <button className="btn btn--primary" onClick={confirm}>I have paid</button>
              </div>
              {error && <p className="sub__error" role="alert">{error}</p>}
              <p className="hint">
                Submitting records the claim; it does not confirm it. Kirukals has no server, so the
                payment is matched against the bank statement by an admin before the month is granted.
              </p>
            </div>
          </>
        )}

        {blocking && (
          <p className="sub__wall-exit">
            Not now? <button className="linkish" onClick={onSignOut}>Sign out</button> — nothing is
            lost, and the ten minutes start again next time you sign in.
          </p>
        )}

        {sub.payments.length > 0 && !awaiting && (
          <section className="sub__history">
            <h4>Your payments</h4>
            <table className="data-table">
              <tbody>
                {[...sub.payments].reverse().slice(0, 6).map((p) => (
                  <tr key={p.id}>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td><code>{p.utr}</code></td>
                    <td className="num">{formatInr(p.amountPaise)}</td>
                    <td>
                      <span className={`pill pill--${p.status}`}>{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </Modal>
  );
}
