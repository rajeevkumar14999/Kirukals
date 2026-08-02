# Kirukals

A browser-based screenplay editor in the spirit of WriterSolo / WriterDuet: type
continuously and the software handles the formatting, page geometry and export
formats for you.

```bash
npm install
npm run dev
```

Everything runs client-side — no server. Scripts are stored in `localStorage`
and autosave about 0.7s after you stop typing.

## Using it offline, as installed software

Kirukals installs as a desktop app and runs with **no network at all** — it gets
its own window, its own Start Menu / Dock entry, and opens without a browser
address bar.

```bash
npm install
npm run build
npm run app      # serves the built app at localhost:4173 and opens it
```

In Chrome or Edge, click the **Install** button in the toolbar (or the install
icon in the address bar). That is it — the app is now on the machine.

Verified rather than assumed: with the service worker installed, the server was
killed outright and the app still loaded and rendered on reload, while a direct
network request to the same origin failed. The build precaches every asset
(~395 KiB) and any in-app address falls back to the shell, so reloading offline
never lands on a browser error page.

**What works offline:** everything except Google sign-in, which needs to reach
Google. Email accounts, guest mode, writing, pagination, the community board,
import and export, and PDF printing are all local already.

**Where the writing lives:** in the browser profile's storage for that origin,
which the installed app shares. It is not a file on disk you can copy, so treat
**Export → Backup (.json)** as your save-a-copy: it round-trips exactly. Clearing
site data erases scripts, accounts and everything else.

**Keeping it installed after development.** `npm run app` needs the project
folder present. To hand it to someone else, put `dist/` on any static host
(Netlify, GitHub Pages, a LAN box) and install from there — a PWA needs
`https://` or `localhost`, not `file://`, which is why double-clicking
`dist/index.html` will not work.

### If you want a real `.exe` installer

A PWA cannot be an installer file you email to someone. For that, wrap the same
`dist/` in a desktop shell:

| | Installer size | Needs | Notes |
|---|---|---|---|
| **Tauri** | ~5–10 MB | Rust toolchain | Uses the OS webview; produces `.msi`/`.exe`, `.dmg`, `.deb` |
| **Electron** | ~150 MB | Node only | Bundles Chromium; simplest to set up |

Either way the app code is unchanged — they load the same build. Tauri is the
better fit here given how small the app is. Ask and I will add it.


## Accounts

### Sign in with Google

The sign-in page offers **Continue with Google** above the email form, using
Google's own button (their brand terms require it, and it is what people
recognise).

**Setup — you need your own OAuth client, it takes two minutes:**

