/**
 * Getting a script out, and getting it back in.
 *
 * This is the part a customer hands to somebody else. A wrong page count is
 * embarrassing; a Final Draft file that will not open is a refund. So every
 * format is written, read back, and compared with what went in — a round trip,
 * because a exporter that is wrong in the same way as its importer would pass
 * any check that only looked at one of them.
 *
 *     node test/formats.test.mjs
 */
import { toFountain, fromFountain, toFdx, fromFdx, toPlainText } from '../src/screenplay/formats.js';

let failed = 0;
const ok = (c, l) => { if (!c) failed++; console.log((c ? '  ok   ' : '  FAIL ') + l); };
const eq = (a, b, l) =>
  ok(a === b, `${l}${a === b ? '' : `\n         got:    ${JSON.stringify(a)}\n         wanted: ${JSON.stringify(b)}`}`);

const el = (type, text, extra = {}) => ({ id: `e${Math.random().toString(36).slice(2, 8)}`, type, text, styles: [], comments: [], ...extra });

/* A script with one of everything a screenplay has. */
const script = {
  id: 'test',
  name: 'The Test',
  titlePage: { title: 'THE TEST', credit: 'Written by', author: 'Rajeev Kumar', draftDate: 'August 2026' },
  elements: [
    el('scene_heading', 'INT. A ROOM - NIGHT'),
    el('action', 'Someone crosses to the window.'),
    el('character', 'MEENA'),
    el('parenthetical', '(quietly)'),
    el('dialogue', 'I have been here before.'),
    el('action', 'A pause. Rain against the glass.'),
    el('character', 'RAJEEV'),
    el('dialogue', 'So have I.'),
    el('transition', 'CUT TO:'),
    el('scene_heading', 'EXT. THE STREET - DAY'),
    el('shot', 'CLOSE ON a puddle.'),
    el('action', 'It is still raining.'),
  ],
};

const typesOf = (d) => d.elements.map((e) => e.type).join(',');
const textOf = (d) => d.elements.map((e) => e.text).join('|');

console.log('\nFountain\n');
{
  const out = toFountain(script);
  ok(out.includes('INT. A ROOM - NIGHT'), 'a scene heading survives the write');
  ok(out.includes('MEENA'), 'a character cue does');
  ok(out.includes('(quietly)'), 'a parenthetical does');
  ok(out.includes('CUT TO:'), 'a transition does');
  ok(out.includes('Title: THE TEST'), 'the title page is written as Fountain expects');

  const back = fromFountain(out);
  eq(back.elements.length, script.elements.length, 'the same number of lines comes back');
  eq(textOf(back), textOf(script), 'with the words unchanged — a round trip must not edit anybody');

  /*
    Fountain has no shot element. It has scene headings, action, characters,
    dialogue, parentheticals and transitions, and that is the whole list — so a
    shot can only come back as action. Worth asserting rather than leaving as a
    surprise: everything else must survive exactly.
  */
  eq(
    typesOf(back),
    typesOf(script).replace(',shot,', ',action,'),
    'every type survives except a shot, which Fountain has no word for',
  );
}

console.log('\nFinal Draft\n');
{
  // Reading an .fdx uses the browser's own XML parser, which Node has not got.
  // The writing is checked here either way; the reading when it can be.
  const canRead = typeof DOMParser !== 'undefined';
  const out = toFdx(script);
  ok(out.startsWith('<?xml'), 'an .fdx is xml');
  ok(out.includes('<FinalDraft'), 'and says it is Final Draft');
  ok(out.includes('Type="Scene Heading"'), "and names Final Draft's own element types");
  ok(out.includes('Type="Parenthetical"'), 'including the parenthetical');

  if (canRead) {
    const back = fromFdx(out);
    eq(back.elements.length, script.elements.length, 'the same number of lines comes back');
    eq(typesOf(back), typesOf(script), 'and every line comes back as the type it was');
    eq(textOf(back), textOf(script), 'with the words unchanged');
  } else {
    console.log('  --   reading it back needs a browser XML parser; run this under Electron for that');
  }
}

console.log('\nPlain text\n');
{
  const out = toPlainText(script);
  ok(out.includes('INT. A ROOM - NIGHT'), 'the scenes are there');
  ok(out.includes('MEENA'), 'and the characters');
  ok(out.includes('I have been here before.'), 'and the dialogue');
}

console.log('\nAwkward things\n');
{
  /* Characters that mean something in XML must not break an .fdx. */
  const nasty = {
    ...script,
    titlePage: { title: 'A & B <C> "D"' },
    elements: [
      el('action', 'She said "don\'t" & left <immediately>.'),
      el('character', "O'BRIEN"),
      el('dialogue', 'Ampersands & angle brackets < > and quotes " —'),
    ],
  };
  const xml = toFdx(nasty);
  ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), 'ampersands are escaped, so the xml is well formed');
  if (typeof DOMParser !== 'undefined') {
    const back = fromFdx(xml);
    eq(textOf(back), textOf(nasty), 'and the awkward characters come back exactly as typed');
  }

  /* An empty script should not throw on the way out. */
  const empty = { ...script, elements: [] };
  ok(typeof toFountain(empty) === 'string', 'an empty script exports to Fountain rather than throwing');
  ok(typeof toFdx(empty) === 'string', 'and to Final Draft');

  /* Nonsense in should not throw on the way in. */
  ok(Array.isArray(fromFountain('').elements), 'empty Fountain reads as an empty script');
  if (typeof DOMParser !== 'undefined') {
    ok(Array.isArray(fromFdx('<nonsense/>').elements), 'unrecognisable xml reads as an empty script rather than throwing');
  }

  /* Blank lines in the middle of dialogue are common in real files. */
  const spaced = fromFountain('INT. HALL - DAY\n\nMEENA\nHello.\n\n\nRAJEEV\nHello.\n');
  eq(
    spaced.elements.filter((e) => e.type === 'character').map((e) => e.text).join(','),
    'MEENA,RAJEEV',
    'both characters are found across an extra blank line',
  );
}

console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
