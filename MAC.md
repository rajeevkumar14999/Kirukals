# The Mac build

## What cannot be done here

A macOS build cannot be produced on Windows. The tooling that makes an app
bundle, and every part of signing it, runs only on macOS. There is no flag for
this and no workaround worth having.

So there are two ways to get a `.dmg`, and the repository is set up for both.

## 1. On a Mac

Any Mac, including a borrowed one:

```bash
git clone <this repository>
cd scriptwriter
npm ci
cp .env.example .env      # fill in, or leave blank and sign-in falls back to email
npm run build
npx electron-builder --mac
```

Out comes `release/`:

| | |
|---|---|
| `Kirukals-1.9.0-arm64.dmg` | Apple Silicon — anything since 2020 |
| `Kirukals-1.9.0.dmg` | Intel Macs |
| `.zip` of each | what the in-app updater reads; without them it cannot update |

Two architectures rather than one universal binary: a universal build is one
download of twice the size, and two downloads is the smaller unkindness.

## 2. On GitHub, for nothing

`.github/workflows/release.yml` builds the Windows installer on a Windows
runner and the Mac disk images on a Mac one, because each has to be built where
it can be. Push a tag:

```bash
git tag v1.9.0 && git push origin v1.9.0
```

Both appear as downloadable artifacts when it finishes. Public repositories get
this free; private ones get 2,000 minutes a month, and a Mac runner spends them
ten times as fast — a build is about five minutes of that, so roughly forty
builds a month before it costs anything.

The build's secrets go in Settings → Secrets and variables → Actions, under the
names the workflow reads. Without them it still builds; sign-in falls back to
email and password.

## The part that costs money

**An unsigned Mac app is worse than an unsigned Windows one.** Windows shows a
warning that can be clicked past. macOS refuses outright — *"Kirukals is
damaged and can't be opened"* — and the way round it is right-click → Open, or
a Terminal command. Most people will assume it is broken, because it looks
exactly like broken.

Fixing that needs an **Apple Developer account, $99 a year**, which gives:

- a **Developer ID certificate** to sign with, and
- **notarisation** — Apple checking the build and stapling its approval, which
  is what stops the warning.

With the certificate in the repository's secrets, the workflow signs and
notarises without any further change. Until then the Mac build runs, but only
for somebody prepared to argue with Gatekeeper.

Windows has the same problem more mildly: an unsigned installer shows
SmartScreen's *"Windows protected your PC"*. A code-signing certificate is
₹20–30,000 a year and is worth having before either build is sold, not before
it is tried.

## What was already right

The lifecycle, as it happens. The app already keeps running when its last
window closes, reopens on a dock click, and hides its menu bar — all the
conventions a Mac user notices only when they are missing.

What was added: the application menu, which on a Mac is not optional. Quit,
Hide and About live there and nowhere else, and a Mac user who cannot find them
concludes the program is broken rather than different.
