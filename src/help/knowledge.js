/**
 * What the helpdesk knows.
 *
 * This is a retrieval assistant, not a language model: it holds what the app
 * can actually do and finds the closest answer to a question. That choice is
 * deliberate. A model in the browser needs an API key, and a key shipped in a
 * client is a key anybody can take and spend. Everything here works offline,
 * costs nothing to run, and cannot invent a feature that does not exist.
 *
 * When the server arrives, `answer()` can fall back to a model for questions
 * that score badly here — the shape of the reply is already the same.
 */

export const TOPICS = [
  /* ------------------------------ writing ------------------------------ */
  {
    id: 'elements',
    q: 'How do I change a line to dialogue or action?',
    keywords: ['element', 'type', 'dialogue', 'action', 'character', 'scene heading', 'slug', 'parenthetical', 'transition', 'format'],
    a: 'Every line has a type, and the type decides its indent and case.\n\nPress **Tab** to move to the next type, **Enter** at the end of a line to advance the way a script does (a character cue is followed by dialogue), or pick from the dropdown in the top bar.',
    keys: ['Ctrl+1 Scene heading', 'Ctrl+2 Action', 'Ctrl+3 Character', 'Ctrl+4 Parenthetical', 'Ctrl+5 Dialogue', 'Ctrl+6 Transition'],
  },
  {
    id: 'emphasis',
    q: 'How do I make text bold or italic?',
    keywords: ['bold', 'italic', 'underline', 'emphasis', 'style', 'format text'],
    a: 'Select the words and press the shortcut. The emphasis is stored as a range over the text, so no asterisks or markers ever appear on the page — they only appear in a Fountain export, where they are part of the format.',
    keys: ['Ctrl+B bold', 'Ctrl+I italic', 'Ctrl+U underline'],
  },
  {
    id: 'shortcuts',
    q: 'What are the keyboard shortcuts?',
    keywords: ['shortcut', 'keyboard', 'keys', 'hotkey'],
    a: 'Menu → Keyboard shortcuts lists them all. The ones worth learning first are below.',
    keys: ['Tab next element type', 'Ctrl+B / I / U emphasis', 'Ctrl+F find and replace', 'Ctrl+Alt+M comment', 'Ctrl+Alt+K pin a line', 'Ctrl+Shift+K delete a line', 'Ctrl+P print or PDF', 'Alt+/ open the menu'],
  },
  {
    id: 'find',
    q: 'How do I find and replace something?',
    keywords: ['find', 'search', 'replace', 'rename word'],
    a: 'Menu → Edit → Find & replace, or press Ctrl+F. To rename a character everywhere instead, use Menu → Tools → Rename Character — it changes the cues and the mentions, matching whole words only, so renaming ANN leaves ANNOUNCER alone.',
    keys: ['Ctrl+F'],
  },

  /* ------------------------------ comments ----------------------------- */
  {
    id: 'comment',
    q: 'How do I add a comment?',
    keywords: ['comment', 'note', 'annotate', 'feedback', 'remark'],
    a: 'Put the caret on the line and press **Ctrl+Alt+M**, or click the small speech bubble that appears in the left margin.\n\nType and press Enter to post. A commented line keeps a blue band behind it, and its margin bubble shows how many notes it has. The Comments panel in the dock lists every comment in the script — click one to jump to its line.\n\nComments never appear in print, PDF, Fountain or Final Draft exports.',
    keys: ['Ctrl+Alt+M'],
    where: 'Dock → Comments',
  },
  {
    id: 'alternates',
    q: 'How do I keep two versions of a line?',
    keywords: ['alternate', 'version', 'variation', 'two versions', 'try line'],
    a: 'Menu → Line Alternates, or Ctrl+Alt+A. Stash the current line, write another, and swap between them — swapping puts the line on the page back into the list, so no version is ever lost.',
    keys: ['Ctrl+Alt+A'],
  },
  {
    id: 'graveyard',
    q: 'I deleted a line — can I get it back?',
    keywords: ['deleted', 'undo', 'restore', 'graveyard', 'recover', 'lost line'],
    a: 'Yes. **Ctrl+Z** undoes recent edits. Anything deleted with **Ctrl+Shift+K** also goes to the Graveyard in the Project panel, where one click puts it back at the end of the script.',
    keys: ['Ctrl+Z undo', 'Ctrl+Shift+K delete a line'],
    where: 'Dock → Project → Graveyard',
  },

  /* ------------------------------- export ------------------------------ */
  {
    id: 'pdf',
    q: 'How do I export a PDF?',
    keywords: ['pdf', 'export', 'print', 'save as pdf', 'share script'],
    a: 'Menu → Print / Save as PDF, or Ctrl+P. In the print dialog choose **Save as PDF**, set **Margins: None** and turn **Headers and footers off** — otherwise the browser stamps its own date and URL over your title page.\n\nThe PDF is built as real numbered sheets, so it comes out page for page identical to the editor.',
    keys: ['Ctrl+P'],
  },
  {
    id: 'formats',
    q: 'Can I export to Final Draft or Fountain?',
    keywords: ['fdx', 'final draft', 'fountain', 'export format', 'celtx', 'txt', 'backup json'],
    a: 'Project panel → Export offers Final Draft (.fdx), Fountain (.fountain), plain text and a full backup (.json).\n\nUse .fdx for a production office, Fountain as the safest archive, and .json when you want everything — comments, tags, preproduction and all — since only Kirukals reads that one.',
    where: 'Dock → Project → Export',
  },
  {
    id: 'import',
    q: 'How do I open a script from another app?',
    keywords: ['import', 'open fdx', 'wdz', 'fdr', 'celtx', 'existing script', 'load'],
    a: 'Project panel → Import. It reads .fdx, .fdr, .fountain, .txt and zipped bundles such as .wdz, keeping element types and emphasis.',
    where: 'Dock → Project → Import',
  },
  {
    id: 'watermark',
    q: 'How do I put a watermark on my script?',
    keywords: ['watermark', 'confidential', 'stamp', 'draft copy', 'leak'],
    a: 'Menu → Watermark. Turn it on, type the text — a reader\'s name, or DRAFT — NOT FOR CIRCULATION — and set the strength.\n\nIt belongs to that script, so it travels with the file, and it prints on every page including the title page.',
  },

  /* ---------------------------- preproduction -------------------------- */
  {
    id: 'preproduction',
    q: 'What is the Preproduction tab?',
    keywords: ['preproduction', 'production', 'preprod', 'sheets', '499'],
    a: 'Six sheets that read from your script: **Locations**, **Actors**, **Shot division**, **Shoot plan**, **Budget** and **Pitch deck**.\n\nYou can open and read all of them for free. Editing, uploading and exporting them is the Production plan at ₹499 a month.',
    where: 'Dock → Preprod',
  },
  {
    id: 'locations',
    q: 'How do the location sheets work?',
    keywords: ['location', 'scout', 'map', 'google maps', 'address', 'recce'],
    a: 'Every scene heading becomes a row automatically. Expand one and add places as options A, B, C — each with an address, a Google Maps link and notes. Press Choose when you settle on one.\n\nINT. and EXT. of the same place count as one location, because you scout it once.',
    where: 'Dock → Preprod → Locations',
  },
  {
    id: 'casting',
    q: 'How do I add actors and portfolios?',
    keywords: ['actor', 'cast', 'casting', 'portfolio', 'headshot', 'audition'],
    a: 'Every speaking role becomes a row. Expand one, add actors as options, and upload a portfolio photograph for each. Press Choose to cast the part.\n\nPhotographs are scaled down before they are stored, because everything lives in this browser alongside the script.',
    where: 'Dock → Preprod → Actors',
  },
  {
    id: 'shots',
    q: 'How does shot division work?',
    keywords: ['shot', 'shot list', 'coverage', 'storyboard', 'camera', 'divide'],
    a: '**Divide this scene** proposes the coverage a crew would ordinarily shoot: an establisher, a setup for each beat of action, and singles that alternate through the dialogue with a two-shot the first time a pair speak.\n\nEvery line is then yours to change — size, angle, movement, lens, seconds — and you can upload a reference frame for each shot. Export gives you a landscape PDF with the frames printed beside each row.',
    where: 'Dock → Preprod → Shot division',
  },
  {
    id: 'shootplan',
    q: 'How do I plan a shooting day?',
    keywords: ['shoot plan', 'call sheet', 'day', 'schedule', 'plan a', 'plan b', 'shooting day'],
    a: 'Add a day and tick the scenes. The artists called, the locations, the page count in eighths and the shot count all follow from that selection.\n\nEvery day carries **Plan A and Plan B** — B is your cover for rain or a lost location. The call sheet PDF prints both, with B greyed so nobody mistakes it for the day\'s work.',
    where: 'Dock → Preprod → Shoot plan',
  },
  {
    id: 'budget',
    q: 'How do I budget the film?',
    keywords: ['budget', 'budgeting', 'estimate', 'expense', 'top sheet', 'contingency', 'line items', 'shooting days'],
    a: '**Draft from the script** writes the lines for you — one per speaking role, one per location, plus crew, camera, art, travel, catering and post — with shooting days worked out at four pages a day.\n\nRates start at zero because only you know what things cost where you shoot. Estimate and actual sit on the same row, so the gap is never a second document.',
    where: 'Dock → Preprod → Budget',
  },
  {
    id: 'deck',
    q: 'How do I make a pitch deck?',
    keywords: ['pitch', 'deck', 'investor', 'presentation', 'logline', 'synopsis', 'pitch deck'],
    a: 'Half the deck writes itself: the title page, the characters with whoever you cast, the locations you scouted and the budget total.\n\nYou write the logline, synopsis, tone, director\'s note and the ask. Slides with nothing in them are left out rather than shown blank. **Present** goes full screen; **Export deck** gives one slide per landscape page in either the cinematic or editorial theme.',
    where: 'Dock → Preprod → Pitch deck',
  },

  /* ------------------------------ the app ------------------------------ */
  {
    id: 'download',
    q: 'How do I install it on my computer?',
    keywords: ['download', 'exe', 'installer', 'setup', 'install', 'desktop app', 'windows'],
    a: 'Menu → **Download for Windows**, or Project → Download for Windows. It is an ordinary installer: it makes a desktop shortcut and a Start-menu entry, and the app then runs in its own window with no internet needed.\n\nWindows will warn you once, because the installer is not code-signed yet — choose **More info → Run anyway**. And back up your scripts first: the desktop app keeps its own, so what you wrote in the browser will not appear there by itself.',
    where: 'Menu → Download for Windows',
  },
  {
    id: 'offline',
    q: 'Does it work offline?',
    keywords: ['offline', 'internet', 'install', 'desktop', 'app', 'pwa', 'no connection'],
    a: 'Yes. Everything except Google sign-in and opening a map works with no connection at all.\n\nTo install it as a desktop app, use the browser menu → **Apps → Install this site as an app**. It then opens in its own window and keeps working on a train.',
  },
  {
    id: 'update',
    q: 'Why do I not see the newest version?',
    keywords: ['update', 'reload', 'new version', 'old version', 'stale', 'not changing'],
    a: 'An installed app serves itself from a cache, so a new build appears only when the app notices it. When it does, a bar appears at the top with a **Reload** button.\n\nIf you dismiss it, the update stays available at the top of the Menu. Menu also shows which build you are running, in the top-right corner.',
  },
  {
    id: 'backup',
    q: 'Where are my scripts saved? Can I back them up?',
    keywords: ['save', 'saved', 'backup', 'storage', 'lost', 'where stored', 'external'],
    a: 'In this browser\'s storage, on this computer — no cloud yet. Clearing your browsing data would take the scripts with it.\n\nSo: **Project → Set External Backups** points the app at a real folder and writes a .json copy of each script every time it saves. The panel says plainly whether a copy has been written this session.',
    where: 'Dock → Project → Set External Backups',
  },
  {
    id: 'storagefull',
    q: 'It says storage is full.',
    keywords: ['storage full', 'quota', 'cannot save', 'full', 'error saving'],
    a: 'The browser gives a site a few megabytes and then refuses. Nothing was lost — the last saved copy is intact.\n\nRemove some uploaded photographs (portfolios, shot references, deck images take the most room), or back up a finished script and delete it from the Portfolio.',
  },
  {
    id: 'plans',
    q: 'What does it cost?',
    keywords: ['price', 'pricing', 'cost', 'costs', 'how much', 'much', 'charge', 'fee', 'money', 'pay', 'payment', 'upi', 'subscription', 'subscribe', 'plan', '99', '499', 'upgrade'],
    a: '**Kirukals Pro — ₹99 a month** for the writing: unlimited scripts and every export format.\n\n**Kirukals Production — ₹499 a month** for the preproduction sheets: locations, casting, shot division, shoot plans, budget and pitch deck.\n\nPay by UPI in your profile. An admin confirms the payment against the bank record, and the plan starts then.',
    where: 'Profile → Membership',
  },
  {
    id: 'trial',
    q: 'How long is the free trial?',
    keywords: ['trial', 'free', 'ten minutes', 'guest', 'expired'],
    a: 'Ten minutes of writing per account, counted only while the tab is open. A guest session also gets ten minutes, but its drafts are erased when the time is up — create an account if you want to keep what you write.',
  },
  {
    id: 'community',
    q: 'What is the community board?',
    keywords: ['community', 'board', 'requirement', 'hire', 'writer', 'post', 'chat'],
    a: 'Profile → Community. Post a requirement with an enquiry sheet, and anyone interested answers your questions and can message you about it.\n\nBe aware: with no server yet, the board only reaches accounts on this same computer.',
    where: 'Profile → Community',
  },
];

