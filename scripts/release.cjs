/**
 * Cut a release, and keep the one before it.
 *
 *     node scripts/release.cjs 1.7.0
 *
 * Two things had been done by hand and one of them was wrong: the old
 * installer was deleted to make room for the new one. A build that cannot be
 * gone back to is not a build you can ship with any confidence — if 1.7.0 is
 * broken on somebody's machine at nine on a Monday, the answer is "install
 * 1.6.0 again", and that answer needs a file to point at.
 *
 * So every installer ever built stays in release/. They are 100MB each and
 * disk is cheap; the ability to undo is not.
 */
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const RELEASE = path.join(ROOT, 'release');
const DOWNLOADS = path.join(ROOT, 'public', 'downloads');
const OUT = path.join(os.tmpdir(), 'kirukals-release');

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
  console.error('A version, like: node scripts/release.cjs 1.7.0');
  process.exit(1);
}

const run = (command) => execSync(command, { cwd: ROOT, stdio: 'inherit' });
const say = (text) => console.log(`\n— ${text}`);

/* The version, written down once. */
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const previous = pkg.version;
pkg.version = version;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
say(`${previous} → ${version}`);

say('building');
run('node scripts/google-config.cjs');
run('npx vite build --base ./');
run('node scripts/protect.cjs');

say('packaging');
fs.rmSync(OUT, { recursive: true, force: true });
run(`npx electron-builder --win -c.directories.output="${OUT.replace(/\\/g, '/')}"`);

const installer = `Kirukals-Setup-${version}.exe`;

/**
 * Keep every installer. The old one is not in the way — it is the way back.
 */
say('keeping the previous installers');
fs.mkdirSync(RELEASE, { recursive: true });
for (const name of [installer, `${installer}.blockmap`]) {
  fs.copyFileSync(path.join(OUT, name), path.join(RELEASE, name));
}
const kept = fs.readdirSync(RELEASE).filter((f) => f.endsWith('.exe')).sort();
console.log(`  release/ now holds ${kept.length}: ${kept.join(', ')}`);

/**
 * The download folder holds only the current one, because that is what the
 * app's updater and the download button ask for — but the older builds are
 * still in release/, which is the point.
 */
say('publishing the current build');
fs.mkdirSync(DOWNLOADS, { recursive: true });
for (const old of fs.readdirSync(DOWNLOADS)) {
  if (old.endsWith('.exe') || old.endsWith('.blockmap')) fs.rmSync(path.join(DOWNLOADS, old));
}
for (const name of [installer, `${installer}.blockmap`, 'latest.yml']) {
  fs.copyFileSync(path.join(OUT, name), path.join(DOWNLOADS, name));
}

const bytes = fs.statSync(path.join(DOWNLOADS, installer)).size;
const downloads = path.join(ROOT, 'src', 'downloads.js');
let source = fs.readFileSync(downloads, 'utf8');
source = source
  .replace(/version: '[^']*',/, `version: '${version}',`)
  .replace(/file: '[^']*',/, `file: '${installer}',`)
  .replace(/bytes: \d+,/, `bytes: ${bytes},`);
fs.writeFileSync(downloads, source);

say('rebuilding the web copy with the new download details');
run('npx vite build');

console.log(`
  ${installer} — ${(bytes / 1048576).toFixed(0)}MB

  release/     every installer ever built, ${previous} included
  downloads/   ${version} only, which is what the updater serves

  To go back: install release/Kirukals-Setup-${previous}.exe over the top.
  Scripts and pictures are untouched by an install either way.
`);
