import { parseSlug } from './preproduction';
import { sceneBlocks } from './shots';

/**
 * Costume breakdown.
 *
 * A costume designer does not work scene by scene; they work in *changes* —
 * one outfit worn across a run of scenes, until something in the story forces
 * a new one. So the unit here is the change, and the script supplies three
 * things towards it: which scenes a character is in, whether those scenes run
 * continuously, and anything the writer already said about what people wear.
 *
 * That last part is only a clue, never a decision: "a white veshti" in an
 * action line is surfaced beside the change so the designer can see what the
 * writer had in mind, and overrule it.
 */

/** Words that mean clothing, including the ones a Tamil script uses in English. */
export const WARDROBE = [
  'shirt', 'jeans', 't-shirt', 'tshirt', 'trousers', 'pants', 'shorts', 'skirt', 'dress',
  'coat', 'jacket', 'blazer', 'suit', 'tie', 'uniform', 'tracksuit', 'sweater', 'hoodie',
  'saree', 'sari', 'veshti', 'dhoti', 'lungi', 'kurta', 'kurti', 'salwar', 'churidar',
  'pattu', 'blouse', 'dupatta', 'shawl', 'nightie', 'apron', 'towel', 'scarf',
  'sandals', 'shoes', 'chappal', 'slippers', 'boots', 'cap', 'hat', 'helmet', 'turban',
  'spectacles', 'glasses', 'sunglasses', 'watch', 'chain', 'bangles', 'bangle', 'earrings',
  'necklace', 'ring', 'bindi', 'garland', 'wig', 'beard', 'moustache', 'barefoot',
  'wearing', 'dressed', 'wears', 'in a white', 'in a black',
];

const CLUE_RE = new RegExp(`\\b(${WARDROBE.map((w) => w.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('|')})\\b`, 'i');

