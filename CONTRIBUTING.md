# Working on Kirukals together

## Getting it running

```bash
git clone https://github.com/rajeevkumar14999/Kirukals.git
cd Kirukals
npm install
cp .env.example .env
```

`.env` is deliberately not in the repository — it holds the Supabase and Google
credentials. Rajeev has them. **Without it the app still runs**: sign-in falls
back to email and password against a local account store, which is enough to
work on everything except sign-in itself.

```bash
npm run dev        # the browser version, http://localhost:5173
npm run desktop    # the Electron app, against the last build
```

To build the installer:

```bash
npm run release 1.9.6
```

That bumps the version, builds, packages, keeps every previous installer in
`release/`, and prints where the unpacked app is so you can open it and look at
it before handing it to anybody.

## Branches

**One branch per piece of work, not one branch per person.**

A personal branch that lives forever drifts from `main` until merging it is a
day's argument. A branch that exists for one change is merged within a day or
two and never diverges enough to hurt.

```bash
git checkout main
git pull                          # always start from what is on GitHub
git checkout -b fix-undo-caret    # name it after the change
```

Work, commit as often as you like, then:

```bash
git push -u origin fix-undo-caret
```

Then open a **Pull Request** on GitHub: it will offer one the moment you push.
That is where Rajeev reads the change, says anything he wants to say, and
merges it.

### Naming

Say what the change does, in a few words with hyphens:

```
fix-undo-caret
add-scene-numbers
faster-pagination
```

Not `sabin`, `dev`, `test`, or `new`. In six months the name is all anybody has
to go on.

## Why a Pull Request rather than pushing to main

Two people pushing to the same branch overwrite each other's work eventually —
usually on the day it matters. A pull request costs about a minute and gives:

- a place to see exactly what changed before it is in,
- a record of why, next to the code, forever,
- and a merge that either works or is refused, rather than one that half-works.

Nobody pushes to `main` directly. That includes Rajeev.

## Commit messages

Say what changed and why it was worth changing. The what is visible in the
diff; the why is not, and in a year it is the only part anybody needs.

```
Undo a word at a time, the way an editor does

A step ended only when somebody stopped typing for most of a second — and the
clock restarted on every keystroke. So a writer in flow produced one enormous
step and a single Ctrl+Z swallowed three paragraphs.
```

Not `fix`, `update`, `changes`.

## Before you push

There is no test suite to run. Instead:

```bash
npm run build      # it must build
npm run release <version>
```

Then **open the app and use the thing you changed.** The build succeeding does
not mean the app opens — that mistake has shipped a black window here more than
once. `test/` holds small checks for the parts that are hard to see: the undo
rules, the Google card, typing speed on a long script.

## The shape of the thing

| | |
|---|---|
| `src/screenplay/` | the model — elements, pagination, formats, exports. No React |
| `src/components/` | the screens |
| `src/backend/` | Supabase: accounts only. **Scripts never leave the machine** |
| `electron/` | the desktop app: window, menus, printing, Google sign-in |
| `scripts/release.cjs` | how a build is cut |

The one rule worth stating: **a script is the writer's and stays on their
machine.** The account exists to know who somebody is and whether they have
paid. Nothing that uploads a screenplay belongs in this codebase.
