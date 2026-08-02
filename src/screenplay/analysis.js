import { TYPES } from './elements';
import { countLines } from './paginate';
import { checkFormatting } from './tools';
import { sceneBlocks } from './shots';

/**
 * Script analysis.
 *
 * What this is: a measurement of craft and shape — length, scene rhythm, the
 * balance of talk against action, how clearly a lead emerges, how the action
 * is written, and whether the formatting would survive a reader.
 *
 * What this is not: a judgement of whether the film is any good. No arithmetic
 * knows whether a scene lands, whether a character is worth two hours, or
 * whether anyone will finance it. Every number here is a proxy for something a
 * reader notices quickly, and each one names the range it is judged against so
 * you can disagree with it on purpose.
 */

const words = (text) => (String(text).match(/[\p{L}\p{N}'’-]+/gu) || []).length;
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/** Full marks inside [lo, hi]; falling off to nothing by `slack` either side. */
function band(value, lo, hi, slack) {
  if (value >= lo && value <= hi) return 1;
  const miss = value < lo ? lo - value : value - hi;
  return clamp(1 - miss / slack);
}

export const FORMS = {
  feature: { label: 'Feature', lo: 90, hi: 120, slack: 35 },
  short: { label: 'Short film', lo: 5, hi: 40, slack: 20 },
  series: { label: 'Series episode', lo: 22, hi: 60, slack: 20 },
};

/** Guess what is being written, so length is judged against the right ruler. */
export function guessForm(pages) {
  if (pages <= 45) return 'short';
  if (pages <= 70) return 'series';
  return 'feature';
}

export function analyse(doc, stats, formId) {
  const els = doc.elements;
  const pages = stats.pageCount || 1;
  const form = FORMS[formId || guessForm(pages)];
  const scenes = sceneBlocks(els);

  /* ------------------------------ measures ----------------------------- */

  const dialogueWords = els.filter((e) => e.type === 'dialogue').reduce((n, e) => n + words(e.text), 0);
  const actionWords = els.filter((e) => e.type === 'action').reduce((n, e) => n + words(e.text), 0);
  const spoken = dialogueWords + actionWords;
  const dialogueShare = spoken ? dialogueWords / spoken : 0;

  const sceneLengths = scenes.map((s) => s.body.reduce((n, el) => n + countLines(el), 1) / 55);
  const avgScene = sceneLengths.length ? sceneLengths.reduce((a, b) => a + b, 0) / sceneLengths.length : 0;
  const longScenes = sceneLengths.filter((l) => l > 5).length;

  const actionBlocks = els.filter((e) => e.type === 'action' && e.text.trim());
  const longAction = actionBlocks.filter((e) => countLines(e) > 4).length;
  const longActionShare = actionBlocks.length ? longAction / actionBlocks.length : 0;

  const cast = stats.cast || [];
  const totalLines = cast.reduce((n, c) => n + c.lines, 0) || 1;
  const leadShare = cast.length ? cast[0].lines / totalLines : 0;
  const leadGap = cast.length > 1 ? cast[0].lines / Math.max(1, cast[1].lines) : 0;

  const findings = checkFormatting(els);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warns = findings.filter((f) => f.severity === 'warn').length;

  const headings = els.filter((e) => e.type === 'scene_heading' && e.text.trim());
  const withTime = headings.filter((e) => /\s[-–]\s\S/.test(e.text)).length;
  const timeShare = headings.length ? withTime / headings.length : 0;

  // A character should arrive in capitals the first time the action names them.
  const named = new Set(cast.map((c) => c.name));
  let introduced = 0;
  const seen = new Set();
  for (const el of els) {
    if (el.type !== 'action') continue;
    for (const name of named) {
      if (seen.has(name)) continue;
      if (new RegExp(`\\b${name}\\b`).test(el.text)) { seen.add(name); introduced += 1; }
      else if (new RegExp(`\\b${name}\\b`, 'i').test(el.text)) seen.add(name);
    }
  }
  const introShare = named.size ? introduced / named.size : 1;

  /* ------------------------------- scoring ----------------------------- */

  const metrics = [
    {
      id: 'length',
      label: 'Length',
      value: `${pages} pages`,
      target: `${form.lo}–${form.hi} for a ${form.label.toLowerCase()}`,
      points: band(pages, form.lo, form.hi, form.slack),
      weight: 15,
      note:
        pages < form.lo
          ? 'Short for the form. Readers read length as ambition; a thin script reads as a treatment.'
          : pages > form.hi
            ? 'Long for the form. Length is the first thing a reader weighs in their hand, and the first cut a producer asks for.'
            : 'Within the range a reader expects, so nothing is being judged before page one.',
    },
    {
      id: 'scenes',
      label: 'Scene rhythm',
      value: `${scenes.length} scenes, ${avgScene.toFixed(1)} pages average`,
      target: '1.5–3 pages a scene',
      points: band(avgScene, 1.2, 3.2, 2.5),
      weight: 15,
      note:
        longScenes > 0
          ? `${longScenes} scene${longScenes === 1 ? '' : 's'} run past five pages. Long scenes are where readers put a script down — check they earn it.`
          : avgScene < 1.2
            ? 'Very short scenes throughout. Fine for a montage sequence, restless across a whole film.'
            : 'Scenes are the length a reader can hold in their head.',
    },
    {
      id: 'balance',
      label: 'Talk against action',
      value: `${Math.round(dialogueShare * 100)}% dialogue`,
      target: '35–60% dialogue',
      points: band(dialogueShare, 0.35, 0.6, 0.3),
      weight: 10,
      note:
        dialogueShare > 0.6
          ? 'Talk-heavy. Check whether scenes are being explained rather than shown.'
          : dialogueShare < 0.35
            ? 'Action-heavy. Either a deliberately visual film, or description doing work dialogue should do.'
            : 'A working balance between what is seen and what is said.',
    },
    {
      id: 'lead',
      label: 'Whose film it is',
      value: cast.length
        ? `${cast[0].name} has ${Math.round(leadShare * 100)}% of the dialogue`
        : 'nobody speaks yet',
      target: 'a lead with 25–55%, clear of the second',
      points: cast.length
        ? band(leadShare, 0.25, 0.55, 0.25) * (leadGap >= 1.25 ? 1 : 0.7)
        : 0,
      weight: 10,
      note:
        !cast.length
          ? 'No dialogue yet, so there is no protagonist to find.'
          : leadGap < 1.25
            ? 'Two characters speak almost equally. That can be a two-hander by design — or a script without a centre.'
            : leadShare > 0.55
              ? 'The lead dominates. Make sure the others are people rather than prompts.'
              : 'A clear lead, with room around them.',
    },
    {
      id: 'action',
      label: 'How the action reads',
      value: `${Math.round(longActionShare * 100)}% of action blocks over four lines`,
      target: 'under 20%',
      points: band(longActionShare, 0, 0.2, 0.35),
      weight: 15,
      note:
        longActionShare > 0.2
          ? 'Dense description. White space is what makes a script read fast — break the long blocks into beats.'
          : 'Action is written in readable beats.',
    },
    {
      id: 'format',
      label: 'Formatting',
      value: errors || warns ? `${errors} to fix, ${warns} to look at` : 'clean',
      target: 'no errors',
      points: clamp(1 - (errors * 0.12 + warns * 0.04)),
      weight: 15,
      note:
        errors
          ? 'Formatting mistakes tell a reader the writer is new before they read a word. Menu → Tools → Check Formatting lists them.'
          : 'Nothing in the formatting will distract a reader.',
    },
    {
      id: 'slugs',
      label: 'Scene headings',
      value: `${Math.round(timeShare * 100)}% carry a time of day`,
      target: 'nearly all of them',
      points: band(timeShare, 0.85, 1, 0.6),
      weight: 10,
      note:
        timeShare < 0.85
          ? 'Headings without DAY or NIGHT leave the schedule and the look undecided.'
          : 'Headings tell a first assistant director what they need.',
    },
    {
      id: 'intros',
      label: 'Character introductions',
      value: `${introduced} of ${named.size || 0} introduced in capitals`,
      target: 'every speaking character',
      points: named.size ? band(introShare, 0.8, 1, 0.7) : 1,
      weight: 10,
      note:
        introShare < 0.8
          ? 'A character should arrive in CAPITALS the first time the action names them — it is how a reader knows someone has entered the film.'
          : 'Characters arrive the way a reader expects.',
    },
  ];

  const score = Math.round(
    metrics.reduce((n, m) => n + m.points * m.weight, 0) / metrics.reduce((n, m) => n + m.weight, 0) * 100,
  );

  const bands = [
    [85, 'Reads professionally', 'The craft is not what would stop this. Whether it works is now a question about the story, and only readers can answer that.'],
    [70, 'Solid, with rough edges', 'Nothing here would embarrass the script in a submission pile, but the flagged items are the ones a reader notices first.'],
    [50, 'A draft that needs a pass', 'The shape is there and the problems are specific. Work the red items below before anyone reads it.'],
    [0, 'Early', 'Too early to judge by these measures — keep writing, and run this again when the draft is complete.'],
  ];
  const [, verdict, meaning] = bands.find(([floor]) => score >= floor);

  return {
    score,
    verdict,
    meaning,
    form,
    metrics: metrics.map((m) => ({
      ...m,
      pct: Math.round(m.points * 100),
      state: m.points >= 0.8 ? 'good' : m.points >= 0.5 ? 'fair' : 'poor',
    })),
    counts: { pages, scenes: scenes.length, cast: cast.length, words: dialogueWords + actionWords },
  };
}