const cueName = (text) => text.replace(/\s*\(.*$/, '').trim().toUpperCase();

export const emptyLook = (label) => ({
  id: `k_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  label,
  sceneIds: [],
  options: [],
  chosen: null,
});

export const emptyCostumeOption = () => ({
  id: `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  desc: '',
  pieces: '',
  source: 'To buy',
  cost: 0,
  note: '',
  image: null,
});

export const SOURCES = ["Actor's own", 'To buy', 'To rent', 'To make', 'Continuity duplicate'];

/**
 * Who wears what, where.
 *
 * Changes are proposed by walking a character's scenes in order and starting a
 * new one whenever the story moves: a jump in scene numbers, or a change from
 * day to night. Continuous scenes in the same light are one outfit.
 */
export function costumeBreakdown(doc, stats) {
  const scenes = sceneBlocks(doc.elements, stats?.pageOf || {}).map((s, i) => ({
    ...s,
    number: i + 1,
    when: parseSlug(s.heading).when,
    kind: parseSlug(s.heading).kind,
  }));

  const people = new Map();

  for (const scene of scenes) {
    const present = new Set();
    for (const el of scene.body) {
      if (el.type === 'character') {
        const name = cueName(el.text);
        if (name) present.add(name);
      }
    }
    // Someone named in the action is in the scene even if they never speak.
    for (const el of scene.body) {
      if (el.type !== 'action') continue;
      for (const name of people.keys()) {
        if (new RegExp(`\\b${name}\\b`, 'i').test(el.text)) present.add(name);
      }
    }

    for (const name of present) {
      if (!people.has(name)) people.set(name, { name, scenes: [], clues: [] });
      const person = people.get(name);
      person.scenes.push({
        id: scene.id,
        number: scene.number,
        heading: scene.heading,
        when: scene.when,
        kind: scene.kind,
        page: scene.page,
      });

      // Anything the writer said about clothes in a scene this person is in.
      for (const el of scene.body) {
        if (el.type !== 'action' || !CLUE_RE.test(el.text)) continue;
        const mentionsThem = new RegExp(`\\b${name}\\b`, 'i').test(el.text);
        if (!mentionsThem && present.size > 1) continue;
        person.clues.push({ scene: scene.number, text: el.text.trim().slice(0, 180) });
      }
    }
  }

  return [...people.values()]
    .map((p) => ({ ...p, suggested: suggestLooks(p.scenes) }))
    .sort((a, b) => b.scenes.length - a.scenes.length);
}

/** Group a character's scenes into the changes a designer would plan. */
export function suggestLooks(sceneList) {
  const looks = [];
  let current = null;

  for (const scene of sceneList) {
    const jumped = current && scene.number > current.last + 1;
    const relit = current && scene.when && current.when && scene.when !== current.when;
    if (!current || jumped || relit) {
      current = { sceneIds: [scene.id], numbers: [scene.number], when: scene.when, last: scene.number };
      looks.push(current);
    } else {
      current.sceneIds.push(scene.id);
      current.numbers.push(scene.number);
      current.last = scene.number;
    }
  }

  return looks.map((l, i) => ({
    label: `Look ${i + 1}`,
    sceneIds: l.sceneIds,
    numbers: l.numbers,
    when: l.when,
  }));
}

export const chosenOption = (look) => look?.options?.find((o) => o.id === look.chosen) || null;

/** What the wardrobe department is being asked to spend. */
export function costumeCost(board) {
  const rows = Object.values(board.costumes || {});
  return rows.reduce(
    (sum, person) =>
      sum +
      (person.looks || []).reduce((n, look) => n + (Number(chosenOption(look)?.cost) || 0), 0),
    0,
  );
}

/* -------------------------------- print --------------------------------- */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The breakdown as the costume department receives it: one table per character. */
export function printCostumes(doc, stats, board) {
  const title = doc.titlePage?.title || doc.name || 'Screenplay';
  const people = costumeBreakdown(doc, stats);
  const saved = board.costumes || {};

  const blocks = people
    .map((person) => {
      const looks = saved[person.name]?.looks?.length
        ? saved[person.name].looks
        : person.suggested.map((s) => ({ ...s, options: [], chosen: null }));

      const rows = looks
        .map((look) => {
          const pick = chosenOption(look);
          const numbers = (look.numbers || look.sceneIds || [])
            .map((n) => (typeof n === 'number' ? n : person.scenes.find((s) => s.id === n)?.number))
            .filter(Boolean);
          return `<tr>
            <td class="look">${esc(look.label)}</td>
            <td class="n">${numbers.join(', ') || '—'}</td>
            <td class="ref">${pick?.image?.data ? `<img src="${pick.image.data}" alt="">` : ''}</td>
            <td>${esc(pick?.desc || '')}${pick?.pieces ? `<span class="pieces">${esc(pick.pieces)}</span>` : ''}</td>
            <td>${esc(pick?.source || '')}</td>
            <td class="n">${pick?.cost ? `₹${Number(pick.cost).toLocaleString('en-IN')}` : ''}</td>
            <td class="note">${esc(pick?.note || '')}</td>
          </tr>`;
        })
        .join('');

      return `<section>
        <h2>${esc(person.name)} <span>${person.scenes.length} scene${person.scenes.length === 1 ? '' : 's'} · ${looks.length} change${looks.length === 1 ? '' : 's'}</span></h2>
        <table>
          <thead><tr><th>Change</th><th class="n">Scenes</th><th>Ref</th><th>Costume</th><th>Source</th><th class="n">Cost</th><th>Notes</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('\n');

  const total = costumeCost(board);

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — costume breakdown</title>
<style>
  @page { size: Letter landscape; margin: 0.5in 0.6in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 10pt/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  header.doc { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
  header.doc h1 { margin: 0; font-size: 15pt; }
  header.doc p { margin: 3px 0 0; font-size: 9pt; color: #444; }
  h2 { font-size: 11.5pt; margin: 14px 0 4px; break-after: avoid; }
  h2 span { color: #777; font-size: 8.5pt; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { padding: 4px 6px; border-bottom: 1px solid #000; font-size: 7.5pt; letter-spacing: 0.06em; text-align: left; text-transform: uppercase; }
  td { padding: 5px 6px; border-bottom: 1px solid #e0e0e0; font-size: 9pt; vertical-align: top; }
  td.look { font-weight: 700; white-space: nowrap; }
  td.n { text-align: right; white-space: nowrap; }
  td.ref { width: 0.95in; }
  td.ref img { display: block; width: 0.85in; height: 1.1in; object-fit: cover; border: 1px solid #999; }
  td .pieces { display: block; color: #555; font-size: 8pt; }
  td.note { color: #555; font-size: 8.5pt; }
</style></head><body>
<header class="doc">
  <h1>${esc(title)} — costume breakdown</h1>
  <p>${people.length} characters · ${total ? `₹${total.toLocaleString('en-IN')} committed` : 'no costs entered yet'}</p>
</header>
${blocks || '<p>No characters yet.</p>'}
<script>window.onload = function () { window.focus(); window.print(); };<\/script>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) {
    alert('Your browser blocked the print window. Allow pop-ups for this site and try again.');
    return;
  }
  w.document.write(html);
  w.document.close();
}
