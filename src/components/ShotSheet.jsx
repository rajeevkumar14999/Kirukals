import { useMemo, useState } from 'react';
import Attachment from './Attachment';
import SheetRow from './SheetRow';
import {
  ANGLES,
  MOVES,
  SIZES,
  flattenShots,
  makeShot,
  printShotList,
  runningSeconds,
  sceneBlocks,
  shotsToCsv,
  suggestShots,
} from '../screenplay/shots';
import { download } from '../screenplay/formats';
import { readImageFile } from '../screenplay/preproduction';

const mmss = (secs) => `${Math.floor(secs / 60)}m ${secs % 60}s`;
const cueName = (text) => text.replace(/\s*\(.*$/, '').trim().toUpperCase();
const shotNumber = (sceneIndex, i) => `${sceneIndex + 1}${String.fromCharCode(65 + Math.min(i, 25))}`;

/**
 * Scene by scene, how the script will be covered.
 *
 * The division is proposed, never imposed: the app writes the coverage a crew
 * would shoot by default, and every line of it is editable, reorderable and
 * removable afterwards.
 */
export default function ShotSheet({ doc, stats, board, onChange, onJump, onNotice }) {
  const [open, setOpen] = useState(null);

  const scenes = useMemo(
    () => sceneBlocks(doc.elements, stats.pageOf || {}),
    [doc.elements, stats.pageOf],
  );

  const shots = board.shots || {};
  const listOf = (sceneId) => shots[sceneId]?.list || [];
  const write = (sceneId, list) => onChange({ ...board, shots: { ...shots, [sceneId]: { list } } });

  const setShot = (sceneId, id, patch) =>
    write(sceneId, listOf(sceneId).map((s) => (s.id === id ? { ...s, ...patch } : s)));

  /**
   * A reference frame is kept small on purpose: a whole film's worth of them
   * shares the few megabytes this browser gives the script.
   */
  const attachRef = async (sceneId, id, file) => {
    try {
      const ref = await readImageFile(file, { maxEdge: 360, quality: 0.68 });
      setShot(sceneId, id, { ref });
    } catch (e) {
      onNotice?.({ kind: 'warn', text: e.message });
    }
  };

  const move = (sceneId, id, delta) => {
    const list = [...listOf(sceneId)];
    const i = list.findIndex((s) => s.id === id);
    const j = i + delta;
    if (i === -1 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    write(sceneId, list);
  };

  const divideAll = () => {
    const next = { ...shots };
    // Never overwrite a list someone has already worked on.
    for (const scene of scenes) {
      if (!next[scene.id]?.list?.length) next[scene.id] = { list: suggestShots(scene) };
    }
    onChange({ ...board, shots: next });
  };

  const all = flattenShots(scenes, shots);
  const covered = scenes.filter((s) => listOf(s.id).length).length;
  const seconds = runningSeconds(scenes, shots);
  const done = all.filter((s) => s.done).length;

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Shot division</h1>
          <p>
            {scenes.length} scene{scenes.length === 1 ? '' : 's'} · {covered} divided ·{' '}
            {all.length} shot{all.length === 1 ? '' : 's'} · {mmss(seconds)} of coverage
            {done > 0 ? ` · ${done} in the can` : ''}
          </p>
        </div>
        <div className="pp__acts">
          <button className="btn" onClick={divideAll} disabled={!scenes.length}>
            Divide every scene
          </button>
          <button
            className="btn btn--primary"
            disabled={!all.length}
            onClick={() => printShotList(doc, scenes, shots)}
          >
            Export shot list (PDF)
          </button>
          <button
            className="btn"
            disabled={!all.length}
            title="The same list as a spreadsheet, for scheduling"
            onClick={() =>
              download(
                `${(doc.name || 'script').replace(/\W+/g, '-').toLowerCase()}-shot-list.csv`,
                shotsToCsv(scenes, shots),
                'text/csv',
              )
            }
          >
            .csv
          </button>
        </div>
      </header>

      {scenes.length === 0 ? (
        <p className="pp-empty">
          No scenes yet. A shot list is built scene by scene, so write a scene heading first.
        </p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>Scene</th>
              <th>Page</th>
              <th>Cast</th>
              <th>Coverage</th>
              <th>Shots</th>
            </tr>
          </thead>
          <tbody>
            {scenes.map((scene, si) => {
              const list = listOf(scene.id);
              const cast = [
                ...new Set(scene.body.filter((e) => e.type === 'character').map((e) => cueName(e.text))),
              ].filter(Boolean);
              const secs = list.reduce((n, s) => n + (Number(s.duration) || 0), 0);

              return (
                <SheetRow
                  key={scene.id}
                  head={`${si + 1}. ${scene.heading}`}
                  open={open === scene.id}
                  onToggle={() => setOpen(open === scene.id ? null : scene.id)}
                  count={list.length}
                  countNoun="shot"
                  meta={
                    <>
                      <td>
                        <button className="linkish" onClick={() => onJump(scene.id)} title="Go to this scene">
                          p.{scene.page}
                        </button>
                      </td>
                      <td className="pp-pages">{cast.length ? cast.join(', ') : '—'}</td>
                      <td className="pp-chosen">
                        {list.length ? mmss(secs) : <span>not divided</span>}
                      </td>
                    </>
                  }
                >
                  <div className="shot-head">
                    <button className="btn" onClick={() => write(scene.id, suggestShots(scene))}>
                      {list.length ? 'Re-divide from the script' : 'Divide this scene'}
                    </button>
                    <button className="btn" onClick={() => write(scene.id, [...list, makeShot()])}>
                      ＋ Add a shot
                    </button>
                    {list.length > 0 && (
                      <button className="linkish" onClick={() => write(scene.id, [])}>clear</button>
                    )}
                  </div>

                  {list.length === 0 ? (
                    <p className="pp-empty">
                      Not divided yet. “Divide this scene” proposes the ordinary coverage — an
                      establisher, a setup for each beat of action, and singles that alternate
                      through the dialogue — and then you change what you disagree with.
                    </p>
                  ) : (
                    <ol className="shot-list">
                      {list.map((shot, i) => (
                        <li className={shot.done ? 'is-done' : ''} key={shot.id}>
                          <span className="shot-no">{shotNumber(si, i)}</span>

                          <div className="shot-ref">
                            {shot.ref ? (
                              <>
                                <a href={shot.ref.data} target="_blank" rel="noreferrer noopener" title="Open full size">
                                  <Attachment of={shot.ref} alt={`Reference for shot ${shotNumber(si, i)}`} />
                                </a>
                                <span className="shot-ref__acts">
                                  <label title="Replace this reference">↻
                                    <input
                                      type="file"
                                      accept="image/*"
                                      hidden
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) attachRef(scene.id, shot.id, file);
                                        e.target.value = '';
                                      }}
                                    />
                                  </label>
                                  <button className="linkish" title="Remove this reference" onClick={() => setShot(scene.id, shot.id, { ref: null })}>✕</button>
                                </span>
                              </>
                            ) : (
                              <label className="shot-ref__drop" title="Upload a reference frame">
                                <span>＋ ref</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  hidden
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) attachRef(scene.id, shot.id, file);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                            )}
                          </div>

                          <div className="shot-body">
                            <div className="shot-selects">
                              <select
                                value={shot.size}
                                onChange={(e) => setShot(scene.id, shot.id, { size: e.target.value })}
                                title="Shot size"
                              >
                                {SIZES.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <select
                                value={shot.angle}
                                onChange={(e) => setShot(scene.id, shot.id, { angle: e.target.value })}
                                title="Angle"
                              >
                                {ANGLES.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <select
                                value={shot.move}
                                onChange={(e) => setShot(scene.id, shot.id, { move: e.target.value })}
                                title="Camera movement"
                              >
                                {MOVES.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <input
                                className="shot-lens"
                                value={shot.lens || ''}
                                placeholder="lens"
                                onChange={(e) => setShot(scene.id, shot.id, { lens: e.target.value })}
                              />
                              <input
                                className="shot-secs"
                                type="number"
                                min="1"
                                value={shot.duration}
                                title="Seconds on screen"
                                onChange={(e) =>
                                  setShot(scene.id, shot.id, { duration: Number(e.target.value) || 0 })
                                }
                              />
                            </div>

                            <input
                              className="shot-desc"
                              value={shot.desc}
                              placeholder="What the camera sees"
                              onChange={(e) => setShot(scene.id, shot.id, { desc: e.target.value })}
                            />
                            <input
                              className="shot-cast"
                              value={shot.cast || ''}
                              placeholder="Who is in it"
                              onChange={(e) => setShot(scene.id, shot.id, { cast: e.target.value })}
                            />
                          </div>

                          <div className="shot-acts">
                            <button
                              className={`pp-pick${shot.done ? ' is-on' : ''}`}
                              onClick={() => setShot(scene.id, shot.id, { done: !shot.done })}
                              title="Mark as shot"
                            >
                              {shot.done ? '✓ Shot' : 'To shoot'}
                            </button>
                            <button className="linkish" onClick={() => move(scene.id, shot.id, -1)} title="Move up">↑</button>
                            <button className="linkish" onClick={() => move(scene.id, shot.id, 1)} title="Move down">↓</button>
                            <button
                              className="linkish"
                              title="Remove this shot"
                              onClick={() => write(scene.id, list.filter((s) => s.id !== shot.id))}
                            >
                              ✕
                            </button>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </SheetRow>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="pp-foot">
        The seconds are screen time, not shooting time — a day on set buys a few minutes of film.
        Re-dividing a scene replaces its list, so edits made by hand are lost; adding shots
        yourself never triggers that.
      </p>
    </div>
  );
}
