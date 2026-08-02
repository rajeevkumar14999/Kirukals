import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// A fake browser, enough for the account store.
const mk = () => { const m = new Map(); return {
  getItem: (k) => (m.has(k) ? m.get(k) : null),
  setItem: (k, v) => m.set(k, String(v)),
  removeItem: (k) => m.delete(k),
}; };
globalThis.localStorage = mk();
globalThis.sessionStorage = mk();

const here = path.dirname(fileURLToPath(import.meta.url));
const S = await import(pathToFileURL(path.join(here, '..', 'src', 'auth', 'session.js')).href);
const ok = (c, l) => console.log((c ? '  ok   ' : '  FAIL ') + l);

const remote = { uid: 'srv-uid-123', name: 'Rajeev', email: 'R@Example.com ', role: 'admin' };

ok(S.offlineAccountFor('r@example.com') === null, 'nothing on the device before the first sign-in');

await S.mirrorRemoteAccount({ session: remote, password: 'correct horse' });

const copy = S.offlineAccountFor('r@example.com');
ok(copy?.hasPassword && copy.mirrored, 'the copy exists after a server sign-in');

const raw = JSON.parse(localStorage.getItem('kirukals.users'))[0];
ok(!JSON.stringify(raw).includes('correct horse'), 'the password itself is not stored');
ok(raw.id === 'srv-uid-123', "the copy is filed under the server's user id");

const s = await S.signInOffline({ email: 'r@example.com', password: 'correct horse' });
ok(s.uid === 'srv-uid-123' && s.offline === true && s.remote === true, 'offline sign-in returns the same account, marked offline');
ok(JSON.parse(localStorage.getItem('kirukals.session')).offline === true, 'the stored session is marked too');

let refused = false;
try { await S.signInOffline({ email: 'r@example.com', password: 'wrong' }); } catch { refused = true; }
ok(refused, 'a wrong password is refused offline');

let unknown = '';
try { await S.signInOffline({ email: 'someone@else.com', password: 'x' }); } catch (e) { unknown = e.message; }
ok(/no copy of that account/.test(unknown), 'an account never seen here is refused, and says why');

// A password changed on the server re-mirrors.
await S.mirrorRemoteAccount({ session: remote, password: 'a new one entirely' });
const after = await S.signInOffline({ email: 'r@example.com', password: 'a new one entirely' });
ok(after.uid === 'srv-uid-123', 'the copy follows a password change');
let stale = false;
try { await S.signInOffline({ email: 'r@example.com', password: 'correct horse' }); } catch { stale = true; }
ok(stale, 'the old password stops working offline');
ok(JSON.parse(localStorage.getItem('kirukals.users')).length === 1, 're-mirroring does not duplicate the account');
