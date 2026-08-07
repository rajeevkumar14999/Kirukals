import { useEffect, useMemo, useState } from 'react';
import TrashIcon from './TrashIcon';
import Attachment from './Attachment';
import { SLIDES, buildSlides, emptyDeck, printDeck } from '../screenplay/deck';
import { readImageFile } from '../screenplay/preproduction';
import '../styles/deck.css';

const FIELDS = [
  ['tagline', 'Tagline', 'One line under the title', 'input'],
  ['logline', 'Logline', 'A sentence: who wants what, and what stands in the way.', 'area'],
  ['synopsis', 'Synopsis', 'The story, ending included. A room reads this to know if the film works.', 'area'],
  ['genre', 'Genre', 'Family drama, thriller…', 'input'],
  ['tone', 'Tone', 'Warm, wry, unsentimental…', 'input'],
  ['language', 'Language', 'Tamil with English subtitles', 'input'],
  ['audience', 'Audience', 'Who buys a ticket', 'input'],
  ['comparables', 'In the vein of', 'Two or three films it sits beside', 'input'],
  ['directorNote', "Director's note", 'Why you, why this, why now.', 'area'],
  ['team', 'Team', 'Director, producer, cinematographer — one line each.', 'area'],
  ['ask', 'The ask', 'What you want from the room, and what they get.', 'area'],
  ['contact', 'Contact', 'Name, phone, email', 'area'],
];

/**
 * The pitch deck: an editor on the left of what only you can write, and the
 * finished slides on the right, assembled live from the script, the casting,
 * the locations and the budget.
 */