1. Open [Google Cloud → Credentials](https://console.cloud.google.com/apis/credentials)
2. *Create credentials → OAuth client ID → Web application*
3. Under **Authorised JavaScript origins** add the address you run the app on —
   `http://localhost:5173` for development, your real domain in production
4. Copy the client ID (it ends in `.apps.googleusercontent.com`) and either put
   it in `.env` as `VITE_GOOGLE_CLIENT_ID=…` or paste it into
   **Admin → Google sign-in**, which needs no rebuild

The client ID is **public** — it identifies the app and authorises nothing, so
it is safe in the front-end bundle. There is no client *secret* in this flow.
Until it is set, the button simply is not shown and nothing else changes: email
sign-up and guest mode work exactly as before, and Google's script is never
even fetched.

**Tokens are verified, not just decoded.** Most browser-only Google logins
base64-decode the ID token and trust what is inside, which anyone can forge in a
text editor. [`src/auth/google.js`](src/auth/google.js) verifies the RS256
signature against Google's published JWKS using WebCrypto, then checks the
issuer, the audience (must be *this* client ID), the expiry, and that the email
is verified. Tests cover a valid token plus every forgery shape: wrong signing
key, edited payload, `alg: none`, `HS256` algorithm confusion, another app's
audience, another issuer, expired, unverified email, and an unknown key id.

A Google account is matched to an existing one by Google's stable subject id
first and the email address second, so signing in with Google after having
signed up with a password lands on the same account rather than creating a
duplicate. Accounts created through Google have no password stored; trying to
sign in with a password against one says so instead of failing vaguely.

**What this does not fix:** the session that follows still lives in
`localStorage`, so the sign-in is real but the session is not tamper-proof.
Google proves who someone is; only a server can stop them editing what happens
next.

The sign-in and sign-up pages are the entry point: a lit stage on the left that
types out a sample scene, and the form set on a three-hole-punched script page
on the right.

Accounts are local to the browser. Passwords are never stored — `src/auth/session.js`
keeps a PBKDF2-SHA256 hash (200,000 iterations) with a random per-user salt,
compares it in constant time, and derives a hash even for unknown emails so the
response time does not reveal which addresses are registered. Sign-in failures
are deliberately vague for the same reason.

- **Keep me signed in** stores the session in `localStorage`; otherwise it lives
  in `sessionStorage` and ends with the tab.
- **Continue as a guest** skips the form entirely. Guest drafts are deleted on
  sign out, which the page says up front.
- Each account gets its own script library (`kirukals.index.<uid>`), and any
  scripts written before accounts existed are merged into the first library that
  opens.

This is the right hygiene for a local-first app, but it is not server-side auth:
anything in `localStorage` is readable by any script on this origin. Swap
`session.js` for real API calls if you ever put this behind a backend.

## Profile & community board

The account menu has **Profile & community**, and the toolbar has a bell with an
unread count. Inside are four tabs: **Community**, **My posts**, **My replies**
and **Notifications**.

### Posting a requirement

Anyone can post what they need — role, location, budget, deadline, a description
— and attach an **enquiry sheet**: the questions an applicant must answer before
the poster sees them. The sheet starts with the questions that actually decide
whether someone can take the job and is fully editable:

- Which city are you based in?
- When can you start?
- How much time can you give this each week? *(under 10 / 10–20 / 20–40 / full time)*
- Which languages do you write in?
- Share a sample, credit or link

Add, remove, retype or re-type any of them — short answer, long answer, date, or
a choose-one with your own options — and mark which are required. Posting
notifies **everyone else** on the board; the author is excluded from their own
broadcast.

### Replying and being chosen

Interested writers open the sheet, answer, and add anything else they want the
poster to know. Their answers go only to the poster, who reads every reply side
by side in **My posts** and picks one person.

Choosing does three things at once: the post becomes `filled`, the chosen
applicant gets a *You were picked* notification with the note that the poster has
their email, and **everyone else is told the post is filled** — the part boards
usually skip and applicants always resent. One reply per person per post.

### Chat

Every post has a **Chat** button, the way a classifieds app does it — you can
ask the poster a question without filling in the enquiry sheet first, and you can
still chat after replying. From **My posts**, the poster can start a conversation
with any applicant (*Chat with Arun*).

A conversation is always **about one post, between its poster and one other
person**, so neither side ever loses track of which requirement is being
discussed — the thread header names it and links back to it. The **Messages** tab
is the familiar two-pane layout: conversations on the left with unread counts and
a preview of the last line, the exchange on the right, your messages on the
right-hand side in the accent colour.

Every message notifies the recipient, and that notification links straight into
the conversation rather than to the post. Opening a thread marks both its
messages and its notifications read. Since `localStorage` fires no change event
in its own tab, the open thread polls every three seconds, and a `storage`
listener picks up a second tab immediately.

### Who is online

Presence is derived from the same heartbeat the admin dashboard counts — no
extra bookkeeping — so it is honest by construction: it reflects the app being
open in a visible tab.

| State | Meaning |
| --- | --- |
| **online** (green) | a session is still beating — seen within 90 seconds |
| **away** (amber) | here within the last 10 minutes |
| **offline** (hollow) | longer than that; the label says *last seen 20m ago* |

The heartbeat is every 30 seconds and the online window is 90, so three missed
beats are tolerated — a slow tab never blinks someone offline and back. Dots
appear next to the poster on every requirement, next to each applicant in the
replies list, in the conversation list, and in the chat header with a written
label. Status is never colour-alone: every dot carries a title, and the chat
header spells it out.

The profile header shows a live **N online** count, refreshed every 15 seconds.

**Presence is opt-out.** *Show when I'm online* in the profile header turns it
off; from then on that account reads as hidden — no dot anywhere, and excluded
from the online count. Off means off, not "invisible but still counted".

### Messages pop up while you write

A message that arrives while you are in the editor appears as a toast in the
bottom-right corner and **clears itself after 30 seconds** — long enough to read
and act on, short enough that it never becomes furniture. It shows who wrote,
which post it is about, and the message; clicking it opens that conversation,
and ✕ dismisses it for good. A thin bar runs down over the 30 seconds so the
toast never vanishes without warning.

Each toast carries its own deadline, so a second message arriving does not
restart or cut short the first one's half-minute; up to three stack at once.
Only messages that arrive *after* the editor loads pop — signing in never dumps
a backlog over the page, which is what the bell's unread count is for. Your own
outgoing messages never toast back at you, and guests (who have no
conversations) never see them.

### Scope

Same limitation as the rest of the app: the board lives in `localStorage`, so it
is shared between accounts **on this browser** and cannot reach writers on other
machines. The data model
([`src/community/store.js`](src/community/store.js)) is written as posts,
applications and notifications precisely so it maps onto tables when there is a
server; the notifications are already addressed (`audience: 'all' | <uid>`) the
way a push or email fan-out would need.

## Subscription — ₹99 / month over UPI

Kirukals Pro is ₹99 a month, collected with a UPI QR. The **Upgrade ₹99** chip in
the toolbar opens the payment screen; once a payment is approved the same chip
reads `Pro · 31d`.

### The QR is a UPI deep link, not a gateway

[`src/billing/upi.js`](src/billing/upi.js) builds an NPCI `upi://pay?…` URI —
payee address, payee name, `am=99.00`, `cu=INR`, and a unique transaction
reference — and renders it as a QR. Any UPI app (GPay, PhonePe, Paytm, a bank
app) scans it and pre-fills the payment. No PSP account, no API key, nothing
server-side. The generated QR was decoded back in a test to confirm it reads as
*pay ₹99.00 to <your VPA>* rather than merely looking like a QR.

The receiving UPI ID is **yours to set**: Admin → Payments → *Receiving UPI ID*.
Until it is set, the subscribe screen says so instead of showing a QR.

**The payer never sees the UPI ID as text.** Their screen shows the QR, the
amount payable (twice — under the QR and in the detail list) and the payment
reference. The ID itself is only ever inside the QR and the *Open in a UPI app*
link, because a UPI payment cannot be addressed without it — so it is out of the
interface, not secret.

### How a payment becomes a subscription

A UPI deep link cannot tell you the money arrived — that confirmation only comes
from the bank. With no server to receive a PSP webhook, the loop closes the way
small Indian businesses close it with a static QR:

1. the writer scans, pays, and enters the 12-digit **UTR** their app shows
2. the payment lands in the ledger as **pending** — it grants nothing
3. the admin checks the UTR against the bank statement and approves it
4. approval grants one month, **chained** onto any time already paid for, so
   paying early never loses days

Admin → Payments lists every claim with its UTR and reference, approve/reject
buttons, and revenue tiles (pending, collected all-time, collected in 30 days,
active subscribers, MRR).

### What this is not

**Entitlement here is granted by a human, and enforced only in the browser.**
Nothing verifies cryptographically that money moved, and anyone who can edit
`localStorage` can grant themselves Pro. That is acceptable for a local-first
tool billing a handful of writers you know; it is not acceptable for real
revenue at scale.

To make it real you need a server, and the shape barely changes: create an order
with **Razorpay / Cashfree / PhonePe**, let their SDK render the QR or collect
the payment, and have your backend verify the webhook signature and write the
entitlement. `submitPayment` / `verifyPayment` in
[`subscription.js`](src/billing/subscription.js) are the two seams — replace
their bodies with API calls and the rest of the UI is unchanged.

### The free trial — 10 minutes per account, once

An account gets **10 minutes of free use in total**
([`src/billing/trial.js`](src/billing/trial.js), `TRIAL_MS`) — not per login. The
toolbar chip counts it down (`Free trial · 7m 12s`) and turns red for the last
two minutes. At zero the subscribe screen opens as a **blocking** paywall: no ✕,
Esc and backdrop clicks do nothing, and the editor is veiled behind it. The only
ways past are paying or signing out, and signing out is offered inside the dialog
so nobody feels trapped — work is autosaved either way.

Signing out does **not** refund the clock. The next sign-in on a spent account
opens the payment screen immediately, before any writing happens.

### The pad stays locked until an admin approves

Submitting a payment does not unlock anything — a *pending* claim is not a paid
account. The lock is derived state, not a dialog you can close:

```
locked = trial spent && subscription is not active
```

so it survives closing the dialog, pressing Esc, clicking the backdrop, and
reloading the page. After submitting, the screen becomes **Waiting for
approval**, showing the reference and UTR with a *Check again* button; the only
other way out is signing out. While locked the app re-reads the payment ledger
every four seconds, so when an admin approves on that device the wall lifts on
its own — no reload, no re-login.

The clock counts the same thing the admin dashboard counts — time in a
**visible** tab — so a backgrounded tab does not burn it, and elapsed time is
persisted so refreshing hands out nothing. Paid accounts are never timed, and
neither is the **admin** — whoever runs the install is not charged to use it.

Free accounts also keep **3 scripts** (`FREE_SCRIPT_LIMIT`); creating a fourth
shows the upgrade.

### Guests — 10 minutes, then the drafts are erased

Guest mode is one 10-minute window **per browser**. Guests see the countdown as
`Guest · 7m 12s` (a label, not a button — a guest has no account to attach a
subscription to). When it reaches zero:

1. every guest script and index entry is deleted from storage
2. the session ends and the sign-in page returns, saying what happened
3. **Continue as a guest** is disabled from then on — the button reads *Guest
   time already used*

So guest mode is a trial of the app, not a way to work for free indefinitely.

### Support: giving time back

`resetTrial(uid)` in `trial.js` restores an account's ten minutes — the seam to
wire to a button if you ever need to hand someone a second look.

## Admin dashboard

The first account created on a device is its **admin**; everyone after is a
member. Admins get an *Admin dashboard* entry in the account menu — members do
not, and the view itself re-checks the role, so it is not reachable by flipping
a flag in the UI.

It reports, for the accounts on this browser:

- **KPI row** — accounts, new in the last 7 days, active today, total time
  logged in, average session length.
- **New accounts per day** (last 30 days) and **time logged in per day** (last
  14 days), as column charts.
- **Users table** — role, join date, script count, session count, total time and
  last seen, sortable, with a live dot for anyone signed in right now.
- **Recent sessions** — the last 25, including guest sessions.
- **Export CSV** of the whole activity log, and a button to clear it.

### What "time logged in" actually measures

Sessions used to leave no trace — sign in wrote a session object, sign out
deleted it. [`src/auth/activity.js`](src/auth/activity.js) now keeps an
append-only log: a record per sign-in with a heartbeat every 30 seconds **while
the tab is visible**. A backgrounded tab stops counting, and a record whose
heartbeat stops for five minutes is closed at its last beat, so a browser that
was killed does not read as an endless session.

So it measures *presence with the app on screen*, not keystrokes — a writer
staring at a blank page still counts. Sessions that span midnight are split
across days in the daily chart rather than counted twice.

### Scope

**This is a device-local dashboard, not a multi-user admin console.** Kirukals
has no server, so it can only report the accounts and activity in the browser it
is running in — it cannot see the same person on another machine, and one
person's numbers never reach another's browser. Real org-wide monitoring needs a
backend; the shape of this page would carry over, but the data source would move.

### Chart colours

Charts use the two validated data hues (blue `#3987e5`/`#2a78d6`, orange
`#d95926`/`#eb6834`) rather than the app's gold accent, which sits outside the
dark-mode lightness band for marks. Both pass the colour checks — lightness
band, chroma floor, colour-blind separation and 3:1 contrast — against both the
dark (`#161a21`) and light (`#ffffff`) chart surfaces. Gold stays what it always
was: UI chrome.

## How the editor works

The script is a list of typed elements rather than a rich-text blob, which is
what makes the formatting reliable. Each element renders at its industry
standard position on a US Letter page (1" top/bottom, 1.5" left, 1" right,
12pt Courier at 10 characters per inch).

| Element | Indent from text margin | Width |
| --- | --- | --- |
| Scene Heading | 0" | 6.0" |
| Action | 0" | 6.0" |
| Character | 2.2" | 3.8" |
| Parenthetical | 1.6" | 2.5" |
| Dialogue | 1.0" | 3.5" |
| Transition | right aligned | 6.0" |
| Shot | 0" | 6.0" |

### Writing flow

- **Enter** creates the next element in the natural sequence — Scene Heading →
  Action, Character → Dialogue, Dialogue → Character, Transition → Scene Heading.
  Pressing Enter mid-line splits the element instead.
- **Tab / Shift+Tab** cycles the current element's type; **Ctrl+1…7** sets it
  directly.
- **Backspace** on an empty line reverts it to Action first, then deletes it —
  so you can never get stuck in the wrong element type.
- Typing `INT. ` or `EXT. ` into an Action line silently promotes it to a Scene
  Heading, and a bare `CUT TO:` becomes a Transition.
- Uppercase-only elements are uppercased in the model, not just on screen, so
  exports match what you see.

### Autocomplete

Suggestions appear once you have typed at least one character, drawn from
standard vocabulary plus everything already used in this script:

- Scene headings complete the setting (`INT.`/`EXT.`), then locations you have
  used before, then the time of day after ` - `.
- Character cues complete from your existing cast; typing `(` after a name
  offers `(V.O.)`, `(O.S.)`, `(CONT'D)`.
- Transitions, parentheticals and shots complete from the standard set.

Tab or Enter accepts, Esc dismisses.

## Panels

- **Scenes** — navigator with page numbers; the arrows move an entire scene
  (heading plus its contents) up or down.
- **Cast** — speaking roles ranked by dialogue line count, with scene coverage.
- **Stats** — page count, scene count, word count and estimated screen time
  (one formatted page ≈ one minute).
- **Scripts** — create, switch between, delete and import screenplays.

## Pagination

`src/screenplay/paginate.js` lays the script out onto pages the way a fixed-pitch
page really breaks: it word-wraps at each element's character width, counts 55
lines per page, and refuses to leave a Character cue or Parenthetical stranded as
the last line of a page.

Those page groups are what the editor renders: **each page is a separate sheet**
— 8.5 × 11 inches exactly, its own piece of paper with the desk showing in the
gap between it and the next, and its number in the top-right of the margin
(page one carries none, by convention). Not one long roll with a rule drawn
across it. The same pagination drives the page numbers in the scene navigator.

Pages are set in **pure black on white**, like the printed page they stand in
for — the editor chrome around them is the only thing that follows the theme.

## Import / export

| Format | In | Out |
| --- | --- | --- |
| Fountain (`.fountain`, `.spmd`, `.txt`) | ✓ | ✓ |
| Final Draft (`.fdx`) | ✓ | ✓ |
| Final Draft legacy (`.fdr`) | ✓ best-effort | — |
| Zipped bundles (`.wdz`) | ✓ | — |
| JSON backup | ✓ | ✓ |
| PDF | — | ✓ via the browser print dialog |
| Fixed-pitch plain text | — | ✓ |

Fountain export round-trips: parsing the output back in reproduces the same
element types and text.

### How import decides what a file is

Extension is only a hint — writers rename files, and a `.txt` is often really an
`.fdx`. [`src/screenplay/import.js`](src/screenplay/import.js) sniffs the bytes:

- **A zip directory** → a container (`.wdz` and anything else zipped).
  Detection looks for the end-of-central-directory record at the *end* of the
  file rather than `PK` at the start, so an archive with a wrapper or
  self-extractor stub prepended still reads. It handles Zip64, entries written
  with data descriptors (no size in the local header), Windows-style
  backslash paths, and prefix-shifted offsets; entries are inflated with the
  platform's `DecompressionStream`, so there is no zip dependency. It then picks
  the most script-like file inside — `.fdx` first, then Fountain, then a
  `document`/`script`/`content` payload, then XML, JSON or text, skipping
  container metadata like `mimetype` and `manifest.json`. The notice after import
  names the entry it read. A method the browser cannot inflate (deflate64,
  bzip2, LZMA, zstd) is reported by name.
- **gzip** → unpacked and re-sniffed.
- **`<FinalDraft`** → Final Draft XML, whatever the extension says.
- **Other XML** → every text node is pulled in document order and re-typed by
  shape, which is the fallback for bundles with a schema we don't know.
- **Binary** → XML or JSON embedded in a wrapper is read whole if present;
  otherwise the text is mined (see below).
- **JSON** → a Kirukals backup restores exactly; another app's JSON is searched
  for a script field.
- **Anything else** → Fountain.

**An unrecognised file fails loudly and usefully.** Rather than importing noise,
the error names what the file actually was — size, detected type, first bytes as
hex and ASCII, and for an archive the list of entries inside it. That line is
what makes an unknown format identifiable instead of a shrug.

Two guards stop the importer inventing a screenplay: a control-character test
(random bytes are ~9% control characters, real documents are ~0%) and a
readability test applied to the *whole* recovered text, not the best line —
because random data always yields a few plausible-looking letter runs.

### Legacy `.fdr` is recovered, not parsed

Final Draft 7 and earlier wrote a proprietary binary with no public schema. The
importer mines it: it extracts the readable runs between the binary markers,
discards the format's own bookkeeping strings (font names, version numbers,
page markers), and re-types what is left by shape — `INT.`/`EXT.` prefixes are
sluglines, short shouted lines are cues, what follows a cue is dialogue.

