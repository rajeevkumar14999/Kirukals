/**
 * Which failures fall back to the copy on this device.
 *
 * This is the security boundary of offline sign-in: a server that answers is
 * obeyed, a server that is absent is worked around. Getting it backwards would
 * make a wrong password acceptable to anyone who pulls out a network cable.
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Node has a real navigator of its own, and it is read-only.
const net = { onLine: true };
Object.defineProperty(globalThis, 'navigator', { value: net, configurable: true });

const here = path.dirname(fileURLToPath(import.meta.url));
const { looksOffline } = await import(pathToFileURL(path.join(here, '..', 'src', 'backend', 'net.js')).href);

const ok = (c, l) => console.log((c ? '  ok   ' : '  FAIL ') + l);

ok(looksOffline(new Error('That email and password do not match an account.')) === false,
   'a rejected password does NOT fall back to the device');
ok(looksOffline(new Error('The server is refusing further attempts for the moment.')) === false,
   'a rate limit does NOT fall back');
ok(looksOffline(new Error('There is already an account with that email.')) === false,
   'a duplicate account does NOT fall back');
ok(looksOffline(new Error('Failed to fetch')) === true,
   'a dead network does fall back');
ok(looksOffline(new Error('NetworkError when attempting to fetch resource.')) === true,
   "the other browsers' wording for the same thing falls back");
ok(looksOffline(new Error('The server could not be reached. Check your connection.')) === true,
   'and the wording this app puts in front of a writer');

net.onLine = false;
ok(looksOffline(new Error('anything at all')) === true,
   'with the machine reporting no network, everything falls back');
