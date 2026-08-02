import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Dialogs';
import { TYPES } from '../screenplay/elements';
import {
  castList,
  checkFormatting,
  presentProgressive,
  renameCharacter,
  shortenCandidates,
  wordStats,
} from '../screenplay/tools';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/* --------------------------------- counts -------------------------------- */

export function WordCountDialog({ doc, stats, onClose }) {
  const w = useMemo(() => wordStats(doc.elements), [doc.elements]);
  const rows = [
    ['Words', w.words.toLocaleString()],
    ['— in dialogue', `${w.dialogueWords.toLocaleString()} (${pct(w.dialogueWords, w.words)}%)`],
    ['— in action', `${w.actionWords.toLocaleString()} (${pct(w.actionWords, w.words)}%)`],
    ['Characters', w.characters.toLocaleString()],
    ['Lines on the page', w.lines.toLocaleString()],
    ['Speeches', w.speeches.toLocaleString()],
    ['Scenes', w.scenes.toLocaleString()],
    ['Pages', String(stats.pageCount)],
    ['Screen time', `~${stats.runtime} min`],
  ];
  return (
    <Modal title="Word count" onClose={onClose}>
      <table className="tool-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><th>{k}</th><td>{v}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        One page of correctly formatted screenplay runs about a minute on screen, which is where
        the estimate comes from — not from the word count.
      </p>
    </Modal>
  );
}

/* ------------------------------ rename cast ------------------------------ */

export function RenameCharacterDialog({ doc, onApply, onClose }) {
  const cast = useMemo(() => castList(doc.elements), [doc.elements]);
  const [from, setFrom] = useState(cast[0]?.name || '');
  const [to, setTo] = useState('');
  const [mentions, setMentions] = useState(true);

  const preview = useMemo(() => {
    if (!from || !to.trim()) return null;
    const r = renameCharacter(doc.elements, from, to.trim(), { includeMentions: mentions });
    return { cues: r.cues, mentions: r.mentions };
  }, [doc.elements, from, to, mentions]);

  return (
    <Modal title="Rename character" onClose={onClose}>
      <div className="form">
        <label>
          <span>Character</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {cast.length === 0 && <option value="">No characters yet</option>}
            {cast.map((c) => (
              <option key={c.name} value={c.name}>{c.name} — {c.cues} cues</option>
            ))}
          </select>
        </label>
        <label>
          <span>New name</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="MAYA" />
        </label>
        <label className="form__check">
          <input type="checkbox" checked={mentions} onChange={(e) => setMentions(e.target.checked)} />
          <span>Also rename mentions in action and dialogue</span>
        </label>
      </div>

      {preview && (
        <p className="hint">
          {preview.cues} cue{preview.cues === 1 ? '' : 's'}
          {mentions ? ` and ${preview.mentions} line${preview.mentions === 1 ? '' : 's'} of text` : ''} will change.
          Mentions match whole words only, so renaming ANN leaves ANNOUNCER alone.
        </p>
      )}

      <div className="modal__actions">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button
          className="btn btn--primary"
          disabled={!from || !to.trim()}
          onClick={() => { onApply(from, to.trim(), mentions); onClose(); }}
        >
          Rename
        </button>
      </div>
    </Modal>
  );
}

/* --------------------------- formatting report --------------------------- */

