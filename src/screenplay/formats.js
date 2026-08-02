import { TYPES, charsPerLine, makeElement } from './elements';
import { fromMarkers, runs as styleRuns, toMarkers, toStyledRuns } from './markup';
import { paginate, wrapLines } from './paginate';
import { groupDual } from './dual';

/* ------------------------------------------------------------------ *
 * Fountain (https://fountain.io) — the plain-text screenplay standard
 * ------------------------------------------------------------------ */

export function toFountain(doc) {
  const tp = doc.titlePage || {};
  const head = [];
  if (tp.title) head.push(`Title: ${tp.title}`);
  if (tp.credit) head.push(`Credit: ${tp.credit}`);
  if (tp.author) head.push(`Author: ${tp.author}`);
  if (tp.source) head.push(`Source: ${tp.source}`);
  if (tp.draftDate) head.push(`Draft date: ${tp.draftDate}`);
  if (tp.contact) head.push(`Contact:\n    ${tp.contact.split('\n').join('\n    ')}`);

  const body = doc.elements.map((el) => {
    const plain = TYPES[el.type].uppercase ? el.text.toUpperCase() : el.text;
    // Emphasis becomes Fountain markers only here, at the boundary.
    const text = toMarkers(plain, el.styles);
    switch (el.type) {
      case 'scene_heading':
        // Force the slugline in case it does not start with INT./EXT.
        return /^(INT|EXT|EST|I\/E)/i.test(text) ? text : `.${text}`;
      case 'character':
        // Fountain marks a simultaneous speech by ending the cue with a caret.
        return `@${text}${el.dual ? ' ^' : ''}`;
      case 'parenthetical':
        return text.startsWith('(') ? text : `(${text})`;
      case 'transition':
        return text.endsWith(':') ? `> ${text}` : `> ${text}`;
      case 'shot':
        return `!${text}`;
      default:
        return text;
    }
  });

  // Dialogue must hug its cue; everything else gets a blank line between.
  let out = head.length ? head.join('\n') + '\n\n' : '';
  doc.elements.forEach((el, i) => {
    const prev = doc.elements[i - 1];
    const glued =
      prev &&
      (el.type === 'dialogue' || el.type === 'parenthetical') &&
      ['character', 'parenthetical', 'dialogue'].includes(prev.type);
    if (i > 0) out += glued ? '\n' : '\n\n';
    out += body[i];
  });
  return out + '\n';
}

export function fromFountain(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const titlePage = {};
  let i = 0;

  // Title page block: "Key: value" pairs terminated by a blank line.
  if (/^[A-Za-z ]+:/.test(lines[0] || '')) {
    let key = null;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { i++; break; }
      const m = line.match(/^([A-Za-z ]+):\s*(.*)$/);
      if (m) {
        key = m[1].trim().toLowerCase().replace(/ (.)/g, (_, c) => c.toUpperCase());
        titlePage[key] = m[2].trim();
      } else if (key) {
        titlePage[key] = (titlePage[key] ? titlePage[key] + '\n' : '') + line.trim();
      }
    }
  }

  const elements = [];
  const push = (type, t) => elements.push(makeElement(type, t));
  let prevType = null;

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { prevType = null; continue; }

    let type = 'action';
    let content = line;
    let dual = false;

    if (line.startsWith('.') && !line.startsWith('..')) {
      type = 'scene_heading';
      content = line.slice(1);
    } else if (/^(INT|EXT|EST|I\/E|INT\.\/EXT)[.\s]/i.test(line)) {
      type = 'scene_heading';
    } else if (line.startsWith('@')) {
      type = 'character';
      content = line.slice(1);
      if (content.trim().endsWith('^')) {
        dual = true;
        content = content.trim().slice(0, -1).trim();
      }
    } else if (line.startsWith('>') && !line.endsWith('<')) {
      type = 'transition';
      content = line.slice(1).trim();
    } else if (/^[A-Z\s\d'.-]+:$/.test(line) && /TO:$/.test(line)) {
      type = 'transition';
    } else if (line.startsWith('!')) {
      type = 'action';
      content = line.slice(1);
    } else if (/^\(.*\)$/.test(line) && ['character', 'dialogue', 'parenthetical'].includes(prevType)) {
      type = 'parenthetical';
    } else if (['character', 'parenthetical'].includes(prevType)) {
      type = 'dialogue';
    } else if (prevType === 'dialogue') {
      type = 'dialogue';
    } else if (
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      !/[.!?]$/.test(line) &&
      lines[i + 1] && lines[i + 1].trim()
    ) {
      type = 'character';
    }

    const parsed = fromMarkers(content);
    push(type, parsed.text);
    elements[elements.length - 1].styles = parsed.styles;
    if (dual) elements[elements.length - 1].dual = true;
    prevType = type;
  }

  return { titlePage, elements: elements.length ? elements : [makeElement('scene_heading')] };
}

/* ------------------------------------------------------------------ *
 * Final Draft (.fdx)
 * ------------------------------------------------------------------ */

