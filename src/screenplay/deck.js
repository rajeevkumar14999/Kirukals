import { extractCast, extractLocations } from './preproduction';
import { money, totals } from './budget';

/**
 * The pitch deck.
 *
 * Half of a deck is already known: the title page, who is in it, where it
 * happens, what it costs. Those slides are assembled from the rest of the app
 * and stay true as the script changes. The other half — what the film is
 * about, why it should exist, who it is for — nobody can write but you.
 */

export const emptyDeck = () => ({
  tagline: '',
  logline: '',
  synopsis: '',
  genre: '',
  tone: '',
  comparables: '',
  language: '',
  audience: '',
  directorNote: '',
  team: '',
  ask: '',
  contact: '',
  cover: null,
  look: [],
  hidden: {},
});

/** Slides in the order a room expects to see them. */
export const SLIDES = [
  { id: 'title', label: 'Title' },
  { id: 'logline', label: 'Logline' },
  { id: 'synopsis', label: 'Synopsis' },
  { id: 'positioning', label: 'Genre & audience' },
  { id: 'characters', label: 'Characters' },
  { id: 'locations', label: 'Locations' },
  { id: 'look', label: 'Look & references' },
  { id: 'budget', label: 'Budget' },
  { id: 'team', label: 'Team' },
  { id: 'ask', label: 'The ask' },
];

/**
 * Turn the document into finished slides.
 *
 * Anything empty is dropped rather than shown as a blank promise — a deck with
 * eight true slides is stronger than one with twelve, two of which say
 * "lorem ipsum".
 */
export function buildSlides(doc, stats, board) {
  const deck = { ...emptyDeck(), ...(board.deck || {}) };
  const tp = doc.titlePage || {};
  const hidden = deck.hidden || {};
  const cast = extractCast(doc.elements).slice(0, 6);
  const locations = extractLocations(doc.elements).slice(0, 8);
  const budget = board.budget;
  const t = budget ? totals(budget) : null;

  const chosenActor = (name) => {
    const row = board.cast?.[name];
    return row?.options?.find((o) => o.id === row.chosen) || null;
  };
  const chosenPlace = (name) => {
    const row = board.locations?.[name];
    return row?.options?.find((o) => o.id === row.chosen) || null;
  };

  const slides = [];
  const push = (slide) => {
    if (!hidden[slide.id]) slides.push(slide);
  };

  push({
    id: 'title',
    kind: 'title',
    title: tp.title || doc.name || 'Untitled',
    tagline: deck.tagline,
    byline: [tp.credit, tp.author].filter(Boolean).join(' '),
    image: deck.cover?.data || null,
  });

  if (deck.logline.trim()) {
    push({ id: 'logline', kind: 'statement', label: 'Logline', body: deck.logline });
  }

  if (deck.synopsis.trim()) {
    push({ id: 'synopsis', kind: 'prose', label: 'Synopsis', body: deck.synopsis });
  }

  const facts = [
    ['Genre', deck.genre],
    ['Tone', deck.tone],
    ['Language', deck.language],
    ['Runtime', stats.runtime ? `about ${stats.runtime} minutes` : ''],
    ['Audience', deck.audience],
    ['In the vein of', deck.comparables],
  ].filter(([, v]) => v && String(v).trim());
  if (facts.length) push({ id: 'positioning', kind: 'facts', label: 'The film', rows: facts });

  if (cast.length) {
    push({
      id: 'characters',
      kind: 'people',
      label: 'Characters',
      people: cast.map((c) => {
        const actor = chosenActor(c.name);
        return {
          name: c.name,
          meta: `${c.cues} scene${c.cues === 1 ? '' : 's'} speaking`,
          actor: actor?.name || '',
          image: actor?.portfolio?.kind === 'image' ? actor.portfolio.data : null,
        };
      }),
    });
  }

  if (locations.length) {
    push({
      id: 'locations',
      kind: 'places',
      label: 'Locations',
      places: locations.map((l) => {
        const place = chosenPlace(l.name);
        return {
          name: l.name,
          meta: `${l.scenes} scene${l.scenes === 1 ? '' : 's'}${l.kinds.length ? ` · ${l.kinds.join('/')}` : ''}`,
          found: place?.place || place?.address || '',
        };
      }),
    });
  }

  if (deck.look?.length) {
    push({ id: 'look', kind: 'images', label: 'Look & references', images: deck.look });
  }

  if (t && (t.grand > 0 || budget.items?.length)) {
    push({
      id: 'budget',
      kind: 'facts',
      label: 'Budget',
      rows: [
        ['Total', money(t.grand, budget.currency)],
        ['Shooting days', String(budget.shootDays || Math.ceil((stats.pageCount || 1) / 4))],
        ['Contingency', `${budget.contingencyPct}%`],
        ['Per shooting day', money(Math.round(t.grand / Math.max(1, budget.shootDays || 1)), budget.currency)],
      ],
    });
  }

  if (deck.directorNote.trim()) {
    push({ id: 'note', kind: 'prose', label: "Director's note", body: deck.directorNote });
  }

  if (deck.team.trim()) {
    push({ id: 'team', kind: 'prose', label: 'Team', body: deck.team });
  }

  if (deck.ask.trim() || deck.contact.trim()) {
    push({
      id: 'ask',
      kind: 'statement',
      label: 'The ask',
      body: deck.ask,
      footer: deck.contact,
    });
  }

  return slides;
}

