/**
 * What one Ctrl+Z takes back.
 *
 * The hook without React: the rules that decide where a step ends are plain
 * bookkeeping, and this exercises them the way typing does.
 */
const COALESCE_MS = 800, RUN_LIMIT = 24;
let lastKey = null, lastTime = 0, runChars = 0, past = [];

function update(text, { coalesceKey, endsRun }, prev) {
  const now = Date.now();
  const sameRun = coalesceKey !== null && coalesceKey === lastKey
    && now - lastTime < COALESCE_MS && runChars < RUN_LIMIT;
  if (!sameRun) past.push(prev);
  runChars = sameRun ? runChars + 1 : 1;
  lastKey = coalesceKey; lastTime = now;
  if (endsRun) { lastKey = null; runChars = 0; }
  return text;
}

const boundary = /[\s.,;:!?'"()—–-]/;
let text = '';
for (const ch of 'The room is empty. Nobody has been here for days.') {
  const next = text + ch;
  text = update(next, { coalesceKey: 'text:1', endsRun: boundary.test(ch) }, text);
}

console.log(`typed: ${JSON.stringify(text)}`);
console.log(`undo steps: ${past.length}`);
console.log('last four steps, newest last:');
past.slice(-4).forEach((s) => console.log('   ' + JSON.stringify(s)));
console.log('\none Ctrl+Z from the end takes back: ' +
  JSON.stringify(text.slice(past[past.length - 1].length)));
