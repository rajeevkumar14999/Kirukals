import { makeElement } from './elements';
import { fromFdx, fromFountain } from './formats';

/**
 * File import.
 *
 * Screenplay files arrive in three shapes: plain text (Fountain), XML (Final
 * Draft .fdx), and zip containers holding one of those (.wdz and friends).
 * Legacy Final Draft .fdr is a fourth: a proprietary binary that has to be
 * mined rather than parsed.
 *
 * Extension is only a hint — writers rename files, and a .txt is often really
 * an .fdx. Everything here sniffs the actual bytes and falls back in order.
 */

const decodeUtf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);

/** Detect and strip a byte-order mark, decoding UTF-16 if that is what it is. */
function decodeText(bytes) {
  if (bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return decodeUtf8(bytes.subarray(3));
  }
  return decodeUtf8(bytes);
}

const dv = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

const startsWith = (bytes, sig) => sig.every((b, i) => bytes[i] === b);

// "PK\x03\x04" is a normal archive; "PK\x05\x06" is an empty one and
// "PK\x07\x08" a spanned one — both still have a central directory to read.
const isZip = (bytes) =>
  startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
  startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
  startsWith(bytes, [0x50, 0x4b, 0x07, 0x08]);

const isGzip = (bytes) => startsWith(bytes, [0x1f, 0x8b]);

/**
 * A zip is defined by its directory at the *end*, not by its first four bytes —
 * anything prepended (a wrapper, a self-extractor stub) leaves a perfectly
 * valid archive that no longer starts with "PK". Look for the end-of-central-
 * directory record before giving up on it.
 */
function hasZipDirectory(bytes) {
  if (bytes.length < 22) return false;
  const view = dv(bytes);
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) return true;
  }
  return false;
}

const looksLikeZip = (bytes) => isZip(bytes) || hasZipDirectory(bytes);

/**
 * What a file actually is, in words — attached to import failures so an
 * unrecognised format can be identified instead of guessed at.
 */
export function describeBytes(bytes, filename = '') {
  const hex = [...bytes.subarray(0, 8)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
  const ascii = [...bytes.subarray(0, 16)]
    .map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·'))
    .join('');

  let guess = 'unknown';
  if (isZip(bytes)) guess = 'zip container';
  else if (hasZipDirectory(bytes)) guess = 'zip container with a prefix';
  else if (isGzip(bytes)) guess = 'gzip';
  else if (startsWith(bytes, [0x7b])) guess = 'JSON';
  else if (startsWith(bytes, [0x3c])) guess = 'XML/HTML';
  else if (startsWith(bytes, [0x7b, 0x5c, 0x72, 0x74])) guess = 'RTF';
  else if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) guess = 'PDF';
  else if (!looksBinary(bytes)) guess = 'plain text';
  else guess = 'binary, unrecognised';

  return `${filename || 'file'} · ${bytes.length} bytes · ${guess} · starts ${hex} · “${ascii}”`;
}

/**
 * Control characters never appear in a text screenplay, but they are ~9% of
 * random bytes — counting them all (not just NUL) is what separates a real
 * document from a file that merely lacks a signature.
 */
function looksBinary(bytes) {
  const sample = bytes.subarray(0, 4096);
  if (!sample.length) return false;
  let control = 0;
  for (const b of sample) {
    if (b === 0 || (b < 0x09) || (b > 0x0d && b < 0x20)) control += 1;
  }
  return control > sample.length * 0.02;
}

/**
 * Does decoded text read like prose at all? Mined bytes and binary junk that
 * slipped the control-character test still fail this, which stops the importer
 * turning noise into a screenplay.
 */