export function FormattingDialog({ doc, onJump, onClose }) {
  const found = useMemo(() => checkFormatting(doc.elements), [doc.elements]);
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...found].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <Modal title="Check formatting" onClose={onClose} wide>
      {found.length === 0 ? (
        <p className="hint">Nothing to fix — the script reads as properly formatted.</p>
      ) : (
        <>
          <p className="hint">
            {found.filter((f) => f.severity === 'error').length} to fix ·{' '}
            {found.filter((f) => f.severity === 'warn').length} worth a look ·{' '}
            {found.filter((f) => f.severity === 'info').length} suggestions
          </p>
          <ul className="tool-list">
            {sorted.map((f, i) => (
              <li key={`${f.id}-${i}`} className={`tool-list__row tool-list__row--${f.severity}`}>
                <button onClick={() => { onJump(f.id); onClose(); }}>
                  <b>{f.message}</b>
                  <span>{f.text.slice(0, 70) || '(empty line)'}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/* --------------------------- present progressive -------------------------- */

export function ProgressiveDialog({ doc, onJump, onFix, onClose }) {
  const hits = useMemo(() => presentProgressive(doc.elements), [doc.elements]);

  return (
    <Modal title="Present progressive" onClose={onClose} wide>
      <p className="hint">
        Action is written in the simple present — “he opens the door”, not “he is opening the
        door”. The second reads slower on the page and takes more room.
      </p>
      {hits.length === 0 ? (
        <p className="hint">None found. The action is already in the simple present.</p>
      ) : (
        <ul className="tool-list">
          {hits.map((h, i) => (
            <li key={`${h.id}-${i}`} className="tool-list__row">
              <button onClick={() => { onJump(h.id); onClose(); }}>
                <b>
                  “{h.phrase}”{h.suggestion ? ` → “${h.suggestion}”` : ''}
                </b>
                <span>{h.text.slice(0, 70)}</span>
              </button>
              {h.suggestion && (
                <button
                  className="linkish"
                  onClick={() => onFix(h.id, h.at, h.phrase, h.suggestion)}
                  title="Replace this phrase"
                >
                  fix
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/* ----------------------------- shorten report ---------------------------- */

export function ShortenDialog({ doc, stats, onJump, onClose }) {
  const [minLines, setMinLines] = useState(3);
  const list = useMemo(() => shortenCandidates(doc.elements, { minLines }), [doc.elements, minLines]);
  const lines = list.reduce((n, c) => n + c.lines, 0);

  return (
    <Modal title="Shorten document" onClose={onClose} wide>
      <p className="hint">
        Where the pages are going. These {list.length} blocks hold {lines} lines — about{' '}
        {(lines / 55).toFixed(1)} pages of the {stats.pageCount}. Nothing is cut for you; this is
        where to look first.
      </p>
      <label className="tool-range">
        <span>Blocks of at least {minLines} lines</span>
        <input
          type="range" min="2" max="8" value={minLines}
          onChange={(e) => setMinLines(Number(e.target.value))}
        />
      </label>
      <ul className="tool-list">
        {list.slice(0, 40).map((c) => (
          <li key={c.id} className="tool-list__row">
            <button onClick={() => { onJump(c.id); onClose(); }}>
              <b>{TYPES[c.type].label} · {c.lines} lines · {c.words} words</b>
              <span>{c.text.slice(0, 80)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/* ---------------------------- writing schedule --------------------------- */

const today = () => new Date().toISOString().slice(0, 10);

export function ScheduleDialog({ schedule, stats, onChange, onClose }) {
  const s = { goal: 3, history: {}, ...(schedule || {}) };
  const done = s.history[today()] || 0;
  const days = Object.entries(s.history).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14);

  return (
    <Modal title="Writing schedule" onClose={onClose}>
      <div className="form">
        <label>
          <span>Pages a day</span>
          <input
            type="number" min="1" max="20" value={s.goal}
            onChange={(e) => onChange({ ...s, goal: Math.max(1, Number(e.target.value) || 1) })}
          />
        </label>
      </div>

      <div className="sched">
        <div className="sched__bar">
          <i style={{ width: `${Math.min(100, pct(done, s.goal))}%` }} />
        </div>
        <p>
          <b>{done}</b> of {s.goal} pages today · the script stands at {stats.pageCount} pages.
        </p>
      </div>

      {days.length > 0 && (
        <ul className="sched__log">
          {days.map(([d, n]) => (
            <li key={d}>
              <span>{d}</span>
              <i className={n >= s.goal ? 'is-met' : ''} style={{ width: `${Math.min(100, pct(n, s.goal))}%` }} />
              <b>{n}</b>
            </li>
          ))}
        </ul>
      )}

      <p className="hint">
        Progress is counted from pages added while the app is open, recorded once a day on this
        device.
      </p>
    </Modal>
  );
}

/* -------------------------------- ReadAloud ------------------------------- */

export function ReadAloudDialog({ doc, onClose }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState([]);
  const [voice, setVoice] = useState('');
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [skipAction, setSkipAction] = useState(false);
  const queue = useRef([]);

  useEffect(() => {
    if (!supported) return undefined;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = () => {
    window.speechSynthesis.cancel();
    const picked = voices.find((v) => v.name === voice);
    // A cue is read as an announcement of who speaks, then the speech itself.
    queue.current = doc.elements
      .filter((el) => el.text.trim() && !(skipAction && (el.type === 'action' || el.type === 'shot')))
      .map((el) => {
        const u = new SpeechSynthesisUtterance(
          el.type === 'character' ? `${el.text}, says` : el.text,
        );
        if (picked) u.voice = picked;
        u.rate = rate;
        // Cues and headings sit a little apart from what follows.
        u.pitch = el.type === 'character' || el.type === 'scene_heading' ? 1.15 : 1;
        return u;
      });
    if (!queue.current.length) return;
    queue.current[queue.current.length - 1].addEventListener('end', () => setSpeaking(false));
    queue.current.forEach((u) => window.speechSynthesis.speak(u));
    setSpeaking(true);
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
  };

  return (
    <Modal title="ReadAloud" onClose={() => { stop(); onClose(); }}>
      {!supported ? (
        <p className="hint">This browser has no speech engine, so there is nothing to read with.</p>
      ) : (
        <>
          <div className="form">
            <label>
              <span>Voice</span>
              <select value={voice} onChange={(e) => setVoice(e.target.value)}>
                <option value="">Default voice</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
            </label>
            <label>
              <span>Speed — {rate.toFixed(1)}×</span>
              <input
                type="range" min="0.6" max="1.8" step="0.1" value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </label>
            <label className="form__check">
              <input type="checkbox" checked={skipAction} onChange={(e) => setSkipAction(e.target.checked)} />
              <span>Dialogue only — skip action and shots</span>
            </label>
          </div>

          <div className="modal__actions">
            {speaking ? (
              <button className="btn" onClick={stop}>Stop</button>
            ) : (
              <button className="btn btn--primary" onClick={speak}>Read the script</button>
            )}
          </div>

          <p className="hint">
            The voices come from your computer, so this works with no internet. Hearing dialogue
            read back is the fastest way to catch a line no one could say.
          </p>
        </>
      )}
    </Modal>
  );
}

/* ----------------------------- line alternates ---------------------------- */

export function AlternatesDialog({ element, onPick, onSave, onDelete, onClose }) {
  const [draft, setDraft] = useState('');
  const alts = element?.alts || [];

  if (!element) {
    return (
      <Modal title="Line alternates" onClose={onClose}>
        <p className="hint">Put the caret on a line first — alternates belong to one line.</p>
      </Modal>
    );
  }

  return (
    <Modal title="Line alternates" onClose={onClose}>
      <p className="hint">
        Keep every version of a line instead of choosing early. Swapping puts the current line
        into the list, so nothing is ever lost.
      </p>

      <div className="alt-current">
        <span>On the page</span>
        <p>{element.text || '(empty line)'}</p>
      </div>

      <ul className="tool-list">
        {alts.length === 0 && <li className="menupanel__empty">No alternates for this line yet.</li>}
        {alts.map((text, i) => (
          <li key={`${i}-${text}`} className="tool-list__row">
            <button onClick={() => onPick(i)} title="Swap this onto the page">
              <span>{text || '(empty)'}</span>
            </button>
            <button className="linkish" onClick={() => onDelete(i)} title="Delete this alternate">✕</button>
          </li>
        ))}
      </ul>

      <div className="form">
        <label>
          <span>Add an alternate</span>
          <textarea
            rows={2}
            value={draft}
            placeholder="Another way to say it…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (draft.trim()) { onSave(draft.trim()); setDraft(''); }
              }
            }}
          />
        </label>
      </div>
      <div className="modal__actions">
        <button className="btn" onClick={() => { onSave(element.text); }} title="Keep the current line as an alternate">
          Stash the current line
        </button>
        <button
          className="btn btn--primary"
          disabled={!draft.trim()}
          onClick={() => { onSave(draft.trim()); setDraft(''); }}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}

/* --------------------------------- tagger -------------------------------- */

export const TAG_CATEGORIES = ['Cast', 'Prop', 'Location', 'Wardrobe', 'Vehicle', 'SFX', 'Sound', 'Note'];

export function TaggerDialog({ element, onTag, onUntag, onClose }) {
  const [cat, setCat] = useState('Prop');
  const [label, setLabel] = useState('');
  const tags = element?.tags || [];

  if (!element) {
    return (
      <Modal title="Tagger" onClose={onClose}>
        <p className="hint">Put the caret on a line first — tags belong to one line.</p>
      </Modal>
    );
  }

  const add = () => {
    if (!label.trim()) return;
    onTag({ cat, label: label.trim() });
    setLabel('');
  };

  return (
    <Modal title="Tagger" onClose={onClose}>
      <p className="hint">
        Tag what a scene needs — a prop, a vehicle, a costume — and the Analysis panel adds it up
        into a breakdown the production office can work from.
      </p>

      <div className="alt-current">
        <span>{TYPES[element.type].label}</span>
        <p>{element.text || '(empty line)'}</p>
      </div>

      {tags.length > 0 && (
        <ul className="tag-chips">
          {tags.map((t, i) => (
            <li key={`${t.cat}-${t.label}-${i}`}>
              <span className={`tag tag--${t.cat.toLowerCase()}`}>{t.cat}</span>
              {t.label}
              <button className="linkish" onClick={() => onUntag(i)} aria-label="Remove tag">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="form">
        <label>
          <span>Category</span>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            {TAG_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span>What is it</span>
          <input
            value={label}
            placeholder="Red umbrella"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
        </label>
      </div>
      <div className="modal__actions">
        <button className="btn btn--primary" disabled={!label.trim()} onClick={add}>Add tag</button>
      </div>
    </Modal>
  );
}
