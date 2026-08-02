/**
 * Local account store.
 *
 * Kirukals has no server, so accounts live in this browser only. Passwords
 * are never stored — we keep a PBKDF2-SHA256 hash (200k iterations) with a
 * per-user random salt, so a glance at localStorage does not hand over anyone's
 * password. That is the right hygiene for a local-first app, but it is not a
 * substitute for server-side auth: anything in localStorage is readable by any
 * script running on this origin.
 */

const USERS_KEY = 'kirukals.users';
const SESSION_KEY = 'kirukals.session';
const ITERATIONS = 200000;

const enc = new TextEncoder();
const toHex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

function randomHex(bytes = 16) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function derive(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(saltHex), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(bits);
}

// Constant-time-ish comparison so a wrong password does not leak its prefix.
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY)) || [];
  } catch {
    return [];
  }
}

const writeUsers = (users) => localStorage.setItem(USERS_KEY, JSON.stringify(users));

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

export const emailLooksValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));

export function passwordStrength(password) {
  const pw = String(password || '');
  if (!pw) return { score: 0, label: '' };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^\w\s]/.test(pw)) score++;
  const label = ['Too short', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][Math.min(score, 5)];
  return { score: Math.min(score, 5), label };
}

export const accountsExist = () => readUsers().length > 0;

/**
 * Sign in with a verified Google profile.
 *
 * Matched on Google's stable subject id first, then on the email — so someone
 * who signed up with a password can add Google to the same account rather than
 * ending up with two. There is no password to store either way.
 */
export function signInWithGoogle(profile) {
  const users = ensureAdmin(readUsers());
  const email = normalizeEmail(profile.email);
  const existing = users.find((u) => u.googleSub === profile.sub || (email && u.email === email));

  if (existing) {
    const merged = {
      ...existing,
      googleSub: profile.sub,
      name: existing.name || profile.name,
      picture: profile.picture || existing.picture || '',
    };
    writeUsers(users.map((u) => (u.id === existing.id ? merged : u)));
    return startSession(merged, true);
  }

  const user = {
    id: `u_${randomHex(8)}`,
    name: profile.name,
    email,
    role: users.length === 0 ? 'admin' : 'member',
    provider: 'google',
    googleSub: profile.sub,
    picture: profile.picture || '',
    // No salt or hash: this account has no password to verify.
    createdAt: Date.now(),
  };
  writeUsers([...users, user]);
  return startSession(user, true);
}

/**
 * The first account created on a device owns it. Accounts made before roles
 * existed have none, so the earliest one is promoted on first read.
 */
function ensureAdmin(users) {
  if (!users.length || users.some((u) => u.role === 'admin')) return users;
  const earliest = users.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  const patched = users.map((u) => (u.id === earliest.id ? { ...u, role: 'admin' } : { ...u, role: u.role || 'member' }));
  writeUsers(patched);
  return patched;
}

export const isAdmin = (session) => session?.role === 'admin';

/** Everyone with an account on this device, without the password material. */
export function listUsers() {
  return ensureAdmin(readUsers()).map(({ id, name, email, role, createdAt }) => ({
    id,
    name,
    email,
    role: role || 'member',
    createdAt,
  }));
}

export async function signUp({ name, email, password }) {
  const cleanEmail = normalizeEmail(email);
  const cleanName = String(name || '').trim();

  if (!cleanName) throw new Error('Tell us what to put on the title page.');
  if (!emailLooksValid(cleanEmail)) throw new Error('That email address does not look right.');
  if (String(password).length < 8) throw new Error('Use at least 8 characters for your password.');

  const users = readUsers();
  if (users.some((u) => u.email === cleanEmail)) {
    throw new Error('An account already exists for that email. Try signing in.');
  }

  const salt = randomHex();
  const user = {
    id: `u_${randomHex(8)}`,
    name: cleanName,
    email: cleanEmail,
    // Whoever sets up the device administers it.
    role: users.length === 0 ? 'admin' : 'member',
    salt,
    hash: await derive(password, salt),
    createdAt: Date.now(),
  };
  writeUsers([...users, user]);
  return startSession(user, true);
}

export async function signIn({ email, password, remember = true }) {
  const cleanEmail = normalizeEmail(email);
  const user = ensureAdmin(readUsers()).find((u) => u.email === cleanEmail);

  // Derive regardless of whether the account exists, so the response time does
  // not reveal which emails are registered.
  const attempt = await derive(password, user?.salt || 'no-such-user');
  if (!user || !user.hash || !equal(attempt, user.hash)) {
    // An account created through Google has no password to check against.
    if (user && !user.hash) {
      throw new Error('That account uses Google sign-in — use the Google button above.');
    }
    throw new Error('That email and password combination did not match.');
  }
  return startSession(user, remember);
}

function startSession(user, remember) {
  const session = {
    uid: user.id,
    name: user.name,
    email: user.email,
    role: user.role || 'member',
    provider: user.provider || 'password',
    picture: user.picture || '',
    guest: false,
    startedAt: Date.now(),
  };
  const store = remember ? localStorage : sessionStorage;
  store.setItem(SESSION_KEY, JSON.stringify(session));
  (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY);
  return session;
}

export function startGuestSession() {
  const session = { uid: 'guest', name: 'Guest writer', email: '', role: 'guest', guest: true, startedAt: Date.now() };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem(SESSION_KEY);
  return session;
}

export function currentSession() {
  for (const store of [sessionStorage, localStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore malformed session */
    }
  }
  return null;
}

export function signOut() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(SESSION_KEY);
}
