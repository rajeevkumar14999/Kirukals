/**
 * Subscriptions.
 *
 * The plan is ₹99 a month, collected over UPI. Because there is no server to
 * receive a payment-service webhook, the loop is closed the way small Indian
 * businesses actually close it with a static UPI QR:
 *
 *   1. the writer scans, pays in their UPI app, and enters the 12-digit UTR
 *   2. the payment lands here as PENDING
 *   3. the admin checks it against the bank statement and approves it
 *   4. approval grants one month, chained onto any time already paid for
 *
 * That means entitlement is granted by a human, not verified cryptographically.
 * Anything trusted with real revenue needs a PSP (Razorpay/Cashfree/PhonePe)
 * plus a server that verifies the webhook signature — see the README.
 */

const MERCHANT_KEY = 'kirukals.merchant';
const PAYMENTS_KEY = 'kirukals.payments';

export const PLAN = {
  id: 'pro-monthly',
  name: 'Kirukals Pro',
  amountPaise: 9900, // ₹99 — integer paise, never a float
  periodLabel: 'month',
  features: [
    'Unlimited scripts',
    'Every export format — PDF, Final Draft, Fountain',
    'Scene navigator, cast breakdown and page stats',
    'Imports from .fdx, .fdr and zipped bundles',
  ],
};

/**
 * Preproduction is sold separately. A writer needs the pages; a director or
 * line producer needs the sheets — and the second is worth more than the
 * first, so it carries its own price and its own subscription.
 */
export const PRODUCTION_PLAN = {
  id: 'production-monthly',
  name: 'Kirukals Production',
  amountPaise: 49900, // ₹499
  periodLabel: 'month',
  features: [
    'Locations, with maps and scouting options',
    'Casting sheets with portfolios',
    'Shot division, generated from the script',
    'Budget with a printable top sheet',
    'Shoot plans with Plan A and Plan B call sheets',
    'A pitch deck that assembles itself',
  ],
};

export const PLANS = { [PLAN.id]: PLAN, [PRODUCTION_PLAN.id]: PRODUCTION_PLAN };
export const planById = (id) => PLANS[id] || PLAN;

/** How many scripts a free account may keep. Raise or remove to change the gate. */
export const FREE_SCRIPT_LIMIT = 3;

/* ----------------------------- merchant ---------------------------- */

export function loadMerchant() {
  try {
    return { vpa: '', payeeName: 'Kirukals', ...JSON.parse(localStorage.getItem(MERCHANT_KEY)) };
  } catch {
    return { vpa: '', payeeName: 'Kirukals' };
  }
}

export const saveMerchant = (merchant) =>
  localStorage.setItem(MERCHANT_KEY, JSON.stringify(merchant));

/* ----------------------------- payments ---------------------------- */

const readPayments = () => {
  try {
    return JSON.parse(localStorage.getItem(PAYMENTS_KEY)) || [];
  } catch {
    return [];
  }
};

const writePayments = (list) => localStorage.setItem(PAYMENTS_KEY, JSON.stringify(list));

export const listPayments = () => readPayments();

export const paymentsFor = (uid) => readPayments().filter((p) => p.uid === uid);

const newId = () => `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Record a claimed payment. It grants nothing until an admin verifies it. */
export function submitPayment({ session, txnRef, utr, plan = PLAN, amountPaise }) {
  const payment = {
    id: newId(),
    uid: session.uid,
    name: session.name,
    email: session.email || '',
    plan: plan.id,
    amountPaise: amountPaise ?? plan.amountPaise,
    txnRef,
    utr: String(utr).trim(),
    status: 'pending',
    createdAt: Date.now(),
    verifiedAt: null,
    verifiedBy: null,
    periodStart: null,
    periodEnd: null,
    note: '',
  };
  writePayments([...readPayments(), payment]);
  return payment;
}

const addMonth = (ts) => {
  const d = new Date(ts);
  const day = d.getDate();
  d.setMonth(d.getMonth() + 1);
  // Jan 31 + 1 month must not spill into March.
  if (d.getDate() < day) d.setDate(0);
  return d.getTime();
};

/**
 * Approve a payment and grant a month. Time is chained onto whatever the user
 * has already paid for, so paying early never loses days.
 */
export function verifyPayment(id, adminSession) {
  const list = readPayments();
  const i = list.findIndex((p) => p.id === id);
  if (i === -1) return null;

  const payment = list[i];
  const current = subscriptionFor(payment.uid);
  const start = Math.max(Date.now(), current.activeUntil || 0);

  list[i] = {
    ...payment,
    status: 'verified',
    verifiedAt: Date.now(),
    verifiedBy: adminSession?.name || 'admin',
    periodStart: start,
    periodEnd: addMonth(start),
  };
  writePayments(list);
  return list[i];
}

export function rejectPayment(id, note = '') {
  const list = readPayments();
  const i = list.findIndex((p) => p.id === id);
  if (i === -1) return null;
  list[i] = { ...list[i], status: 'rejected', verifiedAt: Date.now(), note };
  writePayments(list);
  return list[i];
}

/* --------------------------- entitlement --------------------------- */

/**
 * A user's standing, derived from their verified payments rather than a
 * separate mutable flag — so the ledger is always the source of truth.
 */
export function subscriptionFor(uid, planId = PLAN.id, now = Date.now()) {
  // Older payments predate the second product and are all Pro.
  const mine = paymentsFor(uid).filter((p) => (p.plan || PLAN.id) === planId);
  const verified = mine.filter((p) => p.status === 'verified');
  const activeUntil = verified.reduce((max, p) => Math.max(max, p.periodEnd || 0), 0);
  const pending = mine.some((p) => p.status === 'pending');

  let status = 'free';
  if (activeUntil > now) status = 'active';
  else if (verified.length) status = 'expired';
  else if (pending) status = 'pending';

  return {
    status,
    activeUntil,
    pending,
    daysLeft: activeUntil > now ? Math.ceil((activeUntil - now) / 86_400_000) : 0,
    payments: mine,
  };
}

export const isPro = (uid) => subscriptionFor(uid).status === 'active';

/**
 * The preproduction sheets are visible to everyone and editable by whoever has
 * paid for them. Admins are exempt: they should be able to see their own
 * product working without buying it from themselves.
 */
export const hasProduction = (session) =>
  session?.role === 'admin' ||
  subscriptionFor(session?.uid, PRODUCTION_PLAN.id).status === 'active';

/* ----------------------------- reporting --------------------------- */

export function revenueStats(now = Date.now()) {
  const list = readPayments();
  const verified = list.filter((p) => p.status === 'verified');
  const monthAgo = now - 30 * 86_400_000;

  const activeSubscribers = new Set(
    verified.filter((p) => (p.periodEnd || 0) > now).map((p) => p.uid),
  ).size;

  return {
    pending: list.filter((p) => p.status === 'pending').length,
    collectedPaise: verified.reduce((sum, p) => sum + p.amountPaise, 0),
    last30Paise: verified
      .filter((p) => (p.verifiedAt || 0) >= monthAgo)
      .reduce((sum, p) => sum + p.amountPaise, 0),
    activeSubscribers,
    // Everyone active renewing once at the plan price.
    mrrPaise: activeSubscribers * PLAN.amountPaise,
  };
}
