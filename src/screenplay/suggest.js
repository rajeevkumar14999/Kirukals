const SETTINGS = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '];
const TIMES = ['DAY', 'NIGHT', 'MORNING', 'AFTERNOON', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS', 'LATER', 'MOMENTS LATER'];
const TRANSITIONS = ['CUT TO:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'FADE TO:', 'FADE OUT.', 'FADE IN:', 'INTERCUT WITH:'];
const PARENTHETICALS = ['(beat)', '(cont’d)', '(V.O.)', '(O.S.)', '(to himself)', '(to herself)', '(whispering)', '(sotto)', '(into phone)'];
const CUE_EXTENSIONS = ['(V.O.)', '(O.S.)', '(CONT’D)'];
const SHOTS = ['CLOSE ON', 'ANGLE ON', 'INSERT', 'POV', 'WIDE ON', 'SERIES OF SHOTS'];

const startsWith = (a, b) => a.toUpperCase().startsWith(b.toUpperCase());
const uniq = (arr) => [...new Set(arr)];

/**
 * Context-aware completions for the element being typed.
 * Each item is { label, value } where `value` becomes the element's full text.
 */
export function suggestFor(element, vocab) {
  const text = element.text || '';
  const t = text.trimStart();
  const limit = (items) => items.slice(0, 8);

  // Nothing typed yet: stay quiet so Enter still means "new element" rather
  // than "accept the first guess".
  if (!t) return [];

  if (element.type === 'character') {
    // "MAYA (" -> offer the cue extensions rather than other names.
    const openParen = t.match(/^(.*?)\s*\($/);
    if (openParen) {
      const base = openParen[1].toUpperCase();
      return limit(CUE_EXTENSIONS.map((x) => ({ label: `${base} ${x}`, value: `${base} ${x}` })));
    }
    const names = uniq(vocab.names);
    const matches = t ? names.filter((n) => startsWith(n, t) && n.toUpperCase() !== t.toUpperCase()) : names;
    return limit(matches.map((n) => ({ label: n, value: n })));
  }

  if (element.type === 'scene_heading') {
    const m = t.toUpperCase().match(/^(INT\.\/EXT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*(.*)$/);
    if (!m) {
      return limit(
        SETTINGS.filter((s) => !t || startsWith(s, t)).map((s) => ({ label: s.trim(), value: s })),
      );
    }
    const [, setting, rest] = m;
    const dash = rest.lastIndexOf(' - ');
    if (dash === -1) {
      const partial = rest.trim();
      const locations = uniq(vocab.locations).filter(
        (l) => (!partial || startsWith(l, partial)) && l.toUpperCase() !== partial.toUpperCase(),
      );
      const out = locations.map((l) => ({ label: l, value: `${setting} ${l}` }));
      // Once a location is typed, offer to append the time of day.
      if (partial) {
        out.push(...TIMES.slice(0, 3).map((tm) => ({
          label: `${partial} - ${tm}`,
          value: `${setting} ${partial} - ${tm}`,
        })));
      }
      return limit(out);
    }
    const head = rest.slice(0, dash).trim();
    const partial = rest.slice(dash + 3).trim();
    const times = uniq([...vocab.times, ...TIMES]).filter(
      (x) => (!partial || startsWith(x, partial)) && x.toUpperCase() !== partial.toUpperCase(),
    );
    return limit(times.map((x) => ({ label: x, value: `${setting} ${head} - ${x}` })));
  }

  if (element.type === 'transition') {
    return limit(
      TRANSITIONS.filter((x) => !t || (startsWith(x, t) && x.toUpperCase() !== t.toUpperCase()))
        .map((x) => ({ label: x, value: x })),
    );
  }

  if (element.type === 'parenthetical') {
    return limit(
      PARENTHETICALS.filter((x) => !t || startsWith(x.replace('(', ''), t.replace('(', '')))
        .filter((x) => x.toUpperCase() !== t.toUpperCase())
        .map((x) => ({ label: x, value: x })),
    );
  }

  if (element.type === 'shot') {
    return limit(
      SHOTS.filter((x) => !t || (startsWith(x, t) && x.toUpperCase() !== t.toUpperCase()))
        .map((x) => ({ label: x, value: x })),
    );
  }

  return [];
}