/* --------------------------------- print --------------------------------- */

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const paras = (text) =>
  String(text)
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

function slideHtml(slide, i, count, film) {
  const foot = `<div class="foot"><span>${esc(film)}</span><span>${i + 1} / ${count}</span></div>`;

  switch (slide.kind) {
    case 'title':
      return `<section class="slide slide--title"${slide.image ? ` style="background-image:url('${slide.image}')"` : ''}>
        <div class="veil">
          <p class="eyebrow">${esc(slide.eyebrow || 'A feature film')}</p>
          <h1>${esc(slide.title)}</h1>
          ${slide.tagline ? `<p class="tagline">${esc(slide.tagline)}</p>` : ''}
          ${slide.byline ? `<p class="byline">${esc(slide.byline)}</p>` : ''}
        </div>
      </section>`;
    case 'statement':
      return `<section class="slide">
        <span class="label">${esc(slide.label)}</span>
        <blockquote>${esc(slide.body)}</blockquote>
        ${slide.footer ? `<p class="stfoot">${esc(slide.footer).replace(/\n/g, '<br>')}</p>` : ''}
        ${foot}
      </section>`;
    case 'prose':
      return `<section class="slide">
        <span class="label">${esc(slide.label)}</span>
        <div class="prose">${paras(slide.body)}</div>
        ${foot}
      </section>`;
    case 'facts':
      return `<section class="slide">
        <span class="label">${esc(slide.label)}</span>
        <dl>${slide.rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
        ${foot}
      </section>`;
    case 'people':
      return `<section class="slide">
        <span class="label">${esc(slide.label)}</span>
        <ul class="people">${slide.people
          .map(
            (p) => `<li>
              ${p.image ? `<img src="${p.image}" alt="">` : '<span class="ph"></span>'}
              <b>${esc(p.name)}</b>
              ${p.actor ? `<i>${esc(p.actor)}</i>` : ''}
              <em>${esc(p.meta)}</em>
            </li>`,
          )
          .join('')}</ul>
        ${foot}
      </section>`;
    case 'places':
      return `<section class="slide">
        <span class="label">${esc(slide.label)}</span>
        <ul class="places">${slide.places
          .map(
            (p) => `<li><b>${esc(p.name)}</b><em>${esc(p.meta)}</em>${p.found ? `<i>${esc(p.found)}</i>` : ''}</li>`,
          )
          .join('')}</ul>
        ${foot}
      </section>`;
    case 'images':
      return `<section class="slide slide--images">
        <span class="label">${esc(slide.label)}</span>
        <div class="grid">${slide.images.map((im) => `<img src="${im.data}" alt="">`).join('')}</div>
        ${foot}
      </section>`;
    default:
      return '';
  }
}

/**
 * The deck as a document — one slide to a landscape page, in the same design
 * as the screen. Fonts are declared again because the print window inherits
 * nothing, and images are forced to print because browsers drop them to save
 * ink otherwise.
 */
