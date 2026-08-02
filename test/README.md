# Tests

There is no test framework here. Each file is a script that prints `ok` or
`FAIL` per line and can be read top to bottom, which for a project this size is
worth more than a runner.

Two kinds:

- **Node tests** (`*.test.mjs`) check logic that has no screen — the account
  store, the network boundary. They run in a second.
- **Electron tests** (`*.cjs`) drive the *built* app in a real window, because
  the questions they answer — is typing fast, does the editor still work when
  most of it is not on screen — cannot be answered anywhere else. They need
  `npm run build` to have been run first.

```bash
npm test
```

That runs the Node tests. The Electron ones are listed below and are run one at
a time, because each wants the window to itself.

---

## The files

| File | Asks |
|---|---|
| `offline.test.mjs` | Does signing in with no network work, and does it refuse the things it should? |
| `net.test.mjs` | Which failures fall back to the device copy, and which do not? |
| `perf.cjs` | How long does a keystroke take in a long script? |
| `profile.cjs` | Where does that time go? |
| `smoke.cjs` | Does the editor still work when only some of its pages are built? |
| `save.cjs` | What does one autosave of a long script cost? |

---

## Node tests

```bash
node test/offline.test.mjs
node test/net.test.mjs
```

### `offline.test.mjs` — the account copy

Stubs `localStorage` and runs the real `src/auth/session.js`. Eleven checks,
all passing:

- nothing is on the device before the first sign-in
- a copy appears after a server sign-in, and is marked as a copy
- **the password itself is not stored** — the serialised record is searched for it
- the copy is filed under the server's user id, not a new local one
- offline sign-in returns the same account, marked `offline`
- the stored session is marked too
- a wrong password is refused
- an account never seen on this device is refused, and the message says why
- changing the password re-mirrors it
- the old password stops working afterwards
- re-mirroring does not leave two copies

### `net.test.mjs` — the fallback boundary

This is the security boundary of offline sign-in, so it is tested on its own.
A server that **answers** is obeyed; a server that is **absent** is worked
around. Backwards, and pulling out a network cable would be a way past a wrong
password. Seven checks, all passing — including that "email and password do not
match", a rate limit, and a duplicate account all refuse to fall back.

---

## Electron tests

Build first, and build it the way the desktop app is built — with relative
asset paths. A bundle built for a web root will not load over `file://` and the
harness will tell you so rather than hang:

```bash
npm run test:build
```

Then, one at a time:

```bash
npx electron test/perf.cjs
```

Each seeds a script of a given length into `localStorage` under a real account,
reloads into it, and drives the app.

`PERF_PAGES` sets the length (default 60). `PERF_URL` points somewhere else —
a dev server, say, though expect dev numbers to be several times worse than the
build a writer actually runs.

```bash
PERF_PAGES=120 npx electron test/perf.cjs
```

### `perf.cjs` — keystroke latency

Types thirty characters into a line and times each one from keypress to the
styled mirror having caught up and layout having been forced. It reports the
median, the 90th percentile and the worst, because what a writer notices is the
worst keystroke, not the mean one.

**It does not use the frame clock.** Chromium stops `requestAnimationFrame` in
a window that is not on screen, which pins every measurement at about 2000ms
and looks exactly like a performance problem. An earlier version of this
harness was fooled by that for several runs. What is timed now is the app's own
work on the main thread, which no amount of window management can fake.

### `profile.cjs` — where the time goes

The same run with a CPU profile attached through the Chrome DevTools Protocol,
printing self-time per function. This is what found each cause in turn: first
`ElementRow` re-rendering for every line in the script, then JSX creation for
pages nobody could see, then `extractCast` and `parseSlug` rebuilding the
panels before the letter appeared.

Run it against a dev server for readable function names — the built bundle is
minified and obfuscated, and the profile will say `a`, `b`, `c`.

### `smoke.cjs` — the editor with most of itself unbuilt

Only the pages near the window are built, so the things that could break are
worth naming. Six checks, all passing:

- every page is in the document (the sheets are all there; only their contents come and go)
- only the pages in view are built — 24 lines in the DOM, not 2,200
- a typed letter lands in the line
- Enter puts a new empty line under the caret
- scrolling deep builds those pages
- and they are released again once they are behind you
- the scene list jumps to a far scene and lands the caret in the right heading

Two of these were written the obvious way first and were wrong for it: counting
every line in the document is not a test of Enter, because pages build and
release themselves as the observer notices them and that number moves on its
own. They ask about the caret and about one named page now, and they wait for
the observer rather than assuming a delay.

### `save.cjs` — autosave cost

Times `JSON.stringify` and the `localStorage` write at 10, 60 and 120 pages.
Run when autosave is suspected of a pause. It has not been guilty yet:

| Script | Size | Stringify | Write |
|---|---|---|---|
| 10 pages | 77 KB | 0.5ms | 1.4ms |
| 60 pages | 464 KB | 3.2ms | 8.5ms |
| 120 pages | 928 KB | 6.9ms | 4.3ms |

---

## Results on record

Keystroke to settled, in the packaged build with obfuscation — the software as
installed, not a development server.

| Script | 1.4.0 | 1.5.0 |
|---|---|---|
| 10 pages | 2509ms | 9.7ms |
| 60 pages | 2697ms | 20ms |

The four causes, largest first, each found with `profile.cjs`:

| Cause | Cost |
|---|---|
| Obfuscator: split strings + string-array wrappers | 269ms against 34ms without |
| Every line re-rendered per keystroke (memo defeated by unstable handler props) | ~1200ms at 60 pages |
| Every page laid out, on screen or not | ~200ms at 60 pages |
| Panels — scene list, cast, locations, shots — rebuilt before the letter appeared | ~190ms at 60 pages |

Obfuscation settings, measured one at a time at 60 pages:

| Setting | Keystroke |
|---|---|
| No obfuscation | 34ms |
| What ships now: mangled names, shuffled string array | 35ms |
| + base64-encoded strings | 101ms |
| + split strings, wrappers, numeric expressions (what 1.4.0 shipped) | 269ms |

---

## What is not tested

Said plainly, so nobody mistakes a green run for coverage.

- **Nothing visual.** No test here would notice a menu opening off the edge of
  the screen, a dialog with white text on white, or a layout that breaks at a
  narrow window. Every UI change in this project has been checked by reading it
  and by building it, not by looking at it.
- **The server.** Nothing here talks to Supabase. Row-level security, the
  migrations and the sync are unproven by this suite.
- **Payment.** Still client-side, and still bypassable until a server webhook
  decides who has paid. No test can fix that; only the webhook can.
- **Google sign-in**, on either the web or the desktop. It needs a real Google
  account and a real browser.
- **Import and export.** Fountain, FDX and the PDF are checked by eye.
- **One unexplained hitch.** In one run of thirty keystrokes, a single one took
  six seconds while the rest were about 30ms. Autosave was ruled out with
  `save.cjs`. It has not been seen since and has not been explained.
