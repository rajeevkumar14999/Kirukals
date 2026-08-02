/**
 * Sign in with Google.
 *
 * Google Identity Services hands back a signed ID token (a JWT). Most
 * browser-only implementations just base64-decode it and trust whatever is
 * inside — which anyone can forge with a text editor. This one verifies the
 * RS256 signature against Google's published keys with WebCrypto, then checks
 * the issuer, the audience and the expiry before believing a word of it.
 *
 * That makes the *sign-in* genuine. It does not make the session tamper-proof:
 * with no server, what happens after sign-in still lives in localStorage. See
 * the README.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CLIENT_ID_KEY = 'kirukals.googleClientId';

/**
 * The OAuth client ID. Baked in at build time if you set it, otherwise read
 * from settings so it can be pasted in without a rebuild.
 */
export function clientId() {
  const fromEnv = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
  if (fromEnv) return fromEnv;
  try {
    return localStorage.getItem(CLIENT_ID_KEY) || '';
  } catch {
    return '';
  }
}

export const setClientId = (id) => localStorage.setItem(CLIENT_ID_KEY, id.trim());

export const isConfigured = () => /\.apps\.googleusercontent\.com$/.test(clientId());

/* --------------------------- loading the SDK -------------------------- */

let loading = null;

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (loading) return loading;

  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () =>
      window.google?.accounts?.id
        ? resolve(window.google)
        : reject(new Error('Google sign-in loaded but did not initialise.'));
    script.onerror = () =>
      reject(new Error('Could not reach Google. Check your connection and try again.'));
    document.head.appendChild(script);
  });
  return loading;
}

/* ---------------------------- verification ---------------------------- */

const b64urlToBytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

let jwksCache = null;

async function googleKeys() {
  // Keys rotate, so a failed lookup refetches rather than trusting the cache.
  if (jwksCache && jwksCache.at > Date.now() - 3_600_000) return jwksCache.keys;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error('Could not fetch Google’s signing keys.');
  const { keys } = await res.json();
  jwksCache = { keys, at: Date.now() };
  return keys;
}

/**
 * Verify an ID token and return its claims. Throws if anything about it is
 * wrong — a bad signature, the wrong audience, or an expired token.
 */
export async function verifyIdToken(token, audience = clientId()) {
  const [headerB64, payloadB64, signatureB64] = String(token).split('.');
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error('That sign-in token is malformed.');

  const header = b64urlToJson(headerB64);
  if (header.alg !== 'RS256') throw new Error(`Unexpected token algorithm: ${header.alg}`);

  let keys = await googleKeys();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    jwksCache = null; // key rotated — try once with a fresh set
    keys = await googleKeys();
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error('That token was not signed by a key Google publishes.');

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(signatureB64),
    signed,
  );
  if (!valid) throw new Error('That sign-in token failed signature verification.');

  const claims = b64urlToJson(payloadB64);
  const issuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (!issuers.includes(claims.iss)) throw new Error('That token did not come from Google.');
  if (claims.aud !== audience) throw new Error('That token was issued for a different app.');
  if (claims.exp * 1000 < Date.now()) throw new Error('That sign-in expired — try again.');
  if (claims.email && claims.email_verified === false) {
    throw new Error('That Google account has an unverified email address.');
  }

  return claims;
}

/* ------------------------------ the button ---------------------------- */

/**
 * Render Google's own button into `element`. Using their button rather than a
 * lookalike is a requirement of the brand terms, and it is what users
 * recognise.
 */
export async function renderButton(element, { onProfile, onError, theme = 'dark' }) {
  if (!isConfigured()) throw new Error('No Google client ID has been set for this app.');

  const google = await loadGis();

  google.accounts.id.initialize({
    client_id: clientId(),
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async (response) => {
      try {
        const claims = await verifyIdToken(response.credential);
        onProfile({
          sub: claims.sub,
          email: claims.email,
          name: claims.name || claims.email?.split('@')[0] || 'Google user',
          picture: claims.picture || '',
          // The token itself, for trading with a server that wants proof
          // rather than a claim. Verified above before it is passed on.
          idToken: response.credential,
        });
      } catch (err) {
        onError(err);
      }
    },
  });

  google.accounts.id.renderButton(element, {
    type: 'standard',
    theme: theme === 'dark' ? 'filled_black' : 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    logo_alignment: 'left',
    width: 320,
  });
}

/** Forget the Google session so the next sign-in asks again. */
export function signOutGoogle() {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* nothing to clear */
  }
}