export function printDeck(doc, stats, board) {
  const slides = buildSlides(doc, stats, board);
  const title = doc.titlePage?.title || doc.name || 'Untitled';
  const theme = board.deck?.theme === 'light' ? 'light' : 'dark';
  const origin = window.location.origin;

  const face = (family, file, weight) => `@font-face {
    font-family: '${family}'; font-weight: ${weight}; font-display: block;
    src: url('${origin}/fonts/${file}') format('woff2');
  }`;

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)} — pitch deck</title>
<style>
  ${face('Deck Sans', 'Inter-400.woff2', 400)}
  ${face('Deck Sans', 'Inter-500.woff2', 500)}
  ${face('Deck Sans', 'Inter-600.woff2', 600)}
  ${face('Deck Sans', 'Inter-700.woff2', 700)}
  ${face('Deck Serif', 'Playfair-400.woff2', 400)}
  ${face('Deck Serif', 'Playfair-700.woff2', 700)}

  @page { size: Letter landscape; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }

  :root {
    --ink: ${theme === 'dark' ? '#f4f4f2' : '#14161a'};
    --dim: ${theme === 'dark' ? '#9aa1ab' : '#6b7280'};
    --hair: ${theme === 'dark' ? '#2b2f36' : '#e3e5e9'};
    --paper: ${theme === 'dark' ? '#0e1013' : '#fbfbfa'};
    --accent: ${theme === 'dark' ? '#d9a441' : '#b0752a'};
  }

  .slide {
    position: relative;
    width: 11in; height: 8.5in;
    padding: 0.82in 0.95in 0.9in;
    display: flex; flex-direction: column;
    background: var(--paper);
    color: var(--ink);
    overflow: hidden;
    break-after: page;
    font-family: 'Deck Sans', -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 12pt;
    -webkit-font-smoothing: antialiased;
  }
  .slide:last-child { break-after: auto; }

  .label {
    display: flex; align-items: center; gap: 0.12in;
    margin-bottom: 0.34in;
    color: var(--accent);
    font-size: 8pt; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase;
  }
  .label::after { content: ''; flex: 1; height: 1px; background: var(--hair); }

  .foot {
    position: absolute; left: 0.95in; right: 0.95in; bottom: 0.42in;
    display: flex; justify-content: space-between;
    color: var(--dim);
    font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase;
  }

  .slide--title { padding: 0; background: #0b0d10 center / cover no-repeat; color: #fff; }
  .slide--title .veil {
    flex: 1; display: flex; flex-direction: column; justify-content: flex-end;
    padding: 0.95in;
    background: linear-gradient(to top, rgba(0,0,0,0.9) 8%, rgba(0,0,0,0.45) 48%, rgba(0,0,0,0.15));
  }
  .eyebrow {
    margin: 0 0 0.22in; color: rgba(255,255,255,0.72);
    font-size: 8pt; font-weight: 600; letter-spacing: 0.28em; text-transform: uppercase;
  }
  .slide--title h1 {
    margin: 0; font-family: 'Deck Serif', Georgia, serif; font-weight: 400;
    font-size: 46pt; line-height: 1.02; letter-spacing: -0.015em;
  }
  .tagline { margin: 0.16in 0 0; max-width: 22ch; font-size: 19pt; font-weight: 300; line-height: 1.28; color: rgba(255,255,255,0.9); }
  .byline {
    margin: 0.34in 0 0; padding-top: 0.16in;
    border-top: 1px solid rgba(255,255,255,0.28);
    font-size: 10pt; letter-spacing: 0.06em; color: rgba(255,255,255,0.75);
  }

  blockquote {
    margin: auto 0; max-width: 26ch;
    font-family: 'Deck Serif', Georgia, serif;
    font-size: 30pt; line-height: 1.24; letter-spacing: -0.01em;
  }
  .stfoot {
    margin: 0.28in 0 0; padding-top: 0.16in; border-top: 1px solid var(--hair);
    color: var(--dim); font-size: 10pt; line-height: 1.6;
  }

  .prose { column-count: 2; column-gap: 0.42in; font-size: 11pt; line-height: 1.62; }
  .prose p { margin: 0 0 0.14in; break-inside: avoid; }
  .prose p:first-child { font-size: 12pt; line-height: 1.5; }

  dl { margin: 0; display: grid; }
  dl div {
    display: grid; grid-template-columns: 1.9in 1fr; gap: 0.24in; align-items: baseline;
    padding: 0.13in 0; border-bottom: 1px solid var(--hair);
  }
  dl div:first-child { border-top: 1px solid var(--hair); }
  dt { color: var(--dim); font-size: 8pt; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; }
  dd { margin: 0; font-size: 15pt; font-weight: 500; }

  ul { list-style: none; margin: 0; padding: 0; }
  .people { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.26in 0.2in; }
  .people img, .people .ph {
    display: block; width: 100%; aspect-ratio: 3 / 4; object-fit: cover;
    background: var(--hair); border-radius: 3px; margin-bottom: 0.1in;
    filter: grayscale(0.15) contrast(1.03);
  }
  .people b { display: block; font-size: 11pt; font-weight: 600; }
  .people i { display: block; margin-top: 0.02in; font-style: normal; font-size: 9.5pt; color: var(--accent); }
  .people em { display: block; margin-top: 0.04in; font-style: normal; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }

  .places { display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.42in; }
  .places li { display: grid; gap: 0.03in; padding: 0.13in 0; border-bottom: 1px solid var(--hair); }
  .places b { font-size: 11pt; font-weight: 600; }
  .places em { font-style: normal; font-size: 7.5pt; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim); }
  .places i { font-style: normal; font-size: 9.5pt; color: var(--accent); }

  .slide--images { padding-bottom: 0.42in; }
  .grid {
    flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; gap: 0.08in;
  }
  .grid img { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; filter: contrast(1.04) saturate(0.96); }
  .grid img:first-child { grid-column: span 2; grid-row: span 2; }
</style></head><body>
${slides.map((slide, i) => slideHtml(slide, i, slides.length, title)).join('\n')}
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
