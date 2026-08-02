import { extractCast, extractLocations } from './preproduction';

/**
 * Budget planning.
 *
 * A budget is arithmetic; what makes one useful is that its lines come from
 * the script rather than from a blank template. The number of speaking roles,
 * the number of locations and the page count are all known — so the first
 * draft of the budget can be written for you, with the rates left empty
 * because only you know what things cost where you are shooting.
 */

export const CATEGORIES = [
  { id: 'story', label: 'Story & script', above: true },
  { id: 'cast', label: 'Cast', above: true },
  { id: 'direction', label: 'Direction & producers', above: true },
  { id: 'crew', label: 'Production crew' },
  { id: 'locations', label: 'Locations & sets' },
  { id: 'camera', label: 'Camera, lighting & grip' },
  { id: 'art', label: 'Art, costume & make-up' },
  { id: 'travel', label: 'Travel & transport' },
  { id: 'food', label: 'Food & accommodation' },
  { id: 'post', label: 'Post-production' },
  { id: 'sound', label: 'Music & sound' },
  { id: 'other', label: 'Other' },
];

export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export const UNITS = ['lump sum', 'per day', 'per week', 'per person', 'per scene', 'per shot', 'per km'];

/** A working day covers four to five script pages — the oldest estimate there is. */
export const PAGES_PER_DAY = 4;

export const emptyBudget = () => ({
  currency: 'INR',
  contingencyPct: 10,
  shootDays: 0,
  items: [],
});

export const makeItem = (item = {}) => ({
  id: `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  cat: 'other',
  name: '',
  qty: 1,
  unit: 'lump sum',
  rate: 0,
  days: 1,
  actual: 0,
  note: '',
  ...item,
});

/** What one line costs: quantity × rate × however many days it runs. */
export const lineTotal = (item) =>
  Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.rate) || 0) * Math.max(1, Number(item.days) || 1);

export const lineActual = (item) => Math.max(0, Number(item.actual) || 0);

/**
 * A first draft, written from the script: every speaking role, every location,
 * and the crew and services a shoot of this length needs. Rates are left at
 * zero — the shape is the useful part, not invented numbers.
 */
export function suggestBudget(doc, stats) {
  const cast = extractCast(doc.elements);
  const locations = extractLocations(doc.elements);
  const pages = stats.pageCount || 1;
  const days = Math.max(1, Math.ceil(pages / PAGES_PER_DAY));
  const items = [];

  const add = (cat, name, extra = {}) => items.push(makeItem({ cat, name, ...extra }));

  add('story', 'Screenplay and rights');

  // Cast: the leads carry days, everyone else is likely a day or two.
  cast.forEach((person, i) => {
    add('cast', person.name, {
      unit: 'per day',
      days: i < 3 ? days : Math.max(1, Math.round(days / 3)),
      note: `${person.cues} cues · ${person.words} words`,
    });
  });
  if (cast.length > 6) add('cast', 'Junior artists and extras', { unit: 'per day', days });

  add('direction', 'Director');
  add('direction', 'Producer / line producer');
  add('direction', 'Assistant directors', { qty: 2, unit: 'per day', days });

  add('crew', 'Cinematographer', { unit: 'per day', days });
  add('crew', 'Camera and lighting unit', { unit: 'per day', days });
  add('crew', 'Sound recordist', { unit: 'per day', days });
  add('crew', 'Production manager', { unit: 'per day', days });

  // Locations: what the script actually asks for, one line each.
  locations.forEach((loc) => {
    add('locations', loc.name, {
      unit: 'per day',
      days: Math.max(1, Math.ceil(loc.scenes / 2)),
      note: `${loc.scenes} scene${loc.scenes === 1 ? '' : 's'}`,
    });
  });
  add('locations', 'Permissions and police clearance');

  add('camera', 'Camera package', { unit: 'per day', days });
  add('camera', 'Lighting and grip package', { unit: 'per day', days });
  add('camera', 'Drone / specialist rigs', { unit: 'per day', days: 1 });

  add('art', 'Art direction and set dressing');
  add('art', 'Costume', { unit: 'per person', qty: Math.max(1, cast.length) });
  add('art', 'Make-up and hair', { unit: 'per day', days });

  add('travel', 'Unit transport', { unit: 'per day', days });
  add('travel', 'Fuel and tolls', { unit: 'per day', days });

  add('food', 'Unit catering', { unit: 'per day', days, qty: 25, note: 'head count × days' });
  add('food', 'Accommodation', { unit: 'per day', days });

  add('post', 'Editing');
  add('post', 'Colour grading');
  add('post', 'VFX and titles');
  add('sound', 'Sound design and mix');
  add('sound', 'Music and background score');

  return { ...emptyBudget(), shootDays: days, items };
}

/** Every number the top sheet needs, in one pass. */
export function totals(budget) {
  const items = budget?.items || [];
  const byCategory = new Map();

  for (const item of items) {
    const row = byCategory.get(item.cat) || { estimate: 0, actual: 0, lines: 0 };
    row.estimate += lineTotal(item);
    row.actual += lineActual(item);
    row.lines += 1;
    byCategory.set(item.cat, row);
  }

  const subtotal = items.reduce((n, i) => n + lineTotal(i), 0);
  const actual = items.reduce((n, i) => n + lineActual(i), 0);
  const contingency = Math.round((subtotal * (Number(budget?.contingencyPct) || 0)) / 100);

  return {
    byCategory,
    subtotal,
    contingency,
    grand: subtotal + contingency,
    actual,
    // Positive means money still unspent against the estimate.
    variance: subtotal - actual,
  };
}

export function money(value, currency = 'INR') {
  const n = Number(value) || 0;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function budgetToCsv(budget) {
  const head = ['Category', 'Line', 'Qty', 'Unit', 'Rate', 'Days', 'Estimate', 'Actual', 'Note'];
  const rows = (budget.items || []).map((i) => [
    CATEGORY_LABEL[i.cat] || i.cat, i.name, i.qty, i.unit, i.rate, i.days,
    lineTotal(i), lineActual(i), i.note,
  ]);
  const t = totals(budget);
  rows.push([], ['', 'Subtotal', '', '', '', '', t.subtotal, t.actual, '']);
  rows.push(['', `Contingency ${budget.contingencyPct}%`, '', '', '', '', t.contingency, '', '']);
  rows.push(['', 'Total', '', '', '', '', t.grand, t.actual, '']);
  return [head, ...rows].map((cols) => cols.map(csvCell).join(',')).join('\n') + '\n';
}

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The budget as it is handed over: a top sheet of category totals, then the
 * detail behind it. That order is deliberate — the person paying reads the
 * first page, the person spending reads the rest.
 */
export function printBudget(doc, budget, stats) {
  const title = doc.titlePage?.title || doc.name || 'Screenplay';
  const cur = budget.currency || 'INR';
  const t = totals(budget);
  const when = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

  const top = CATEGORIES.filter((c) => t.byCategory.has(c.id))
    .map((c) => {
      const row = t.byCategory.get(c.id);
      return `<tr>
        <td>${esc(c.label)}</td>
        <td class="n">${row.lines}</td>
        <td class="n">${esc(money(row.estimate, cur))}</td>
        <td class="n">${row.actual ? esc(money(row.actual, cur)) : ''}</td>
      </tr>`;
    })
    .join('\n');

  const detail = CATEGORIES.filter((c) => t.byCategory.has(c.id))
    .map((c) => {
      const rows = (budget.items || [])
        .filter((i) => i.cat === c.id)
        .map(
          (i) => `<tr>
          <td>${esc(i.name || '—')}</td>
          <td class="n">${esc(i.qty)}</td>
          <td>${esc(i.unit)}</td>
          <td class="n">${esc(money(i.rate, cur))}</td>
          <td class="n">${esc(i.days)}</td>
          <td class="n">${esc(money(lineTotal(i), cur))}</td>
          <td class="n">${lineActual(i) ? esc(money(lineActual(i), cur)) : ''}</td>
          <td class="note">${esc(i.note || '')}</td>
        </tr>`,
        )
        .join('\n');
      return `<section>
        <h2>${esc(c.label)}</h2>
        <table>
          <thead><tr><th>Line</th><th class="n">Qty</th><th>Unit</th><th class="n">Rate</th><th class="n">Days</th><th class="n">Estimate</th><th class="n">Actual</th><th>Note</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
    })
    .join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — budget</title>
