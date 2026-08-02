/**
 * UPI payment links.
 *
 * A UPI QR is not a gateway integration — it is a `upi://pay?…` deep link
 * encoded as a QR code, defined by NPCI. Any UPI app (GPay, PhonePe, Paytm,
 * a bank app) reads it, pre-fills the payee and amount, and the payer
 * confirms. No API key, no PSP account, nothing server-side.
 *
 * What it cannot do is tell you the money arrived. That confirmation only
 * comes from the bank — a PSP webhook, or a human reading the statement.
 * See `subscription.js` for how this app closes that loop.
 */

// A VPA is <handle>@<psp>: letters, digits, dot, hyphen and underscore before
// the @, letters after it.
const VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

export const isValidVpa = (vpa) => VPA_RE.test(String(vpa || '').trim());

/** Rupees as the payer will see them: ₹99, ₹1,299. */
export const formatInr = (paise) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

/**
 * A reference the payer's app echoes back and the merchant can match against
 * their statement. Uppercase alphanumeric, well under the 35-char limit.
 */
export function newTxnRef(prefix = 'KRK') {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${stamp}${rand}`;
}

// UPI apps are picky about the note field; keep it to plain characters.
const cleanNote = (note) => String(note || '').replace(/[^\w\s.-]/g, '').slice(0, 50);

/**
 * Build the `upi://pay` URI.
 *
 * `amountPaise` is passed in paise so no float ever touches the money, and is
 * rendered with the two decimals UPI expects.
 */
export function buildUpiUri({ vpa, payeeName, amountPaise, note, txnRef }) {
  if (!isValidVpa(vpa)) throw new Error('That does not look like a valid UPI ID.');

  const params = new URLSearchParams();
  params.set('pa', String(vpa).trim());
  params.set('pn', String(payeeName || 'Kirukals').trim());
  params.set('cu', 'INR');
  if (amountPaise > 0) params.set('am', (amountPaise / 100).toFixed(2));
  if (note) params.set('tn', cleanNote(note));
  if (txnRef) params.set('tr', txnRef);

  // URLSearchParams encodes spaces as "+"; UPI apps expect %20.
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

/** UTR / RRN: the 12-digit reference a UPI app shows after a successful payment. */
export const isValidUtr = (utr) => /^\d{12}$/.test(String(utr || '').trim());
