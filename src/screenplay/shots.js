import { TYPES } from './elements';
import { parseSlug } from './preproduction';

/**
 * Breaking a scene into shots.
 *
 * The script says what happens; the shot list says how it will be covered.
 * Nothing here decides for the director — it proposes the coverage any crew
 * would shoot by default (establish the place, watch the action, then play the
 * conversation in shot and reverse), numbered and editable, so the work starts
 * from a draft instead of a blank page.
 */

export const SIZES = ['ELS', 'WS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'INSERT', '2-SHOT'];
export const ANGLES = ['Eye level', 'High', 'Low', 'Overhead', 'Dutch', 'Over shoulder'];
export const MOVES = ['Static', 'Pan', 'Tilt', 'Track', 'Dolly in', 'Dolly out', 'Handheld', 'Crane', 'Drone', 'Steadicam'];

export const SIZE_NAMES = {
  ELS: 'Extreme wide', WS: 'Wide', MWS: 'Medium wide', MS: 'Medium', MCU: 'Medium close',
  CU: 'Close-up', ECU: 'Extreme close-up', OTS: 'Over the shoulder', POV: 'Point of view',
  INSERT: 'Insert', '2-SHOT': 'Two shot',
};

/** The script, cut at every scene heading. */
export function sceneBlocks(elements, pageOf = {}) {
  const scenes = [];
  for (const el of elements) {
    if (el.type === 'scene_heading') {
      const { kind, where, when } = parseSlug(el.text);
      scenes.push({
        id: el.id,
        heading: el.text.trim() || '(untitled scene)',
        kind,
        where,
        when,
        page: pageOf[el.id] || 1,
        body: [],
      });
    } else if (scenes.length) {
      scenes[scenes.length - 1].body.push(el);
    }
  }
  return scenes;
}

export const makeShot = (shot = {}) => ({
  id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  size: 'MS',
  angle: 'Eye level',
  move: 'Static',
  lens: '',
  desc: '',
  cast: '',
  duration: 4,
  done: false,
  ...shot,
});

const speakerOf = (el) => el.text.replace(/\s*\(.*$/, '').trim().toUpperCase();
const trim = (text, n = 90) => {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
};

/**
 * Propose coverage for one scene.
 *
 * The rules are the ordinary ones: open on the place, give each beat of action
 * its own setup, and play dialogue as singles that alternate between speakers —
 * with a two-shot the first time a pair talk, because that is the master a
 * cutting room needs.
 */
export function suggestShots(scene) {
  const shots = [];
  const add = (shot) => shots.push(makeShot(shot));

  // Establisher: wide, and outside if the slug says exterior.
  add({
    size: scene.kind?.startsWith('EXT') ? 'ELS' : 'WS',
    move: scene.kind?.startsWith('EXT') ? 'Drone' : 'Static',
    desc: `Establish ${scene.where || 'the location'}${scene.when ? ` — ${scene.when.toLowerCase()}` : ''}`,
    duration: 5,
  });

  let lastSpeaker = null;
  let pairEstablished = new Set();
  let currentCue = null;

  for (const el of scene.body) {
    if (el.type === 'character') {
      currentCue = speakerOf(el);
      continue;
    }

    if (el.type === 'dialogue' && currentCue) {
      const line = trim(el.text, 70);
      const pair = lastSpeaker && lastSpeaker !== currentCue ? [lastSpeaker, currentCue].sort().join('|') : null;

      // The first exchange between two people gets a master they can cut back to.
      if (pair && !pairEstablished.has(pair)) {
        pairEstablished.add(pair);
        add({
          size: '2-SHOT',
          desc: `${lastSpeaker} and ${currentCue} — the exchange`,
          cast: `${lastSpeaker}, ${currentCue}`,
          duration: 6,
        });
      }

      add({
        // Alternating singles: over the shoulder when there is someone to be
        // over, a plain close-up when speaking alone.
        size: pair ? 'OTS' : 'MCU',
        angle: pair ? 'Over shoulder' : 'Eye level',
        desc: `${currentCue}: "${line}"`,
        cast: currentCue,
        duration: Math.max(3, Math.round(el.text.split(/\s+/).length / 2.5)),
      });

      lastSpeaker = currentCue;
      continue;
    }

    if (el.type === 'action' && el.text.trim()) {
      add({
        size: 'MS',
        move: /\b(runs?|walks?|chases?|drives?|follows?)\b/i.test(el.text) ? 'Track' : 'Static',
        desc: trim(el.text),
        duration: 4,
      });
      // Action between speeches resets the rhythm of the conversation.
      lastSpeaker = null;
      currentCue = null;
      continue;
    }

    if (el.type === 'shot' && el.text.trim()) {
      add({ size: 'INSERT', desc: trim(el.text), duration: 3 });
    }
  }

  return shots;
}

/** Every scene's shots, flattened for counting and export. */
export function flattenShots(scenes, board) {
  return scenes.flatMap((scene, si) =>
    (board[scene.id]?.list || []).map((shot, i) => ({
      ...shot,
      scene: si + 1,
      heading: scene.heading,
      page: scene.page,
      number: `${si + 1}${String.fromCharCode(65 + Math.min(i, 25))}`,
    })),
  );
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** A shot list the assistant director can open in a spreadsheet. */
export function shotsToCsv(scenes, board) {
  const rows = flattenShots(scenes, board);
  const head = ['Shot', 'Scene', 'Page', 'Heading', 'Size', 'Angle', 'Movement', 'Lens', 'Cast', 'Description', 'Seconds', 'Shot?'];
  const body = rows.map((r) => [
    r.number, r.scene, r.page, r.heading, r.size, r.angle, r.move, r.lens, r.cast, r.desc, r.duration, r.done ? 'yes' : '',
  ]);
  return [head, ...body].map((cols) => cols.map(csvCell).join(',')).join('\n') + '\n';
}

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * The shot list as a printed document — the form it takes on set.
 *
 * Landscape, because a shot list is columns; scene by scene, because that is
 * how it is worked through; and the column headings repeat on every sheet,
 * because nobody wants to page back to remember which column is the lens.
 */
export function printShotList(doc, scenes, board) {
  const title = doc.titlePage?.title || doc.name || 'Screenplay';
  const when = new Date().toLocaleDateString(undefined, {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const total = flattenShots(scenes, board).length;
  const seconds = runningSeconds(scenes, board);

  const blocks = scenes
    .map((scene, si) => {
      const list = board[scene.id]?.list || [];
      if (!list.length) return '';
      const secs = list.reduce((n, s) => n + (Number(s.duration) || 0), 0);
      const cast = [
        ...new Set(
          scene.body.filter((e) => e.type === 'character').map((e) => e.text.replace(/\s*\(.*$/, '').trim().toUpperCase()),
        ),
      ].filter(Boolean);

      const rows = list
        .map(
          (shot, i) => `<tr${shot.done ? ' class="done"' : ''}>
        <td class="no">${si + 1}${String.fromCharCode(65 + Math.min(i, 25))}</td>
        <td class="ref">${shot.ref?.data ? `<img src="${shot.ref.data}" alt="">` : ''}</td>
        <td class="size">${esc(shot.size)}</td>
        <td>${esc(shot.angle)}</td>
        <td>${esc(shot.move)}</td>
        <td>${esc(shot.lens || '')}</td>
        <td>${esc(shot.cast || '')}</td>
        <td class="desc">${esc(shot.desc)}</td>
        <td class="secs">${esc(shot.duration)}s</td>
        <td class="tick">${shot.done ? '✓' : ''}</td>
      </tr>`,
        )
        .join('\n');

      return `<section class="scene">
      <h2><span>${si + 1}.</span> ${esc(scene.heading)}</h2>
      <p class="meta">page ${scene.page} · ${list.length} shot${list.length === 1 ? '' : 's'} · ${Math.floor(secs / 60)}m ${secs % 60}s${cast.length ? ` · ${esc(cast.join(', '))}` : ''}</p>
      <table>
        <thead>
          <tr><th>#</th><th>Ref</th><th>Size</th><th>Angle</th><th>Movement</th><th>Lens</th><th>Cast</th><th>Description</th><th>Sec</th><th></th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </section>`;
    })
    .filter(Boolean)
    .join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — shot list</title>
<style>
  /* Columns want the long edge of the paper. */
  @page { size: Letter landscape; margin: 0.5in 0.6in; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  /* Printers drop images to save ink unless told otherwise. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 10pt/1.35 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  header.doc { margin-bottom: 14px; border-bottom: 2px solid #000; padding-bottom: 8px; }
  header.doc h1 { margin: 0; font-size: 15pt; }
  header.doc p { margin: 3px 0 0; font-size: 9pt; color: #444; }

  .scene { margin-bottom: 16px; break-inside: auto; }
  .scene h2 {
    margin: 0; font-family: "Courier Prime", "Courier New", monospace;
    font-size: 11pt; break-after: avoid;
  }
  .scene h2 span { color: #666; }
  .scene .meta { margin: 2px 0 6px; font-size: 8.5pt; color: #555; break-after: avoid; }

  table { width: 100%; border-collapse: collapse; }
  /* Repeat the headings on every sheet the table runs onto. */
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th {
    padding: 3px 6px; border-bottom: 1px solid #000;
    font-size: 7.5pt; letter-spacing: 0.06em; text-align: left; text-transform: uppercase;
  }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; font-size: 9pt; }
  td.no { font-weight: 700; white-space: nowrap; }
  td.size { font-weight: 600; white-space: nowrap; }
  td.secs, td.tick { text-align: right; white-space: nowrap; }
  td.desc { width: 34%; }
  /* A reference frame prints as a contact-sheet thumbnail beside its row. */
  td.ref { width: 1.25in; padding: 3px 6px; }
  td.ref img {
    display: block; width: 1.15in; height: auto; max-height: 0.9in;
    object-fit: cover; border: 1px solid #999;
  }
  tr.done td { color: #777; }
  tr.done td.tick { color: #000; font-weight: 700; }
</style></head><body>
<header class="doc">
  <h1>${esc(title)} — shot list</h1>
  <p>${scenes.length} scenes · ${total} shots · ${Math.floor(seconds / 60)}m ${seconds % 60}s of coverage · ${when}</p>
</header>
${blocks || '<p>No scenes have been divided yet.</p>'}
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

/** Screen time the coverage adds up to, which is not the same as shooting time. */
export const runningSeconds = (scenes, board) =>
  flattenShots(scenes, board).reduce((n, s) => n + (Number(s.duration) || 0), 0);

export const typeLabel = (type) => TYPES[type]?.label || type;
