import { useEffect, useRef, useState } from 'react';
import { TOPICS, answer, suggestions } from '../help/knowledge';
import '../styles/help.css';

const greeting = {
  from: 'help',
  text:
    'Ask me how something works — commenting, exports, shot division, backups — and I will tell you where it is and which keys do it.',
};

/** Bold the **marked** words and keep paragraph breaks. */
function Rich({ text }) {
  return text.split('\n\n').map((para, i) => (
    <p key={i}>
      {para.split(/(\*\*[^*]+\*\*)/g).map((bit, j) =>
        bit.startsWith('**') && bit.endsWith('**') ? <b key={j}>{bit.slice(2, -2)}</b> : bit,
      )}
    </p>
  ));
}

/**
 * The helpdesk.
 *
 * It answers from a written record of what this app does rather than from a
 * language model: no key to leak, no bill to run up, nothing invented, and it
 * works on a train. When it cannot match a question it says so and offers what
 * it does know, which is the honest failure mode.
 */
export default function HelpDesk() {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState([greeting]);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const ask = (question) => {
    const q = question.trim();
    if (!q) return;
    const reply = answer(q);
    setThread((t) => [...t, { from: 'you', text: q }, { from: 'help', ...reply }]);
    setDraft('');
  };

  return (
    <>
      <button
        className={`helpdesk__button${open ? ' is-open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close help' : 'Help'}
        title={open ? 'Close help' : 'Help'}
      >
        {open ? (
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
            <rect x="2.5" y="13" width="4.5" height="7" rx="2" />
            <rect x="17" y="13" width="4.5" height="7" rx="2" />
            <path d="M19 20v.5a2.5 2.5 0 0 1-2.5 2.5H13" />
          </svg>
        )}
      </button>

      {open && (
        <section className="helpdesk" role="dialog" aria-label="Help">
          <header>
            <div>
              <b>Help</b>
              <span>Answers about Kirukals · works offline</span>
            </div>
            <button className="helpdesk__close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </header>

          <div className="helpdesk__thread">
            {thread.map((msg, i) => (
              <article key={i} className={`helpdesk__msg helpdesk__msg--${msg.from}`}>
                <Rich text={msg.text} />

                {msg.topic?.keys && (
                  <ul className="helpdesk__keys">
                    {msg.topic.keys.map((k) => <li key={k}><kbd>{k.split(' ')[0]}</kbd>{k.slice(k.split(' ')[0].length)}</li>)}
                  </ul>
                )}

                {msg.topic?.where && <p className="helpdesk__where">{msg.topic.where}</p>}

                {msg.related?.length > 0 && (
                  <div className="helpdesk__chips">
                    {msg.related.map((t) => (
                      <button key={t.id} onClick={() => ask(t.q)}>{t.q}</button>
                    ))}
                  </div>
                )}
              </article>
            ))}

            {thread.length === 1 && (
              <div className="helpdesk__chips helpdesk__chips--start">
                {suggestions().filter(Boolean).map((t) => (
                  <button key={t.id} onClick={() => ask(t.q)}>{t.q}</button>
                ))}
              </div>
            )}

            {showAll && (
              <div className="helpdesk__all">
                <b>Everything I know about</b>
                {TOPICS.map((t) => (
                  <button key={t.id} onClick={() => { ask(t.q); setShowAll(false); }}>{t.q}</button>
                ))}
              </div>
            )}

            <div ref={endRef} />
          </div>

          <footer>
            <input
              ref={inputRef}
              value={draft}
              placeholder="How do I…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); ask(draft); }
                e.stopPropagation();
              }}
            />
            <button className="btn btn--primary" onClick={() => ask(draft)} disabled={!draft.trim()}>
              Ask
            </button>
          </footer>

          <button className="helpdesk__all-toggle" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Hide the list' : 'Show everything it can answer'}
          </button>
        </section>
      )}
    </>
  );
}
