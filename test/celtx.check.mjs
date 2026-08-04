/** Does a Celtx script come in with its element types intact? */
import { importScriptFile } from '../src/screenplay/import.js';

let failed = 0;
const ok = (c, l) => { if (!c) failed++; console.log((c ? '  ok   ' : '  FAIL ') + l); };

/* The shape Celtx writes: one paragraph per line, class per element type. */
const html = `<html><head><title>Otha</title></head><body>
<p class="sceneheading">INT. A ROOM - NIGHT</p>
<p class="action">Someone crosses to the window &amp; stops.</p>
<p class="character">MEENA</p>
<p class="parenthetical">(quietly)</p>
<p class="dialog">I have been here before.</p>
<p class="transition">CUT TO:</p>
<p class="shot">CLOSE ON a puddle.</p>
<p class="unknownthing">A line Celtx did not label.</p>
<p class="action"></p>
</body></html>`;

const file = new File([new TextEncoder().encode(html)], 'script-Nby.html', { type: 'text/html' });
const doc = await importScriptFile(file);
const notes = doc.notes || [];

const types = doc.elements.map((e) => e.type).join(',');
ok(types === 'scene_heading,action,character,parenthetical,dialogue,transition,shot,action',
   `every element type comes across (${types})`);
ok(doc.elements[1].text === 'Someone crosses to the window & stops.', 'entities are unpicked');
ok(doc.elements[4].text === 'I have been here before.', 'dialog maps to dialogue');
ok(doc.elements.length === 8, 'the empty paragraph is dropped, nothing else is');
ok(doc.titlePage?.title === 'Otha', 'the title comes from the document');
ok(notes.some((n) => /came in as action/.test(n)), 'and an unlabelled line is reported, not hidden');

console.log(failed ? `\n${failed} failed` : '\nall good');
process.exit(failed ? 1 : 0);
