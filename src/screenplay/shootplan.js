import { countLines } from './paginate';
import { parseSlug } from './preproduction';
import { sceneBlocks } from './shots';

/**
 * The shoot plan: what is being shot on a given day.
 *
 * Every day carries two plans. Plan A is the intention; Plan B is what the
 * unit turns to when the rain does not stop, the location falls through or an
 * actor does not arrive — decided in the office, in daylight, rather than at
 * six in the morning on a wet road. Both are built the same way, from the same
 * scenes, so switching between them costs nothing.
 */

export const PLANS = ['A', 'B'];

export const emptyPlan = () => ({
  sceneIds: [],
  unit: '',
  callTime: '06:00',
  location: '',
  note: '',
});

export const makeDay = (n = 1) => ({
  id: `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  label: `Day ${n}`,
  date: '',
  active: 'A',
  A: emptyPlan(),
  B: emptyPlan(),
});

/** A scene's length in eighths of a page, the unit a schedule is written in. */
export function sceneEighths(scene) {
  const lines = scene.body.reduce((n, el) => n + countLines(el), 1);
  return Math.max(1, Math.round((lines / 55) * 8));
}

export const eighthsLabel = (eighths) => {
  const pages = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (!pages) return `${rest}/8`;
  return rest ? `${pages} ${rest}/8` : `${pages}`;
};

const cueName = (text) => text.replace(/\s*\(.*$/, '').trim().toUpperCase();

/**
 * Everything a day amounts to: which scenes, where, who is needed, how much
 * of the script it covers and how many setups it asks for.
 */
export function planSummary(doc, board, plan, stats) {
  const scenes = sceneBlocks(doc.elements, stats?.pageOf || {});
  const chosen = scenes
    .map((scene, i) => ({ ...scene, number: i + 1 }))
    .filter((scene) => plan.sceneIds.includes(scene.id));

  const cast = new Map();
  for (const scene of chosen) {
    for (const el of scene.body) {
      if (el.type !== 'character') continue;
      const name = cueName(el.text);
      if (!name) continue;
      if (!cast.has(name)) cast.set(name, { name, scenes: new Set() });
      cast.get(name).scenes.add(scene.number);
    }
  }

  const locations = [...new Set(chosen.map((s) => parseSlug(s.heading).where).filter(Boolean))];
  const eighths = chosen.reduce((n, s) => n + sceneEighths(s), 0);

  const shots = chosen.reduce((n, s) => n + (board.shots?.[s.id]?.list || []).length, 0);
  const seconds = chosen.reduce(
    (n, s) => n + (board.shots?.[s.id]?.list || []).reduce((m, shot) => m + (Number(shot.duration) || 0), 0),
    0,
  );

  return {
    scenes: chosen,
    locations,
    cast: [...cast.values()]
      .map((c) => ({ ...c, scenes: [...c.scenes].sort((a, b) => a - b) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    eighths,
    shots,
    seconds,
  };
}

/** The actor cast in a role, if one has been chosen. */
export function castFor(board, character) {
  const row = board.cast?.[character];
  const picked = row?.options?.find((o) => o.id === row.chosen);
  return picked || null;
}

/** Where a location was found, if it has been. */
export function placeFor(board, location) {
  const row = board.locations?.[location];
  const picked = row?.options?.find((o) => o.id === row.chosen);
  return picked || null;
}

/* ------------------------------- call sheet ------------------------------- */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const prettyDate = (iso) => {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * The call sheet, as it goes up on a wall.
 *
 * Plan A and Plan B print together on purpose: a crew that has only been given
 * the cover plan will not shoot it well. The B side prints greyed, so nobody
 * mistakes which one is today unless they are told.
 */
export function printCallSheet(doc, stats, board, day) {
  const title = doc.titlePage?.title || doc.name || 'Untitled';

  const side = (key) => {
    const plan = day[key] || emptyPlan();
    const sum = planSummary(doc, board, plan, stats);
    const isB = key === 'B';

    const scenes = sum.scenes
      .map(
        (s) => `<tr>
        <td class="n">${s.number}</td>
        <td>${esc(s.heading)}</td>
        <td class="n">${esc(eighthsLabel(sceneEighths(s)))}</td>
        <td class="n">p.${s.page}</td>
        <td class="n">${(board.shots?.[s.id]?.list || []).length || ''}</td>
      </tr>`,
      )
      .join('');

    const cast = sum.cast
      .map((c) => {
        const actor = castFor(board, c.name);
        return `<tr>
          <td>${esc(c.name)}</td>
          <td>${esc(actor?.name || '—')}</td>
          <td>${esc(actor?.contact || '')}</td>
          <td class="n">${c.scenes.join(', ')}</td>
        </tr>`;
      })
      .join('');

    const places = sum.locations
      .map((l) => {
        const found = placeFor(board, l);
        return `<li><b>${esc(l)}</b>${found ? ` — ${esc(found.place || '')}${found.address ? `<span>${esc(found.address)}</span>` : ''}` : ''}</li>`;
      })
      .join('');

    return `<section class="plan${isB ? ' plan--b' : ''}">
      <header>
        <h2>Plan ${key}${isB ? ' — cover' : ''}</h2>
        <p>
          ${sum.scenes.length} scene${sum.scenes.length === 1 ? '' : 's'} ·
          ${esc(eighthsLabel(sum.eighths))} pages ·
          ${sum.shots} shot${sum.shots === 1 ? '' : 's'} ·
          call ${esc(plan.callTime || '—')}${plan.unit ? ` · ${esc(plan.unit)}` : ''}
        </p>
      </header>

      ${places ? `<ul class="places">${places}</ul>` : ''}

      ${sum.scenes.length ? `<table>
        <thead><tr><th class="n">Sc</th><th>Scene</th><th class="n">Pages</th><th class="n">Script</th><th class="n">Shots</th></tr></thead>
        <tbody>${scenes}</tbody>
      </table>` : '<p class="empty">No scenes on this plan.</p>'}

      ${cast ? `<table class="cast">
        <thead><tr><th>Character</th><th>Artist</th><th>Contact</th><th class="n">Scenes</th></tr></thead>
        <tbody>${cast}</tbody>
      </table>` : ''}

      ${plan.note ? `<p class="note">${esc(plan.note).replace(/\n/g, '<br>')}</p>` : ''}
    </section>`;
  };

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — ${esc(day.label)} call sheet</title>
<style>
  @page { size: Letter; margin: 0.55in; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 10pt/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }

  header.doc { border-bottom: 2.5px solid #000; padding-bottom: 8px; margin-bottom: 14px; }
  header.doc h1 { margin: 0; font-size: 16pt; letter-spacing: -0.01em; }
  header.doc p { margin: 4px 0 0; font-size: 10pt; }
  header.doc .when { float: right; text-align: right; font-size: 10pt; }

  .plan { break-inside: avoid; margin-bottom: 18px; padding-top: 6px; }
  .plan + .plan { border-top: 1px dashed #999; padding-top: 14px; }
  .plan header h2 { margin: 0; font-size: 12pt; }
  .plan header p { margin: 2px 0 8px; font-size: 9pt; color: #444; }
  /* The cover plan is present but visibly secondary. */
  .plan--b { color: #555; }
  .plan--b table, .plan--b .places { opacity: 0.92; }

  .places { list-style: none; margin: 0 0 10px; padding: 0; font-size: 9.5pt; }
  .places li { padding: 3px 0; border-bottom: 1px solid #eee; }
  .places span { display: block; color: #666; font-size: 8.5pt; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { padding: 4px 6px; border-bottom: 1.5px solid #000; font-size: 7.5pt; letter-spacing: 0.06em; text-align: left; text-transform: uppercase; }
  td { padding: 4px 6px; border-bottom: 1px solid #e2e2e2; font-size: 9.5pt; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  table.cast th { border-bottom-width: 1px; }
  .note { margin: 6px 0 0; padding: 8px 10px; background: #f3f3f1; border-left: 3px solid #000; font-size: 9pt; }
  .empty { color: #777; font-size: 9pt; }
  footer.doc { margin-top: 14px; border-top: 1px solid #000; padding-top: 6px; color: #666; font-size: 8pt; }
</style></head><body>
<header class="doc">
  <span class="when">${esc(prettyDate(day.date) || 'Date to be set')}<br>${esc(day.label)}</span>
  <h1>${esc(title)}</h1>
  <p>Call sheet · plan ${esc(day.active || 'A')} is today's intention</p>
</header>

${side('A')}
${side('B')}

<footer class="doc">
  Times are call times, not shooting times. Plan B is cover — confirm with the assistant director
  before travelling to it.
</footer>
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