function looksLikeProse(text) {
  const sample = text.slice(0, 4000);
  if (sample.trim().length < 4) return false;
  // Letters in any script, plus the spaces and punctuation prose is made of.
  const readable = (sample.match(/[\p{L}\p{M}\p{N}\s.,;:'"!?()[\]{}/–—-]/gu) || []).length;
  return readable / sample.length > 0.85;
}

/* ------------------------------------------------------------------ *
 * Zip containers (.wdz, and any other zipped screenplay bundle)
 * ------------------------------------------------------------------ */

/**
 * Minimal zip reader: walk the central directory, inflate the entries we want.
 * Uses the platform's DecompressionStream so there is no zip dependency.
 */
async function readZip(bytes) {
  const view = dv(bytes);

  // The end-of-central-directory record lives in the last 64KB, after a
  // variable-length comment, so scan backwards for its signature.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('no end-of-central-directory record — not a zip, or truncated');

  let count = view.getUint16(eocd + 10, true);
  let cdOffset = view.getUint32(eocd + 16, true);

  // Zip64: the 32-bit fields saturate and the real values live in a separate
  // record pointed at by the locator just before the EOCD.
  if (cdOffset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator >= 0 && view.getUint32(locator, true) === 0x07064b50) {
      const z64 = Number(view.getBigUint64(locator + 8, true));
      if (view.getUint32(z64, true) === 0x06064b50) {
        count = Number(view.getBigUint64(z64 + 32, true));
        cdOffset = Number(view.getBigUint64(z64 + 48, true));
      }
    }
  }

  // Archives with something prepended (self-extractors, wrappers) keep their
  // original offsets, so everything is shifted by the size of the prefix.
  let shift = 0;
  if (view.getUint32(cdOffset, true) !== 0x02014b50) {
    for (let i = 0; i + 4 <= bytes.length; i++) {
      if (view.getUint32(i, true) === 0x02014b50) {
        shift = i - cdOffset;
        cdOffset = i;
        break;
      }
    }
    if (view.getUint32(cdOffset, true) !== 0x02014b50) {
      throw new Error('no central directory — the archive looks damaged');
    }
  }

  let p = cdOffset;
  const entries = [];

  for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true) + shift;
    // PowerShell writes Windows separators into entry names; normalise so the
    // ranking below sees a path either way.
    const name = decodeUtf8(bytes.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/');
    entries.push({ name, method, compressedSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const read = async (entry) => {
    // The local header repeats the name and extra fields at its own lengths.
    const lh = entry.localOffset;
    if (view.getUint32(lh, true) !== 0x04034b50) {
      throw new Error(`damaged entry “${entry.name}”`);
    }
    const nameLen = view.getUint16(lh + 26, true);
    const extraLen = view.getUint16(lh + 28, true);
    const start = lh + 30 + nameLen + extraLen;

    // A zero size means the writer used a data descriptor and put the real
    // length after the data — read to the next header and let the inflater
    // stop where the stream ends.
    let end = start + entry.compressedSize;
    if (!entry.compressedSize) {
      end = bytes.length;
      for (let i = start; i + 4 <= bytes.length; i++) {
        const sig = view.getUint32(i, true);
        if (sig === 0x04034b50 || sig === 0x02014b50 || sig === 0x08074b50) {
          end = i;
          break;
        }
      }
    }

    const raw = bytes.subarray(start, end);
    if (entry.method === 0) return raw;
    if (entry.method !== 8) {
      const named = { 9: 'deflate64', 12: 'bzip2', 14: 'LZMA', 93: 'zstd' }[entry.method];
      throw new Error(
        `“${entry.name}” uses ${named || `compression method ${entry.method}`}, which browsers cannot decompress. Re-zip it with standard deflate.`,
      );
    }
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };

  return { entries, read };
}

/** Rank the files inside a container by how likely they are to be the script. */
function rankEntry(name) {
  const n = name.toLowerCase();
  if (n.endsWith('/') || n.startsWith('__macosx') || n.includes('/.')) return -1;
  // Container metadata is never the screenplay.
  if (/(^|\/)(mimetype|meta\.json|manifest\.json|package\.json|\[content_types\]\.xml)$/.test(n)) return -1;
  if (n.endsWith('.fdx')) return 100;
  if (n.endsWith('.fountain') || n.endsWith('.spmd')) return 90;
  if (n.endsWith('.fdr')) return 80;
  /*
    Celtx keeps the screenplay as HTML inside the bundle, named script-<id>.html
    beside a scratch file and two RDF catalogues. It was scoring zero here — an
    extension nobody had ranked — so a .celtx opened to "no screenplay found"
    while the file it wanted was sitting right there in the listing.
  */
  if (/(^|\/)script[^/]*\.x?html?$/.test(n)) return 85;
  if (/(^|\/)scratch[^/]*\.x?html?$/.test(n)) return 30; // notes, not the script
  // Bundles from other apps keep the script under a predictable name.
  if (/(document|script|screenplay|content|main)\.(xml|json|txt)$/.test(n)) return 75;
  if (n.endsWith('.xml')) return 70;
  if (n.endsWith('.json')) return 60;
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.rtf')) return 50;
  // Extensionless payloads are common inside bundles — still worth a look.
  return /\.[a-z0-9]+$/.test(n) ? 0 : 20;
}

async function fromZip(bytes, notes) {
  const { entries, read } = await readZip(bytes);
  const ranked = entries
    .map((e) => ({ e, score: rankEntry(e.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    throw new Error(
      `No screenplay found inside the archive (it holds: ${entries.map((e) => e.name).slice(0, 6).join(', ') || 'nothing'}).`,
    );
  }

  const chosen = ranked[0].e;
  if (entries.length > 1) notes.push(`Read “${chosen.name}” from inside the archive.`);
  return parseBytes(await read(chosen), chosen.name, notes);
}

/* ------------------------------------------------------------------ *
 * Legacy Final Draft (.fdr) — binary, so mine it rather than parse it
 * ------------------------------------------------------------------ */

// Strings the format itself writes: fonts, template names, internal markers.
const FDR_NOISE = /^(courier|final draft|finaldraft|helvetica|times|arial|screenplay|normal text|script|untitled|page \d+|\d+(\.\d+)?)$/i;

/**
 * Final Draft 7 and earlier wrote a proprietary binary. There is no public
 * schema, but the paragraph text is stored as readable runs between binary
 * markers, so pull the runs out and re-classify them with the Fountain
 * heuristics. This is lossy by nature — the caller warns the user.
 */
export function fromFdr(bytes) {
  const latin = new TextDecoder('latin1').decode(bytes);
  const runs = latin.match(/[\x20-\x7e -ɏ]{2,}/g) || [];

  const lines = runs
    .map((s) => s.replace(/\s+/g, ' ').trim())
    // Drop runs with no letters, and the format's own bookkeeping strings.
    .filter((s) => s.length > 1 && /[A-Za-z]/.test(s) && !FDR_NOISE.test(s))
    // Binary noise tends to be short runs of punctuation and stray capitals.
    .filter((s) => (s.match(/[A-Za-z ]/g) || []).length / s.length > 0.6);

  if (!lines.length) {
    throw new Error(
      'No readable text found in that .fdr. If you have Final Draft 8 or later, open it there and save as .fdx for an exact import.',
    );
  }

  return { titlePage: {}, elements: classifyRecovered(lines) };
}

const SLUG_RE = /^(INT|EXT|EST|I\/E|INT\.\/EXT)[.\s]/i;
const TRANSITION_RE = /(TO:|^FADE (IN|OUT)[.:]?$|^THE END$)/i;

/**
 * Type a list of recovered lines by their shape alone.
 *
 * Fountain's own parser leans on blank lines to separate blocks, which a binary
 * dump does not have, so this walks the lines in sequence instead: a cue is
 * short and shouted, what follows a cue is dialogue, and everything else is
 * action. It gets the common pattern right and will mis-type continued
 * dialogue as action — hence the warning shown on import.
 */
function classifyRecovered(lines) {
  const elements = [];
  let prev = null;

  for (const line of lines) {
    let type = 'action';

    if (SLUG_RE.test(line)) {
      type = 'scene_heading';
    } else if (TRANSITION_RE.test(line) && line.length < 30 && line === line.toUpperCase()) {
      type = 'transition';
    } else if (/^\(.*\)$/.test(line) && ['character', 'dialogue'].includes(prev)) {
      type = 'parenthetical';
    } else if (
      // A cue: short, no lowercase, no sentence-ending punctuation.
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      line.length <= 40 &&
      !/[.!?,]$/.test(line)
    ) {
      type = 'character';
    } else if (prev === 'character' || prev === 'parenthetical') {
      type = 'dialogue';
    }

    elements.push(makeElement(type, line));
    prev = type;
  }
  return elements;
}

/* ------------------------------------------------------------------ *
 * Generic XML that is not Final Draft
 * ------------------------------------------------------------------ */

function fromGenericXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('That XML could not be parsed.');
  // Pull the text of every leaf node in document order and re-type it.
  const lines = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const t = child.textContent.replace(/\s+/g, ' ').trim();
        if (t) lines.push(t);
      } else if (child.nodeType === 1) {
        walk(child);
      }
    }
  };
  walk(doc.documentElement);
  if (!lines.length) throw new Error('That file has no readable text in it.');
  return fromFountain(lines.join('\n\n'));
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

/**
 * Celtx, which writes a screenplay as HTML.
 *
 * Every line is a paragraph carrying Celtx's own class — sceneheading, action,
 * character, dialog, parenthetical, transition, shot — so the element types
 * come across exactly rather than being guessed from the shape of the text.
 * That mapping is the whole job; the rest is unpicking entities and throwing
 * away the wrapper markup Celtx puts around each line.
 */
function fromCeltxHtml(html, notes) {
  const TYPE = {
    sceneheading: 'scene_heading',
    'scene-heading': 'scene_heading',
    slug: 'scene_heading',
    action: 'action',
    character: 'character',
    dialog: 'dialogue',
    dialogue: 'dialogue',
    parenthetical: 'parenthetical',
    paren: 'parenthetical',
    transition: 'transition',
    shot: 'shot',
    act: 'scene_heading',
  };

  const strip = (s) =>
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
      .replace(/[ \t]+/g, ' ')
      .trim();

  const elements = [];
  let unknown = 0;
  // Celtx wraps each line in <p class="..."> — sometimes with the class on an
  // inner <span>, so both are looked at before giving up on a line.
  const paragraphs = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];

  for (const p of paragraphs) {
    const classes = (p.match(/class\s*=\s*["']([^"']+)["']/i)?.[1] || '').toLowerCase().split(/\s+/);
    const key = classes.find((c) => TYPE[c]);
    const text = strip(p);
    if (!text) continue;
    if (!key) unknown++;
    elements.push({
      id: `e${Math.random().toString(36).slice(2, 10)}`,
      // A line whose class Celtx did not write is far more often action than
      // anything else, so an unrecognised paragraph lands there rather than
      // being dropped — no words are lost, at worst a type needs correcting.
      type: key ? TYPE[key] : 'action',
      text,
      styles: [],
      comments: [],
    });
  }

  if (!elements.length) {
    throw new Error('that Celtx script has no screenplay paragraphs in it');
  }
  if (unknown) {
    notes.push(`${unknown} line${unknown === 1 ? '' : 's'} carried no Celtx element type and came in as action.`);
  }

  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
  return {
    name: title || 'Imported script',
    titlePage: title ? { title } : {},
    elements,
  };
}

async function parseBytes(bytes, filename, notes) {
  const ext = (filename.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();

  if (looksLikeZip(bytes)) return fromZip(bytes, notes);

  // Some bundle formats are a single gzipped payload rather than a zip.
  if (isGzip(bytes)) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const inner = new Uint8Array(await new Response(stream).arrayBuffer());
    notes.push('Unpacked a gzipped file.');
    return parseBytes(inner, filename.replace(/\.(gz|wdz)$/i, ''), notes);
  }

  // Celtx, and anything else that stores a script as HTML.
  const opening = decodeText(bytes.subarray(0, 400)).toLowerCase();
  if (/\.x?html?$/.test(ext) || opening.includes('<html') || opening.includes('<!doctype html')) {
    return fromCeltxHtml(decodeText(bytes), notes);
  }

  // JSON is detected by content, not extension — a bundle may hand us one
  // under any name.
  const head = decodeText(bytes.subarray(0, 64)).trimStart();
  if (head.startsWith('{') || head.startsWith('[')) {
    let doc;
    try {
      doc = JSON.parse(decodeText(bytes));
    } catch {
      throw new Error('this looks like JSON but does not parse');
    }
    // Our own backup round-trips exactly.
    if (Array.isArray(doc?.elements)) {
      return {
        titlePage: doc.titlePage || {},
        elements: doc.elements.map((el) => makeElement(el.type, el.text)),
      };
    }
    // Someone else's JSON: take the largest block of text in it, if any.
    const text = [doc?.script, doc?.content, doc?.text, doc?.body]
      .filter((v) => typeof v === 'string')
      .sort((a, b) => b.length - a.length)[0];
    if (text && looksLikeProse(text)) {
      notes.push('Read the script text out of a JSON file — element types were guessed by shape.');
      return fromFountain(text);
    }
    throw new Error('this is JSON, but not a screenplay Kirukals recognises');
  }

  if (looksBinary(bytes)) {
    const text = decodeText(bytes);
    // A binary wrapper may still hold XML or JSON whole.
    if (text.includes('<FinalDraft')) return fromFdx(text);
    const embedded = text.match(/<\?xml[\s\S]*<\/[A-Za-z][^>]*>/);
    if (embedded) {
      notes.push('Found XML embedded in a binary wrapper and read that.');
      return fromGenericXml(embedded[0]);
    }

    // Mining only makes sense if there is language in there. Judge the whole
    // haul, not the best line — random bytes always yield a few letter runs
    // that pass on their own, and a screenplay made of those is worse than an
    // honest failure.
    const mined = fromFdr(bytes);
    const haul = mined.elements.map((el) => el.text).join(' ');
    const words = haul.split(/\s+/).filter((w) => /^[\p{L}][\p{L}'’-]{2,}$/u.test(w));
    if (haul.length < 60 || words.length < 8 || !looksLikeProse(haul)) {
      throw new Error('no readable screenplay text could be recovered');
    }

    notes.push(
      ext === 'fdr'
        ? 'Legacy Final Draft files store no element markup, so scene headings, cues and dialogue were identified by their shape. Check the first few pages — and if you have Final Draft 8 or later, re-saving as .fdx imports exactly.'
        : `This is not a format Kirukals knows (${describeBytes(bytes, filename)}). The readable text was recovered and typed by shape — check it carefully.`,
    );
    return mined;
  }

  const text = decodeText(bytes);
  if (text.includes('<FinalDraft')) return fromFdx(text);
  if (/^\s*<\?xml|^\s*</.test(text)) {
    try {
      return fromGenericXml(text);
    } catch {
      // Not XML we understand — fall through and read it as plain text.
    }
  }

  // Last stop: treat it as Fountain — but only if it reads like writing. A file
  // that gets this far without looking like prose is an unknown format, and
  // saying so beats importing noise as a screenplay.
  if (!looksLikeProse(text)) {
    throw new Error('no readable screenplay text in this file');
  }
  return fromFountain(text);
}

/** Formats offered in the file picker. */
export const IMPORT_ACCEPT = '.fountain,.spmd,.txt,.fdx,.fdr,.wdz,.wd,.zip,.gz,.celtx,.fadein,.highland,.xml,.json';

/**
 * Read any supported screenplay file.
 * Returns { titlePage, elements, notes } — `notes` carries anything the writer
 * should know about how the import was interpreted.
 */
export async function importScriptFile(file) {
  const notes = [];
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error('That file is empty.');

  try {
    const parsed = await parseBytes(bytes, file.name, notes);
    if (!parsed.elements?.length) throw new Error('no screenplay content found');
    return { ...parsed, notes };
  } catch (err) {
    // Always say what the file actually was. An unknown format is a fact worth
    // reporting, not a shrug — it is what makes the next fix possible.
    let detail = describeBytes(bytes, file.name);
    if (looksLikeZip(bytes)) {
      try {
        const { entries } = await readZip(bytes);
        detail += ` · contains: ${entries.map((e) => e.name).join(', ') || '(nothing)'}`;
      } catch {
        /* the reason it failed is already in err */
      }
    }
    throw new Error(`${err.message} — ${detail}`);
  }
}
