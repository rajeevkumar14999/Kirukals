/**
 * Obfuscate the built bundle before it is packaged into the desktop app.
 *
 * Be clear about what this buys. An Electron app can always be opened: the
 * archive inside it extracts with one command, and what comes out is the code
 * that runs. Minifying already removes the names and the comments; this goes
 * further — strings are encoded, the remaining names are meaningless, and the
 * result is genuinely unpleasant to read.
 *
 * It is a deterrent, not a lock. Anyone determined and technical will still
 * get there. The only protection that actually holds is a server deciding what
 * a given account may do, because that decision is not in the file at all.
 *
 * The settings below are chosen to raise effort without wrecking the app:
 * control-flow flattening and dead-code injection are deliberately left off,
 * because they can multiply start-up time on a bundle this size.
 */
const fs = require('node:fs');
const path = require('node:path');
const JavaScriptObfuscator = require('javascript-obfuscator');

const DIST = path.join(__dirname, '..', 'dist', 'assets');

const OPTIONS = {
  compact: true,
  target: 'browser',

  // Names become meaningless without becoming slow.
  identifierNamesGenerator: 'mangled-shuffled',
  renameGlobals: false,

  // The literals are collected into one shuffled array, so reading the file
  // top to bottom tells you nothing about where anything is used.
  stringArray: true,
  stringArrayThreshold: 0.75,
  stringArrayEncoding: [],
  stringArrayIndexShift: false,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 0,
  splitStrings: false,

  // Left off on purpose: these are what make obfuscated apps crawl.
  controlFlowFlattening: false,
  deadCodeInjection: false,
  debugProtection: false,
  selfDefending: false,

  numbersToExpressions: false,
  simplify: true,
  unicodeEscapeSequence: false,
};

const files = fs.readdirSync(DIST).filter((f) => f.endsWith('.js'));
if (!files.length) {
  console.error('No built bundle found. Run the build first.');
  process.exit(1);
}

let before = 0;
let after = 0;

for (const file of files) {
  const full = path.join(DIST, file);
  const source = fs.readFileSync(full, 'utf8');
  before += source.length;

  const result = JavaScriptObfuscator.obfuscate(source, OPTIONS).getObfuscatedCode();
  fs.writeFileSync(full, result);
  after += result.length;

  console.log(`  ${file}  ${(source.length / 1024).toFixed(0)}KB -> ${(result.length / 1024).toFixed(0)}KB`);
}

console.log(
  `Obfuscated ${files.length} file${files.length === 1 ? '' : 's'}: ` +
    `${(before / 1024 / 1024).toFixed(2)}MB -> ${(after / 1024 / 1024).toFixed(2)}MB`,
);