/* ------------------------------ the search ------------------------------ */

const STOP = new Set(['how', 'do', 'i', 'the', 'a', 'an', 'to', 'in', 'is', 'it', 'my', 'can', 'of', 'and', 'for', 'on', 'what', 'where', 'this', 'that', 'you', 'me', 'with', 'from', 'does']);

const tokens = (text) =>
  String(text)
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/** Cheap stemming so "commenting" finds "comment" and "exports" finds "export". */
const stem = (w) => w.replace(/(ing|ed|es|s)$/, '');

function score(topic, query) {
  const words = tokens(query).map(stem);
  if (!words.length) return 0;
  const hay = [topic.q, topic.keywords.join(' '), topic.a].join(' ').toLowerCase();
  const keys = topic.keywords.map((k) => k.toLowerCase());

  let hits = 0;
  for (const word of words) {
    // Naming a keyword outright beats containing it, which beats the word
    // merely appearing somewhere in the prose. Without that ordering, "how
    // much does it cost" lands on the budget sheet rather than the price.
    if (keys.some((k) => stem(k) === word)) hits += 4;
    else if (keys.some((k) => k.includes(word))) hits += 2;
    else if (hay.includes(word)) hits += 1;
  }
  // A phrase in the question is a strong signal — "how much", "plan b".
  const asked = String(query).toLowerCase();
  for (const k of keys) if (k.includes(' ') && asked.includes(k)) hits += 4;

  return hits / (words.length * 4);
}

/**
 * Answer a question, or admit that it cannot.
 *
 * Returning "I do not know, but here is what I do know about" is a better
 * answer than a confident wrong one, so the threshold is deliberately high.
 */
export function answer(query) {
  const ranked = TOPICS.map((topic) => ({ topic, s: score(topic, query) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s);

  const best = ranked[0];
  const related = ranked.slice(1, 4).map((r) => r.topic);

  if (!best || best.s < 0.34) {
    return {
      found: false,
      text:
        'I could not match that to something I know for certain, and I would rather say so than guess.\n\nTry one of these, or ask about a part of the app by name — comments, export, shot division, budget, backups.',
      related: related.length ? related : TOPICS.slice(0, 4),
    };
  }

  return { found: true, topic: best.topic, text: best.topic.a, related };
}

export const suggestions = () => [
  TOPICS.find((t) => t.id === 'comment'),
  TOPICS.find((t) => t.id === 'pdf'),
  TOPICS.find((t) => t.id === 'shots'),
  TOPICS.find((t) => t.id === 'backup'),
];