const FDX_TYPE = {
  scene_heading: 'Scene Heading',
  action: 'Action',
  character: 'Character',
  parenthetical: 'Parenthetical',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
};

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function toFdx(doc) {
  const paras = doc.elements
    .map((el) => {
      const text = TYPES[el.type].uppercase ? el.text.toUpperCase() : el.text;
      // Final Draft carries emphasis as an attribute on each run of text.
      const runs =
        toStyledRuns(text, el.styles)
          .map((r) => `      <Text${r.style ? ` Style="${r.style}"` : ''}>${esc(r.text)}</Text>`)
          .join('\n') || '      <Text></Text>';
      return `    <Paragraph Type="${FDX_TYPE[el.type]}">\n${runs}\n    </Paragraph>`;
    })
    .join('\n');

  const tp = doc.titlePage || {};
  const titleParas = [tp.title, '', tp.credit, tp.author, '', tp.draftDate, tp.contact]
    .filter((v) => v !== undefined)
    .map((v) => `      <Paragraph Alignment="Center"><Text>${esc(v || '')}</Text></Paragraph>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paras}
  </Content>
  <TitlePage>
    <Content>
${titleParas}
    </Content>
  </TitlePage>
</FinalDraft>
`;
}

export function fromFdx(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('That .fdx file could not be parsed.');
  const reverse = Object.fromEntries(Object.entries(FDX_TYPE).map(([k, v]) => [v, k]));
  const elements = [];
  // Only the script body — the TitlePage has its own <Content> of paragraphs.
  doc.querySelectorAll('FinalDraft > Content > Paragraph').forEach((p) => {
    const type = reverse[p.getAttribute('Type')] || 'action';
    let text = '';
    const styles = [];
    for (const t of p.querySelectorAll('Text')) {
      const body = t.textContent;
      if (!body) continue;
      const style = t.getAttribute('Style') || '';
      const from = text.length;
      text += body;
      for (const [needle, kind] of [['Bold', 'bold'], ['Italic', 'italic'], ['Underline', 'underline']]) {
        if (style.includes(needle)) styles.push({ from, to: text.length, kind });
      }
    }
    const made = makeElement(type, text);
    made.styles = styles;
    elements.push(made);
  });
  const titleTexts = [...doc.querySelectorAll('TitlePage Text')].map((t) => t.textContent.trim()).filter(Boolean);
  return {
    titlePage: { title: titleTexts[0] || '', author: titleTexts[2] || '' },
    elements: elements.length ? elements : [makeElement('scene_heading')],
  };
}

/* ------------------------------------------------------------------ *
 * Fixed-pitch plain text (what a printed page looks like as characters)
 * ------------------------------------------------------------------ */

export function toPlainText(doc) {
  const pad = (n) => ' '.repeat(Math.max(0, n));
  const out = [];
  doc.elements.forEach((el, i) => {
    const cfg = TYPES[el.type];
    const text = cfg.uppercase ? el.text.toUpperCase() : el.text;
    if (i > 0) out.push(...Array(cfg.spaceBefore).fill(''));
    const indent = Math.round(cfg.indent / 0.1);
    for (const line of wrapLines(text, charsPerLine(el.type))) {
      out.push(cfg.align === 'right' ? pad(60 - line.length) + line : pad(indent) + line);
    }
  });
  return out.join('\n') + '\n';
}

/* ------------------------------------------------------------------ *
 * Print / PDF — a print window styled with real page geometry
 * ------------------------------------------------------------------ */

export function printScript(doc) {
  const tp = doc.titlePage || {};
  // The print window is served from about:blank, so font URLs must be absolute.
  const origin = window.location.origin;

  const elementHtml = (el) => {
    const cfg = TYPES[el.type];
    const text = cfg.uppercase ? el.text.toUpperCase() : el.text;
    // Emphasis prints as emphasis.
    const html = styleRuns(text, el.styles)
      .map((run) => {
        let body = esc(run.text);
        if (run.underline) body = `<u>${body}</u>`;
        if (run.italic) body = `<em>${body}</em>`;
        if (run.bold) body = `<strong>${body}</strong>`;
        return body;
      })
      .join('');
    return `<p class="el ${el.type}">${html || '&nbsp;'}</p>`;
  };

  // Break the script into sheets exactly the way the editor does, rather than
  // handing the browser one long column and hoping its page breaks land in the
  // same places. What is printed is then what was written, page for page — and
  // each sheet can carry its own folio, which flowed text cannot.
  const byId = new Map(doc.elements.map((el) => [el.id, el]));
  const { pages } = paginate(doc.elements);
  // A watermark names whoever this copy was printed for, so it goes on every
  // page including the title page — a stamp with gaps in it is no stamp.
  const wm = doc.watermark;
  const stamp = wm?.enabled && wm.text
    ? `<span class="stamp" style="opacity:${Number(wm.opacity ?? 0.12).toFixed(2)}">${esc(wm.text)}</span>`
    : '';

  const sheets = pages
    .map((ids, i) => {
      // Simultaneous speeches print in two columns, exactly as they are typed.
      const body = groupDual(ids.map((id) => byId.get(id)).filter(Boolean))
        .map((row) =>
          row.kind === 'dual'
            ? `<div class="dual"><div class="dual__col">${row.left.map(elementHtml).join('')}</div>` +
              `<div class="dual__col">${row.right.map(elementHtml).join('')}</div></div>`
            : elementHtml(row.el),
        )
        .join('\n');
      // Page one goes unnumbered, as a script always has.
      const folio = i > 0 ? `<span class="folio">${i + 1}.</span>` : '';
      return `<section class="sheet">${stamp}${folio}\n${body}\n</section>`;
    })
    .join('\n');

  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(tp.title || doc.name || 'Screenplay')}</title>
<style>
  /* The print window is a document of its own and inherits none of the app's
     styles, so the font has to be declared again here — otherwise the PDF
     quietly falls back to Courier New while the screen shows Courier Prime. */
  @font-face {
    font-family: 'Courier Prime';
    src: local('Courier Prime'), url('${origin}/fonts/CourierPrime-Regular.woff2') format('woff2');
    font-weight: 400; font-style: normal; font-display: block;
  }
  @font-face {
    font-family: 'Courier Prime';
    src: local('Courier Prime Bold'), url('${origin}/fonts/CourierPrime-Bold.woff2') format('woff2');
    font-weight: 700; font-style: normal; font-display: block;
  }
  @font-face {
    font-family: 'Courier Prime';
    src: local('Courier Prime Italic'), url('${origin}/fonts/CourierPrime-Italic.woff2') format('woff2');
    font-weight: 400; font-style: italic; font-display: block;
  }
  @font-face {
    font-family: 'Courier Prime';
    src: local('Courier Prime Bold Italic'), url('${origin}/fonts/CourierPrime-BoldItalic.woff2') format('woff2');
    font-weight: 700; font-style: italic; font-display: block;
  }

  /* The sheet carries its own margins, so the page box adds none. */
  @page { size: Letter; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  /* 12pt Courier at 6 lines to the inch — the measure every reader's sense of
     "one page, one minute" is calibrated against. */
  body { font: 12pt/1 "Courier Prime", "Courier New", Courier, monospace; }

  .sheet {
    position: relative;
    box-sizing: border-box;
    width: 8.5in;
    height: 11in;
    /* 1" top, 1" right, 1.5" left; the foot is a little shallower so a full
       55-line page never spills a line onto a sheet of its own. */
    padding: 1in 1in 0.75in 1.5in;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }

  /* Top right, half an inch down, followed by a period — where a page number
     has gone since scripts were typed. */
  .folio { position: absolute; top: 0.5in; right: 1in; }

  /* Printed underneath the type, never over it, so the script stays readable.
     Colour adjustment is forced on: browsers drop pale greys when printing to
     save ink, which would erase the stamp altogether. */
  .stamp {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-32deg);
    font-size: 68pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    white-space: nowrap;
    color: #000;
    pointer-events: none;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .title-sheet {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
  }
  .title-sheet .t { text-transform: uppercase; text-decoration: underline; margin-bottom: 1in; }
  .title-sheet .c { margin: 0.15in 0; }
  .title-sheet .contact {
    position: absolute; bottom: 1in; left: 1.5in;
    text-align: left; white-space: pre-line;
  }

  p.el { margin: 0; white-space: pre-wrap; }
  /* Indents are measured from the left text margin, matching the editor.
     These carry the element tag as well as the class deliberately: a bare
     .character would lose to p.el above and the indent would silently
     collapse to the margin. */
  p.el.scene_heading { font-weight: bold; margin-top: 2em; }
  p.el.action { margin-top: 1em; }
  p.el.character { margin-top: 1em; margin-left: 2.2in; width: 3.8in; }
  p.el.parenthetical { margin-left: 1.6in; width: 2.5in; }
  p.el.dialogue { margin-left: 1.0in; width: 3.5in; }
  p.el.transition { margin-top: 1em; text-align: right; }
  p.el.shot { margin-top: 1em; }
  /* A sheet never opens with a blank line, however the break fell. */
  .sheet .el:first-of-type { margin-top: 0; }

  /* Two people talking at once: half the measure each, side by side. */
  .dual { display: flex; gap: 0.6in; margin-left: 0.15in; margin-top: 1em; }
  .dual .dual__col { width: 2.7in; }
  .dual p.el { margin-left: 0 !important; width: 100% !important; }
  .dual p.el.character { text-align: center; }
  .dual p.el.parenthetical { padding-left: 0.35in; }
  .dual .dual__col > p.el:first-child { margin-top: 0; }
</style></head><body>
${tp.title ? `<section class="sheet title-sheet">${stamp}
  <div class="t">${esc(tp.title)}</div>
  ${tp.credit ? `<div class="c">${esc(tp.credit)}</div>` : ''}
  ${tp.author ? `<div class="c">${esc(tp.author)}</div>` : ''}
  ${tp.source ? `<div class="c">${esc(tp.source)}</div>` : ''}
  ${tp.draftDate ? `<div class="c">${esc(tp.draftDate)}</div>` : ''}
  ${tp.contact ? `<div class="contact">${esc(tp.contact)}</div>` : ''}
</section>` : ''}
${sheets}
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

export function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