**This is lossy and the app says so on import.** It reliably recovers the text
and the common cue/dialogue pattern; it will mis-type dialogue that runs past
one paragraph as action. If you have Final Draft 8 or later, opening the file
there and saving as `.fdx` imports exactly.

## Keyboard reference

| Keys | Action |
| --- | --- |
| Enter | New element (or split at the caret) |
| Shift+Enter | Line break inside the element |
| Tab / Shift+Tab | Cycle element type |
| Ctrl+1…7 | Set element type |
| Ctrl+Enter | New scene heading below |
| Alt+↑ / Alt+↓ | Move the current element |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo (keystrokes coalesce into phrases) |
| Ctrl+F | Find & replace |
| Ctrl+P | Print / save as PDF |
| Ctrl+S | Force a save |
| Ctrl+B / Ctrl+I / Ctrl+U | Bold, italic, underline the selection |

### Emphasis inside a line

`Ctrl+B` / `Ctrl+I` / `Ctrl+U` style the selection; pressing the same key again
removes it. Styles nest, so italic inside bold adds italic, and removing one
leaves the other.

**No markup characters ever appear on the page.** Styles are stored as ranges
beside the text rather than as `**` inside it:

```js
{ text: 'STAFF', styles: [{ from: 0, to: 5, kind: 'bold' }] }
```

