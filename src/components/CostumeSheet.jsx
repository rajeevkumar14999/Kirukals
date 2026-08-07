import { useMemo, useState } from 'react';
import TrashIcon from './TrashIcon';
import Attachment from './Attachment';
import SheetRow from './SheetRow';
import {
  SOURCES,
  chosenOption,
  costumeBreakdown,
  costumeCost,
  emptyCostumeOption,
  emptyLook,
  printCostumes,
} from '../screenplay/costumes';
import { readImageFile } from '../screenplay/preproduction';
import { money } from '../screenplay/budget';

/**
 * Costumes, character by character.
 *
 * The left column comes from the script and cannot be edited: who is in it,
 * which scenes, and anything the writer already said about what they wear.
 * Everything else is the designer's work, kept as options until one is chosen.
 */
export default function CostumeSheet({ doc, stats, board, onChange, onJump, onNotice }) {
  const [open, setOpen] = useState(null);
  const people = useMemo(() => costumeBreakdown(doc, stats), [doc, stats]);
  const saved = board.costumes || {};

  const entry = (name) => saved[name] || { looks: [] };
  const write = (name, patch) =>
    onChange({ ...board, costumes: { ...saved, [name]: { ...entry(name), ...patch } } });

  /** The suggested changes become real ones the first time they are used. */
  const looksOf = (person) => {
    const rows = entry(person.name).looks;
    if (rows.length) return rows;
    return person.suggested.map((s) => ({
      ...emptyLook(s.label),
      sceneIds: s.sceneIds,
      numbers: s.numbers,
      when: s.when,
    }));
  };

  const setLooks = (person, looks) => write(person.name, { looks });

  const setLook = (person, lookId, patch) =>
    setLooks(person, looksOf(person).map((l) => (l.id === lookId ? { ...l, ...patch } : l)));

  const setOption = (person, lookId, optionId, patch) => {
    const look = looksOf(person).find((l) => l.id === lookId);
    setLook(person, lookId, {
      options: look.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)),
    });
  };

  const attach = async (person, lookId, optionId, file) => {
    try {
      const image = await readImageFile(file, { maxEdge: 420, quality: 0.7 });
      setOption(person, lookId, optionId, { image });
    } catch (e) {
      onNotice?.({ kind: 'warn', text: e.message });
    }
  };

  const total = costumeCost(board);

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Costumes</h1>
          <p>
            {people.length} character{people.length === 1 ? '' : 's'} ·{' '}
            {total ? `${money(total)} committed` : 'no costs entered yet'} · changes are proposed
            from the script, then yours to redraw.
          </p>
        </div>
        <div className="pp__acts">
          <button
            className="btn btn--primary"
            disabled={!people.length}
            onClick={() => printCostumes(doc, stats, board)}
          >
            Export breakdown (PDF)
          </button>
        </div>
      </header>

      {people.length === 0 ? (
        <p className="pp-empty">
          Nobody is in the script yet. Write a character cue and their wardrobe appears here.
        </p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>Character</th>
              <th>Scenes</th>
              <th>Cost</th>
              <th>Decided</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => {
              const looks = looksOf(person);
              const decided = looks.filter((l) => chosenOption(l)).length;
              const spend = looks.reduce((n, l) => n + (Number(chosenOption(l)?.cost) || 0), 0);
              return (
                <SheetRow
                  key={person.name}
                  head={person.name}
                  open={open === person.name}
                  onToggle={() => setOpen(open === person.name ? null : person.name)}
                  count={looks.length}
                  countNoun="change"
                  meta={
                    <>
                      <td>
                        <button
                          className="linkish"
                          onClick={() => onJump(person.scenes[0].id)}
                          title="Go to their first scene"
                        >
                          {person.scenes.length}
                        </button>
                      </td>
                      <td className="pp-pages">{spend ? money(spend) : '—'}</td>
                      <td className="pp-chosen">
                        {decided === looks.length ? 'all set' : <span>{decided} of {looks.length}</span>}
                      </td>
                    </>
                  }
                >
                  {/* What the writer already said about this person's clothes. */}
                  {person.clues.length > 0 && (
                    <div className="cos-clues">
                      <b>From the script</b>
                      <ul>
                        {person.clues.slice(0, 4).map((c, i) => (
                          <li key={i}><em>sc {c.scene}</em> {c.text}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="cos-looks">
                    {looks.map((look) => {
                      const numbers = (look.numbers || []).length
                        ? look.numbers
                        : look.sceneIds
                            .map((id) => person.scenes.find((s) => s.id === id)?.number)
                            .filter(Boolean);
                      const pick = chosenOption(look);

                      return (
                        <section className="cos-look" key={look.id}>
                          <header>
                            <input
                              className="cos-look__label"
                              value={look.label}
                              onChange={(e) => setLook(person, look.id, { label: e.target.value })}
                            />
                            <span className="cos-look__scenes">
                              sc {numbers.join(', ') || '—'}
                              {look.when ? ` · ${look.when.toLowerCase()}` : ''}
                            </span>
                            <button
                              className="linkish"
                              title="Remove this change"
                              onClick={() => setLooks(person, looks.filter((l) => l.id !== look.id))}
                            >
                              <TrashIcon />
                            </button>
                          </header>

                          <div className="pp-options">
                            {look.options.length === 0 && (
                              <p className="pp-empty">No costume proposed for this change yet.</p>
                            )}

                            {look.options.map((option, i) => (
                              <article
                                className={`pp-option${look.chosen === option.id ? ' is-chosen' : ''}`}
                                key={option.id}
                              >
                                <header>
                                  <b>Option {String.fromCharCode(65 + i)}</b>
                                  <span className="pp-option__acts">
                                    <button
                                      className={`pp-pick${look.chosen === option.id ? ' is-on' : ''}`}
                                      onClick={() =>
                                        setLook(person, look.id, {
                                          chosen: look.chosen === option.id ? null : option.id,
                                        })
                                      }
                                    >
                                      {look.chosen === option.id ? '✓ Chosen' : 'Choose'}
                                    </button>
                                    <button
                                      className="linkish"
                                      onClick={() =>
                                        setLook(person, look.id, {
                                          options: look.options.filter((o) => o.id !== option.id),
                                          chosen: look.chosen === option.id ? null : look.chosen,
                                        })
                                      }
                                    >
                                      <TrashIcon />
                                    </button>
                                  </span>
                                </header>

                                <div className="pp-fields pp-fields--actor">
                                  <div className="pp-shot">
                                    {option.image ? (
                                      <a href={option.image.data} target="_blank" rel="noreferrer noopener">
                                        <Attachment of={option.image} />
                                      </a>
                                    ) : (
                                      <span>No reference</span>
                                    )}
                                    <label className="btn">
                                      {option.image ? 'Replace' : 'Reference'}
                                      <input
                                        type="file" accept="image/*" hidden
                                        onChange={(e) => {
                                          const file = e.target.files?.[0];
                                          if (file) attach(person, look.id, option.id, file);
                                          e.target.value = '';
                                        }}
                                      />
                                    </label>
                                  </div>

                                  <div className="pp-fields__col">
                                    <label>
                                      <span>Costume</span>
                                      <input
                                        value={option.desc}
                                        placeholder="White veshti, cream shirt"
                                        onChange={(e) => setOption(person, look.id, option.id, { desc: e.target.value })}
                                      />
                                    </label>
                                    <label>
                                      <span>Pieces</span>
                                      <input
                                        value={option.pieces}
                                        placeholder="Veshti, shirt, chappal, watch"
                                        onChange={(e) => setOption(person, look.id, option.id, { pieces: e.target.value })}
                                      />
                                    </label>
                                    <div className="cos-row">
                                      <label>
                                        <span>Source</span>
                                        <select
                                          value={option.source}
                                          onChange={(e) => setOption(person, look.id, option.id, { source: e.target.value })}
                                        >
                                          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                      </label>
                                      <label>
                                        <span>Cost</span>
                                        <input
                                          type="number" min="0"
                                          value={option.cost}
                                          onChange={(e) => setOption(person, look.id, option.id, { cost: Number(e.target.value) || 0 })}
                                        />
                                      </label>
                                    </div>
                                    <label>
                                      <span>Notes</span>
                                      <textarea
                                        rows={2}
                                        value={option.note}
                                        placeholder="Continuity duplicate needed, blood rig, fitting date…"
                                        onChange={(e) => setOption(person, look.id, option.id, { note: e.target.value })}
                                      />
                                    </label>
                                  </div>
                                </div>
                              </article>
                            ))}

                            <button
                              className="pp-add"
                              onClick={() =>
                                setLook(person, look.id, { options: [...look.options, emptyCostumeOption()] })
                              }
                            >
                              ＋ Add a costume
                            </button>
                          </div>

                          {pick && (
                            <p className="cos-decided">
                              Wearing <b>{pick.desc || 'option chosen'}</b>
                              {pick.source ? ` · ${pick.source.toLowerCase()}` : ''}
                              {pick.cost ? ` · ${money(pick.cost)}` : ''}
                            </p>
                          )}
                        </section>
                      );
                    })}

                    <button
                      className="pp-add"
                      onClick={() => setLooks(person, [...looks, emptyLook(`Look ${looks.length + 1}`)])}
                    >
                      ＋ Add a change
                    </button>
                  </div>
                </SheetRow>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="pp-foot">
        A change is one outfit worn across a run of scenes. They are proposed by following each
        character through the script and starting a new one wherever the scenes jump or the light
        changes — split or merge them as the story actually needs.
      </p>
    </div>
  );
}