<style>
  @page { size: Letter; margin: 0.6in; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font: 10pt/1.4 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  header.doc { border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 16px; }
  header.doc h1 { margin: 0; font-size: 15pt; }
  header.doc p { margin: 3px 0 0; font-size: 9pt; color: #444; }
  h2 { font-size: 11pt; margin: 16px 0 4px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  th { padding: 4px 6px; border-bottom: 1px solid #000; font-size: 7.5pt; letter-spacing: 0.06em; text-align: left; text-transform: uppercase; }
  td { padding: 4px 6px; border-bottom: 1px solid #ddd; font-size: 9pt; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .note { color: #555; font-size: 8pt; }
  .totals td { border-top: 1.5px solid #000; border-bottom: 0; font-weight: 700; padding-top: 6px; }
  .grand td { font-size: 11pt; }
  .topsheet { break-after: page; }
</style></head><body>
<header class="doc">
  <h1>${esc(title)} — budget</h1>
  <p>${stats.pageCount} pages · ${budget.shootDays || Math.ceil((stats.pageCount || 1) / 4)} shooting days · ${when}</p>
</header>

<section class="topsheet">
  <h2>Top sheet</h2>
  <table>
    <thead><tr><th>Category</th><th class="n">Lines</th><th class="n">Estimate</th><th class="n">Actual</th></tr></thead>
    <tbody>
${top}
      <tr class="totals"><td>Subtotal</td><td></td><td class="n">${esc(money(t.subtotal, cur))}</td><td class="n">${t.actual ? esc(money(t.actual, cur)) : ''}</td></tr>
      <tr class="totals"><td>Contingency ${esc(budget.contingencyPct)}%</td><td></td><td class="n">${esc(money(t.contingency, cur))}</td><td></td></tr>
      <tr class="totals grand"><td>Total</td><td></td><td class="n">${esc(money(t.grand, cur))}</td><td class="n">${t.actual ? esc(money(t.actual, cur)) : ''}</td></tr>
    </tbody>
  </table>
</section>

${detail}
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