The textarea therefore holds exactly what the page shows, which is what keeps
the caret honest — there are no hidden characters for it to drift across. A
styled mirror painted over the textarea draws the emphasis; both layers share
identical metrics, measured at zero offset.

Ranges follow the text through every edit ([`markup.js`](src/screenplay/markup.js)
`remap`): typing before a styled word shifts it, deleting it removes it, and
typing onto the end of a styled word continues that style while starting a new
word after it does not. Splitting a line with Enter splits its styling at the
caret; joining two lines joins it.

Fountain markers still exist, but only at the boundary: they are written on
export and parsed on import, with literal `*` and `_` in the script escaped so a
round-trip cannot corrupt them. Final Draft carries the same styling as
`Style="Bold+Italic"` attributes, both directions. Scripts written before this
change keep their emphasis as `**` characters in the text — those convert to
ranges automatically the first time the script is opened.

## Layout of the source

```
src/
  screenplay/
    elements.js   element definitions, page geometry, type transitions
    paginate.js   word wrap, page breaks, statistics, vocabulary collection
    suggest.js    context-aware autocomplete
    formats.js    Fountain, Final Draft, plain text, print, download
    storage.js    localStorage-backed script library and preferences
    import.js     file sniffing, zip containers, legacy .fdr recovery
  community/
    store.js      posts, enquiry sheets, applications, chat threads, notifications
  billing/
    upi.js        UPI deep-link building, VPA/UTR validation, ₹ formatting
    subscription.js  plan, payment ledger, verification, entitlement, revenue
    trial.js      the 10-minute post-login clock
  auth/
    session.js    local accounts, PBKDF2 password hashing, roles, sessions
    activity.js   session log, heartbeats, presence, per-user and per-day aggregates
  migrateKeys.js  one-time rename of pre-Kirukals storage keys
  hooks/
    useScriptDoc.js  document state with coalescing undo/redo
    caret.js         caret row measurement for arrow-key navigation
  components/
    Editor.jsx / ElementRow.jsx / Sidebar.jsx / TopBar.jsx / Dialogs.jsx
    AuthPage.jsx     sign in / sign up
    AdminPage.jsx    accounts, usage, session history and payments
    SubscribeDialog.jsx  plan, UPI QR and payment confirmation
    ProfilePage.jsx      profile, community board, replies, notifications
    CommunityDialogs.jsx post composer and enquiry sheet
    ChatPanel.jsx        conversations between a poster and one other person
    ChatToasts.jsx       incoming messages, popped over the editor for 30s
    Presence.jsx         online / away / offline dot, derived from the heartbeat
    ColumnChart.jsx  single-series column chart with hover and table view
```

The project directory is still named `scriptwriter`; only the product name
changed. Storage keys moved from the `scriptwriter.` prefix to `kirukals.` and
`src/migrateKeys.js` renames any leftovers on first load, so existing accounts
and drafts carry over.
