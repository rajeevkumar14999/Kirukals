const http = require('node:http');
const crypto = require('node:crypto');
const { shell } = require('electron');

/**
 * Signing in with Google from an installed application.
 *
 * This is the flow Google specifies for desktop programs, and it avoids every
 * problem the redirect approach had. The app opens a short-lived listener on
 * 127.0.0.1, sends the person to their own browser, and Google returns the
 * code to that loopback address — no custom URL scheme for Windows to
 * register, no site address for anything to be configured against, and the
 * browser never has to hand control back through the operating system.
 *
 * The exchange uses PKCE: the app invents a secret, sends only its hash to
 * Google, and proves possession when redeeming the code. A code intercepted in
 * transit is worthless without that secret, which never leaves this process.
 */

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';

const base64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A page the browser can be left on, so nobody is staring at a blank tab. */
const donePage = (ok, detail = '') => `<!doctype html><meta charset="utf-8">
<title>${ok ? 'Signed in' : 'Sign-in failed'}</title>
<style>
  body { margin:0; height:100vh; display:grid; place-items:center; background:#0e1013; color:#f4f4f2;
         font:16px/1.6 -apple-system,"Segoe UI",Roboto,sans-serif; text-align:center; }
  div { max-width:34ch; }
  b { display:block; font-size:22px; margin-bottom:8px; }
  span { color:#9aa1ab; font-size:14px; }
</style>
<div>
  <b>${ok ? 'Signed in to Kirukals' : 'Sign-in did not finish'}</b>
  <span>${ok ? 'You can close this tab and go back to the app.' : detail || 'Close this tab and try again.'}</span>
</div>`;

/**
 * Run the whole dance and return Google's tokens.
 * Resolves { idToken, accessToken }, or rejects with something readable.
 */
function signInWithGoogle({ clientId, clientSecret }) {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('No Google client ID is configured for the desktop app.'));
      return;
    }

    const verifier = base64url(crypto.randomBytes(32));
    const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
    const state = base64url(crypto.randomBytes(16));

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname !== '/callback') {
        res.writeHead(404).end();
        return;
      }

      const finish = (ok, detail) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(donePage(ok, detail));
        setImmediate(() => server.close());
      };

      const error = url.searchParams.get('error');
      if (error) {
        finish(false, error === 'access_denied' ? 'You cancelled the sign-in.' : error);
        reject(new Error(error === 'access_denied' ? 'Sign-in was cancelled.' : error));
        return;
      }

      if (url.searchParams.get('state') !== state) {
        finish(false, 'The reply did not match the request.');
        reject(new Error('The sign-in reply did not match the request it answered.'));
        return;
      }

      try {
        const body = new URLSearchParams({
          code: url.searchParams.get('code'),
          client_id: clientId,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: `http://127.0.0.1:${server.address().port}/callback`,
        });
        // A desktop client secret is not a secret in the usual sense, but
        // Google still expects it when the client was created as one.
        if (clientSecret) body.set('client_secret', clientSecret);

        const response = await fetch(TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        const tokens = await response.json();

        if (!response.ok || !tokens.id_token) {
          const detail = tokens.error_description || tokens.error || 'Google refused the exchange.';
          finish(false, detail);
          reject(new Error(detail));
          return;
        }

        finish(true);
        resolve({ idToken: tokens.id_token, accessToken: tokens.access_token });
      } catch (err) {
        finish(false, err.message);
        reject(err);
      }
    });

    server.on('error', reject);

    // Port 0 means "whatever is free" — nothing to configure, nothing to clash.
    server.listen(0, '127.0.0.1', () => {
      const redirect = `http://127.0.0.1:${server.address().port}/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account',
      });
      shell.openExternal(`${AUTH}?${params}`);
    });

    // Nobody should be left waiting on a browser tab they closed.
    setTimeout(() => {
      if (server.listening) {
        server.close();
        reject(new Error('Sign-in timed out. The browser window was left unfinished.'));
      }
    }, 5 * 60 * 1000);
  });
}

module.exports = { signInWithGoogle };
