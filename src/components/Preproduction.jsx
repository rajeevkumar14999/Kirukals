import { useMemo, useState } from 'react';
import TrashIcon from './TrashIcon';
import Attachment from './Attachment';
import {
  extractCast,
  extractLocations,
  labelFor,
  makeOption,
  mapsSearchUrl,
  readPortfolio,
  tidyMapUrl,
} from '../screenplay/preproduction';
import ShotSheet from './ShotSheet';
import BudgetSheet from './BudgetSheet';
import DeckSheet from './DeckSheet';
import ShootPlanSheet from './ShootPlanSheet';
import CostumeSheet from './CostumeSheet';
import SheetRow from './SheetRow';
import '../styles/preproduction.css';

/**
 * The two sheets a production starts from: where it shoots, and who is in it.
 *
 * The first column of each is read from the script and cannot be edited here —
 * that is the point. Everything else is the search, kept as lettered options
 * so a conversation can be about "location B" rather than "the second one".
 */
export default function Preproduction({
  doc, stats, sheet, board, onChange, onJump, onNotice, locked, onUnlock,
}) {
  const inner = <Sheets
    doc={doc} stats={stats} sheet={sheet} board={board}
    onChange={onChange} onJump={onJump} onNotice={onNotice}
  />;

  if (!locked) return inner;

  /*
   * Locked, not hidden. Everything below is rendered in full and can be read
   * and scrolled — a person deciding whether ₹499 is worth it should be able
   * to see exactly what they would get. The fieldset disables every control
   * inside it in one stroke, which is both simpler and more honest than
   * scattering `disabled` through six sheets.
   */
  return (
    <div className="pp-locked">
      <div className="pp-gate">
        <div>
          <b>Preproduction is a separate plan — ₹499 a month.</b>
          <span>
            Look around as much as you like. Unlocking lets you edit these sheets, upload
            photographs, and export the call sheets, budget and deck.
          </span>
        </div>
        <button className="btn btn--primary" onClick={onUnlock}>Unlock preproduction</button>
      </div>

      <fieldset className="pp-locked__body" disabled aria-label="Preproduction, locked">
        {inner}
      </fieldset>
    </div>
  );
}

function Sheets({ doc, stats, sheet, board, onChange, onJump, onNotice }) {
  if (sheet === 'cast') {
    return <CastSheet doc={doc} board={board} onChange={onChange} onJump={onJump} onNotice={onNotice} />;
  }
  if (sheet === 'costumes') {
    return (
      <CostumeSheet
        doc={doc} stats={stats} board={board}
        onChange={onChange} onJump={onJump} onNotice={onNotice}
      />
    );
  }
  if (sheet === 'plan') {
    return (
      <ShootPlanSheet doc={doc} stats={stats} board={board} onChange={onChange} onJump={onJump} />
    );
  }
  if (sheet === 'deck') {
    return (
      <DeckSheet doc={doc} stats={stats} board={board} onChange={onChange} onNotice={onNotice} />
    );
  }
  if (sheet === 'budget') {
    return <BudgetSheet doc={doc} stats={stats} board={board} onChange={onChange} />;
  }
  if (sheet === 'shots') {
    return (
      <ShotSheet
        doc={doc}
        stats={stats}
        board={board}
        onChange={onChange}
        onJump={onJump}
        onNotice={onNotice}
      />
    );
  }
  return <LocationSheet doc={doc} stats={stats} board={board} onChange={onChange} onJump={onJump} />;
}

/* ------------------------------- shared bits ------------------------------ */

function Options({ rows, chosen, onAdd, onChoose, onDrop, children, addLabel }) {
  return (
    <div className="pp-options">
      {rows.length === 0 && <p className="pp-empty">Nothing scouted yet.</p>}
      {rows.map((option, i) => (
        <article className={`pp-option${chosen === option.id ? ' is-chosen' : ''}`} key={option.id}>
          <header>
            <b>Option {labelFor(i)}</b>
            <span className="pp-option__acts">
              <button
                className={`pp-pick${chosen === option.id ? ' is-on' : ''}`}
                onClick={() => onChoose(chosen === option.id ? null : option.id)}
                title={chosen === option.id ? 'This is the one' : 'Choose this option'}
              >
                {chosen === option.id ? '✓ Chosen' : 'Choose'}
              </button>
              <button className="linkish" onClick={() => onDrop(option.id)} title="Remove this option"><TrashIcon /></button>
            </span>
          </header>
          {children(option)}
        </article>
      ))}
      <button className="pp-add" onClick={onAdd}>＋ {addLabel}</button>
    </div>
  );
}