export default function DeckSheet({ doc, stats, board, onChange, onNotice }) {
  const [presenting, setPresenting] = useState(false);
  const [at, setAt] = useState(0);

  const deck = { ...emptyDeck(), ...(board.deck || {}) };
  const slides = useMemo(() => buildSlides(doc, stats, board), [doc, stats, board]);
  const theme = deck.theme || 'dark';
  const film = doc.titlePage?.title || doc.name || 'Untitled';

  const write = (patch) => onChange({ ...board, deck: { ...deck, ...patch } });
  const toggle = (id) => write({ hidden: { ...deck.hidden, [id]: !deck.hidden?.[id] } });

  const attach = async (file, what) => {
    try {
      const image = await readImageFile(file, { maxEdge: what === 'cover' ? 1400 : 900, quality: 0.7 });
      if (what === 'cover') write({ cover: image });
      else write({ look: [...(deck.look || []), image].slice(0, 9) });
    } catch (e) {
      onNotice?.({ kind: 'warn', text: e.message });
    }
  };

  // Presenting is a mode, not a page: arrows move, Escape leaves.
  useEffect(() => {
    if (!presenting) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setPresenting(false);
      if (e.key === 'ArrowRight' || e.key === ' ') setAt((n) => Math.min(n + 1, slides.length - 1));
      if (e.key === 'ArrowLeft') setAt((n) => Math.max(n - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting, slides.length]);

  if (presenting && slides.length) {
    const slide = slides[Math.min(at, slides.length - 1)];
    return (
      <div className="deck-present" onClick={() => setAt((n) => Math.min(n + 1, slides.length - 1))}>
        <Slide slide={slide} theme={theme} film={film} index={at} count={slides.length} big />
        <footer>
          <button className="btn" onClick={(e) => { e.stopPropagation(); setPresenting(false); }}>
            Leave (Esc)
          </button>
          <span>{at + 1} / {slides.length}</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Pitch deck</h1>
          <p>
            {slides.length} slides · the title, cast, locations and budget are assembled from the
            rest of the app and stay true as the script changes.
          </p>
        </div>
        <div className="pp__acts">
          <div className="deck-theme" role="group" aria-label="Deck theme">
            <button
              className={`btn${theme === 'dark' ? ' is-on' : ''}`}
              onClick={() => write({ theme: 'dark' })}
              title="Dark, for a projector"
            >
              Cinematic
            </button>
            <button
              className={`btn${theme === 'light' ? ' is-on' : ''}`}
              onClick={() => write({ theme: 'light' })}
              title="Light, for paper and email"
            >
              Editorial
            </button>
          </div>
          <button className="btn" disabled={!slides.length} onClick={() => { setAt(0); setPresenting(true); }}>
            Present
          </button>
          <button
            className="btn btn--primary"
            disabled={!slides.length}
            onClick={() => printDeck(doc, stats, board)}
          >
            Export deck (PDF)
          </button>
        </div>
      </header>

      <div className="deck">
        <section className="deck-form">
          <h3 className="sidebar__sub sidebar__sub--first">What only you can write</h3>

          <label className="deck-cover">
            <span>Cover image</span>
            {deck.cover ? (
              <Attachment of={deck.cover} alt="Cover" />
            ) : (
              <em>Upload a still or a reference frame</em>
            )}
            <input
              type="file" accept="image/*" hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) attach(file, 'cover');
                e.target.value = '';
              }}
            />
          </label>
          {deck.cover && (
            <button className="linkish" onClick={() => write({ cover: null })}>remove cover</button>
          )}

          {FIELDS.map(([key, label, hint, kind]) => (
            <label key={key} className="deck-field">
              <span>{label}</span>
              {kind === 'area' ? (
                <textarea
                  rows={key === 'synopsis' ? 6 : 3}
                  value={deck[key] || ''}
                  placeholder={hint}
                  onChange={(e) => write({ [key]: e.target.value })}
                />
              ) : (
                <input
                  value={deck[key] || ''}
                  placeholder={hint}
                  onChange={(e) => write({ [key]: e.target.value })}
                />
              )}
            </label>
          ))}

          <h3 className="sidebar__sub">Look & references</h3>
          <div className="deck-look">
            {(deck.look || []).map((im, i) => (
              <figure key={`${im.name}-${i}`}>
                <Attachment of={im} />
                <button
                  className="linkish"
                  title="Remove"
                  onClick={() => write({ look: deck.look.filter((_, n) => n !== i) })}
                >
                  <TrashIcon />
                </button>
              </figure>
            ))}
            {(deck.look || []).length < 9 && (
              <label className="deck-look__add">
                ＋
                <input
                  type="file" accept="image/*" hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) attach(file, 'look');
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          <h3 className="sidebar__sub">Slides</h3>
          <ul className="deck-toggles">
            {SLIDES.map((s) => (
              <li key={s.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!deck.hidden?.[s.id]}
                    onChange={() => toggle(s.id)}
                  />
                  {s.label}
                </label>
              </li>
            ))}
          </ul>
          <p className="pp-empty">
            A slide with nothing in it is left out rather than shown empty — eight true slides beat
            twelve with two that say nothing.
          </p>
        </section>

        <section className="deck-preview">
          {slides.length === 0 && (
            <p className="pp-empty">Write a logline and the deck starts to exist.</p>
          )}
          {slides.map((slide, i) => (
            <figure className="deck-thumb" key={`${slide.id}-${i}`}>
              <Slide slide={slide} theme={theme} film={film} index={i} count={slides.length} />
              <figcaption>{i + 1}. {slide.label || slide.title}</figcaption>
            </figure>
          ))}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------- one slide -------------------------------- */

function Slide({ slide, theme = 'dark', film, index = 0, count = 0, big }) {
  const cls = `slide slide--${theme}${big ? ' slide--big' : ''}${slide.kind === 'images' ? ' slide--images' : ''}`;

  if (slide.kind === 'title') {
    return (
      <div
        className={`${cls} slide--title`}
        style={slide.image ? { backgroundImage: `url(${slide.image})` } : undefined}
      >
        <div className="slide__veil">
          <p className="slide__eyebrow">{slide.eyebrow || 'A feature film'}</p>
          <h2>{slide.title}</h2>
          {slide.tagline && <p className="slide__tagline">{slide.tagline}</p>}
          {slide.byline && <p className="slide__byline">{slide.byline}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={cls}>
      <span className="slide__label">{slide.label}</span>

      {slide.kind === 'statement' && (
        <>
          <blockquote>{slide.body}</blockquote>
          {slide.footer && <p className="slide__footer">{slide.footer}</p>}
        </>
      )}

      {slide.kind === 'prose' && (
        <div className="slide__prose">
          {String(slide.body).split(/\n{2,}/).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      )}

      {slide.kind === 'facts' && (
        <dl className="slide__facts">
          {slide.rows.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}

      {slide.kind === 'people' && (
        <ul className="slide__people">
          {slide.people.map((p) => (
            <li key={p.name}>
              {p.image ? <img src={p.image} alt="" /> : <span className="slide__ph" />}
              <b>{p.name}</b>
              {p.actor && <i>{p.actor}</i>}
              <em>{p.meta}</em>
            </li>
          ))}
        </ul>
      )}

      {slide.kind === 'places' && (
        <ul className="slide__places">
          {slide.places.map((p) => (
            <li key={p.name}>
              <b>{p.name}</b>
              <em>{p.meta}</em>
              {p.found && <i>{p.found}</i>}
            </li>
          ))}
        </ul>
      )}

      {slide.kind === 'images' && (
        <div className="slide__grid">
          {slide.images.map((im, i) => <Attachment key={i} of={im} />)}
        </div>
      )}

      {/* The film's name and where you are in the deck, on every slide but
          the first — a room needs to know both without asking. */}
      <div className="slide__foot">
        <span>{film}</span>
        <span>{index + 1}{count ? ` / ${count}` : ''}</span>
      </div>
    </div>
  );
}