/* ------------------------------- locations -------------------------------- */

function LocationSheet({ doc, stats, board, onChange, onJump }) {
  const [open, setOpen] = useState(null);
  const locations = useMemo(
    () => extractLocations(doc.elements, stats.pageOf || {}),
    [doc.elements, stats.pageOf],
  );

  const entry = (name) => board.locations[name] || { options: [], chosen: null };
  const write = (name, patch) =>
    onChange({ ...board, locations: { ...board.locations, [name]: { ...entry(name), ...patch } } });

  const setOption = (name, id, patch) =>
    write(name, {
      options: entry(name).options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Locations</h1>
          <p>
            {locations.length} in the script · every scene heading, gathered. INT. and EXT. of the
            same place count once — you scout it once.
          </p>
        </div>
      </header>

      {locations.length === 0 ? (
        <p className="pp-empty">
          No scene headings yet. Write one — <b>INT. COFFEE SHOP - DAY</b> — and it appears here.
        </p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Scenes</th>
              <th>Pages</th>
              <th>Chosen</th>
              <th>Options</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc) => {
              const row = entry(loc.name);
              const picked = row.options.find((o) => o.id === row.chosen);
              return (
                <SheetRow
                  key={loc.name}
                  head={loc.name}
                  open={open === loc.name}
                  onToggle={() => setOpen(open === loc.name ? null : loc.name)}
                  count={row.options.length}
                  meta={
                    <>
                      <td>
                        <button className="linkish" onClick={() => onJump(loc.firstId)} title="Go to the first scene here">
                          {loc.scenes}
                        </button>
                        <span className="pp-tags">
                          {loc.kinds.map((k) => <em key={k}>{k}</em>)}
                          {loc.times.map((t) => <em key={t} className="pp-tag--time">{t}</em>)}
                        </span>
                      </td>
                      <td className="pp-pages">{loc.pages.length ? loc.pages.join(', ') : '—'}</td>
                      <td className="pp-chosen">
                        {picked ? picked.place || picked.address || 'Chosen' : <span>—</span>}
                      </td>
                    </>
                  }
                >
                  <Options
                    rows={row.options}
                    chosen={row.chosen}
                    addLabel="Add a place"
                    onAdd={() =>
                      write(loc.name, {
                        options: [...row.options, makeOption({ place: '', address: '', mapUrl: '' })],
                      })
                    }
                    onChoose={(id) => write(loc.name, { chosen: id })}
                    onDrop={(id) =>
                      write(loc.name, {
                        options: row.options.filter((o) => o.id !== id),
                        chosen: row.chosen === id ? null : row.chosen,
                      })
                    }
                  >
                    {(option) => (
                      <div className="pp-fields">
                        <label>
                          <span>Place</span>
                          <input
                            value={option.place || ''}
                            placeholder="Sundar's tea stall, Mylapore"
                            onChange={(e) => setOption(loc.name, option.id, { place: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Address</span>
                          <textarea
                            rows={2}
                            value={option.address || ''}
                            placeholder="Door no, street, area, city, PIN"
                            onChange={(e) => setOption(loc.name, option.id, { address: e.target.value })}
                          />
                        </label>
                        <label>
                          <span>Google Maps link</span>
                          <input
                            value={option.mapUrl || ''}
                            placeholder="Paste a maps.google.com link"
                            onChange={(e) => setOption(loc.name, option.id, { mapUrl: e.target.value })}
                            onBlur={(e) =>
                              setOption(loc.name, option.id, { mapUrl: tidyMapUrl(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          <span>Notes</span>
                          <textarea
                            rows={2}
                            value={option.note || ''}
                            placeholder="Power, parking, permission, hours of light…"
                            onChange={(e) => setOption(loc.name, option.id, { note: e.target.value })}
                          />
                        </label>

                        <div className="pp-maplinks">
                          {option.mapUrl ? (
                            <a className="btn" href={option.mapUrl} target="_blank" rel="noreferrer noopener">
                              Open the pinned map ↗
                            </a>
                          ) : (
                            <span className="pp-hint">
                              Paste a link from Google Maps to pin the exact spot.
                            </span>
                          )}
                          {(option.address || option.place) && (
                            <a
                              className="btn"
                              href={mapsSearchUrl(`${option.place || ''} ${option.address || ''}`.trim())}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              Search this address ↗
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </Options>
                </SheetRow>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="pp-foot">
        Maps open in your browser and need the internet. Everything typed here is stored with the
        script, in this browser.
      </p>
    </div>
  );
}

/* ---------------------------------- cast ---------------------------------- */

function CastSheet({ doc, board, onChange, onJump, onNotice }) {
  const [open, setOpen] = useState(null);
  const cast = useMemo(() => extractCast(doc.elements), [doc.elements]);

  const entry = (name) => board.cast[name] || { options: [], chosen: null };
  const write = (name, patch) =>
    onChange({ ...board, cast: { ...board.cast, [name]: { ...entry(name), ...patch } } });

  const setOption = (name, id, patch) =>
    write(name, { options: entry(name).options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const attach = async (name, id, file) => {
    try {
      const portfolio = await readPortfolio(file);
      setOption(name, id, { portfolio });
    } catch (e) {
      onNotice?.({ kind: 'warn', text: e.message });
    }
  };

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Actors</h1>
          <p>
            {cast.length} speaking {cast.length === 1 ? 'role' : 'roles'} in the script, ordered by
            how much they say. Rename a character in the pages and the row follows.
          </p>
        </div>
      </header>

      {cast.length === 0 ? (
        <p className="pp-empty">
          No one speaks yet. Write a character cue and their row appears here.
        </p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>Character</th>
              <th>Speeches</th>
              <th>Words</th>
              <th>Cast</th>
              <th>Options</th>
            </tr>
          </thead>
          <tbody>
            {cast.map((person) => {
              const row = entry(person.name);
              const picked = row.options.find((o) => o.id === row.chosen);
              return (
                <SheetRow
                  key={person.name}
                  head={person.name}
                  open={open === person.name}
                  onToggle={() => setOpen(open === person.name ? null : person.name)}
                  count={row.options.length}
                  meta={
                    <>
                      <td>
                        <button className="linkish" onClick={() => onJump(person.firstId)} title="Go to their first cue">
                          {person.cues}
                        </button>
                      </td>
                      <td className="pp-pages">{person.words.toLocaleString()}</td>
                      <td className="pp-chosen">{picked ? picked.name || 'Chosen' : <span>—</span>}</td>
                    </>
                  }
                >
                  <Options
                    rows={row.options}
                    chosen={row.chosen}
                    addLabel="Add an actor"
                    onAdd={() =>
                      write(person.name, {
                        options: [...row.options, makeOption({ name: '', contact: '', portfolio: null })],
                      })
                    }
                    onChoose={(id) => write(person.name, { chosen: id })}
                    onDrop={(id) =>
                      write(person.name, {
                        options: row.options.filter((o) => o.id !== id),
                        chosen: row.chosen === id ? null : row.chosen,
                      })
                    }
                  >
                    {(option) => (
                      <div className="pp-fields pp-fields--actor">
                        <div className="pp-shot">
                          {option.portfolio?.kind === 'image' ? (
                            <Attachment of={option.portfolio} alt={option.name || 'Portfolio'} />
                          ) : option.portfolio ? (
                            <a href={option.portfolio.data} download={option.portfolio.name}>
                              {option.portfolio.name}
                            </a>
                          ) : (
                            <span>No portfolio</span>
                          )}
                          <label className="btn">
                            {option.portfolio ? 'Replace' : 'Upload portfolio'}
                            <input
                              type="file"
                              accept="image/*,.pdf"
                              hidden
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) attach(person.name, option.id, file);
                                e.target.value = '';
                              }}
                            />
                          </label>
                          {option.portfolio && (
                            <button
                              className="linkish"
                              onClick={() => setOption(person.name, option.id, { portfolio: null })}
                            >
                              remove
                            </button>
                          )}
                        </div>

                        <div className="pp-fields__col">
                          <label>
                            <span>Actor</span>
                            <input
                              value={option.name || ''}
                              placeholder="Name"
                              onChange={(e) => setOption(person.name, option.id, { name: e.target.value })}
                            />
                          </label>
                          <label>
                            <span>Contact</span>
                            <input
                              value={option.contact || ''}
                              placeholder="Phone, email, or agent"
                              onChange={(e) => setOption(person.name, option.id, { contact: e.target.value })}
                            />
                          </label>
                          <label>
                            <span>Notes</span>
                            <textarea
                              rows={3}
                              value={option.note || ''}
                              placeholder="Audition, availability, fee, language…"
                              onChange={(e) => setOption(person.name, option.id, { note: e.target.value })}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </Options>
                </SheetRow>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="pp-foot">
        Photographs are scaled down before they are stored, because everything here lives in this
        browser alongside the script. Keep PDFs under 400KB, or attach a photo instead.
      </p>
    </div>
  );
}
