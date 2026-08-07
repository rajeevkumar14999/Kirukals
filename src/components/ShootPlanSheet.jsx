import { useMemo, useState } from 'react';
import TrashIcon from './TrashIcon';
import {
  PLANS,
  castFor,
  eighthsLabel,
  emptyPlan,
  makeDay,
  placeFor,
  planSummary,
  printCallSheet,
  sceneEighths,
} from '../screenplay/shootplan';
import { sceneBlocks } from '../screenplay/shots';
import { parseSlug } from '../screenplay/preproduction';

const cueName = (text) => text.replace(/\s*\(.*$/, '').trim().toUpperCase();

/**
 * The shoot plan.
 *
 * A day is a selection of scenes; everything else — who is called, where the
 * unit goes, how much of the script it covers — follows from that selection
 * and is never typed twice. Plan B is the same thing again, so the cover is
 * planned properly rather than improvised at dawn.
 */
export default function ShootPlanSheet({ doc, stats, board, onChange, onJump }) {
  const days = board.shootDays || [];
  const [openId, setOpenId] = useState(days[0]?.id || null);

  const scenes = useMemo(
    () => sceneBlocks(doc.elements, stats.pageOf || {}).map((s, i) => ({ ...s, number: i + 1 })),
    [doc.elements, stats.pageOf],
  );

  const write = (next) => onChange({ ...board, shootDays: next });
  const day = days.find((d) => d.id === openId) || null;
  const planKey = day?.active || 'A';
  const plan = day ? { ...emptyPlan(), ...(day[planKey] || {}) } : null;

  const setDay = (id, patch) => write(days.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const setPlan = (patch) => setDay(day.id, { [planKey]: { ...plan, ...patch } });

  const addDay = () => {
    const next = makeDay(days.length + 1);
    write([...days, next]);
    setOpenId(next.id);
  };

  const toggleScene = (sceneId) => {
    const has = plan.sceneIds.includes(sceneId);
    setPlan({
      sceneIds: has ? plan.sceneIds.filter((s) => s !== sceneId) : [...plan.sceneIds, sceneId],
    });
  };

  const summary = useMemo(
    () => (day ? planSummary(doc, board, plan, stats) : null),
    [doc, board, plan, stats, day],
  );

  // Scenes already promised to another day, so a scene is not shot twice.
  const spokenFor = useMemo(() => {
    const map = new Map();
    for (const d of days) {
      for (const key of PLANS) {
        for (const id of d[key]?.sceneIds || []) {
          if (d.id === day?.id && key === planKey) continue;
          map.set(id, `${d.label} ${key}`);
        }
      }
    }
    return map;
  }, [days, day, planKey]);

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Shoot plan</h1>
          <p>
            {days.length} day{days.length === 1 ? '' : 's'} planned · pick the scenes and the day
            works itself out: who is called, where the unit goes, how much of the script it covers.
          </p>
        </div>
        <div className="pp__acts">
          <button className="btn" onClick={addDay}>＋ Add a day</button>
          <button
            className="btn btn--primary"
            disabled={!day}
            onClick={() => printCallSheet(doc, stats, board, day)}
          >
            Call sheet (PDF)
          </button>
        </div>
      </header>

      {days.length === 0 ? (
        <p className="pp-empty">
          No days yet. A shooting day is a selection of scenes — add one, tick the scenes, and the
          cast list, locations and page count follow.
        </p>
      ) : (
        <div className="plan">
          {/* --------------------------- the days --------------------------- */}
          <aside className="plan-days">
            {days.map((d) => {
              const sum = planSummary(doc, board, { ...emptyPlan(), ...(d[d.active || 'A'] || {}) }, stats);
              return (
                <button
                  key={d.id}
                  className={`plan-day${d.id === openId ? ' is-current' : ''}`}
                  onClick={() => setOpenId(d.id)}
                >
                  <b>{d.label}</b>
                  <span>{d.date || 'no date'}</span>
                  <em>
                    {sum.scenes.length} sc · {eighthsLabel(sum.eighths)} pp · {sum.cast.length} cast
                  </em>
                </button>
              );
            })}
            <button className="pp-add" onClick={addDay}>＋ Add a day</button>
          </aside>

          {/* --------------------------- one day ---------------------------- */}
          {day && (
            <section className="plan-body">
              <header className="plan-head">
                <input
                  className="plan-label"
                  value={day.label}
                  onChange={(e) => setDay(day.id, { label: e.target.value })}
                />
                <input
                  type="date"
                  value={day.date}
                  onChange={(e) => setDay(day.id, { date: e.target.value })}
                />
                <span className="plan-tabs">
                  {PLANS.map((key) => (
                    <button
                      key={key}
                      className={`btn${planKey === key ? ' is-on' : ''}`}
                      onClick={() => setDay(day.id, { active: key })}
                      title={key === 'A' ? "The day's intention" : 'Cover — rain, a lost location, a missing artist'}
                    >
                      Plan {key}
                    </button>
                  ))}
                </span>
                <button
                  className="linkish"
                  title="Delete this day"
                  onClick={() => {
                    write(days.filter((d) => d.id !== day.id));
                    setOpenId(days.find((d) => d.id !== day.id)?.id || null);
                  }}
                >
                  <TrashIcon />
                </button>
              </header>

              {planKey === 'B' && (
                <p className="plan-hint">
                  Plan B is what the unit turns to when the weather, a location or an artist falls
                  through. It prints on the same call sheet, greyed, so nobody mistakes it for today.
                </p>
              )}

              <div className="plan-grid">
                {/* ----------------------- scene picker ---------------------- */}
                <div className="plan-scenes">
                  <h3 className="sidebar__sub sidebar__sub--first">Scenes on Plan {planKey}</h3>
                  {scenes.length === 0 && <p className="pp-empty">The script has no scenes yet.</p>}
                  <ul>
                    {scenes.map((scene) => {
                      const on = plan.sceneIds.includes(scene.id);
                      const taken = spokenFor.get(scene.id);
                      const cast = [
                        ...new Set(scene.body.filter((e) => e.type === 'character').map((e) => cueName(e.text))),
                      ].filter(Boolean);
                      return (
                        <li key={scene.id} className={on ? 'is-on' : ''}>
                          <label>
                            <input type="checkbox" checked={on} onChange={() => toggleScene(scene.id)} />
                            <span className="plan-scene__no">{scene.number}</span>
                            <span className="plan-scene__head">
                              {scene.heading}
                              <em>
                                {eighthsLabel(sceneEighths(scene))} pp · p.{scene.page}
                                {cast.length ? ` · ${cast.join(', ')}` : ''}
                                {taken ? ` · already on ${taken}` : ''}
                              </em>
                            </span>
                          </label>
                          <button className="linkish" title="Go to this scene" onClick={() => onJump(scene.id)}>↗</button>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* ------------------------- the day ------------------------- */}
                <div className="plan-summary">
                  <div className="plan-figures">
                    <div><b>{summary.scenes.length}</b><span>scenes</span></div>
                    <div><b>{eighthsLabel(summary.eighths)}</b><span>pages</span></div>
                    <div><b>{summary.shots}</b><span>shots</span></div>
                    <div><b>{summary.cast.length}</b><span>artists</span></div>
                  </div>

                  <label className="deck-field">
                    <span>Unit call</span>
                    <input
                      type="time"
                      value={plan.callTime}
                      onChange={(e) => setPlan({ callTime: e.target.value })}
                    />
                  </label>
                  <label className="deck-field">
                    <span>Unit / crew note</span>
                    <input
                      value={plan.unit}
                      placeholder="Main unit"
                      onChange={(e) => setPlan({ unit: e.target.value })}
                    />
                  </label>

                  <h3 className="sidebar__sub">Locations</h3>
                  {summary.locations.length === 0 ? (
                    <p className="pp-empty">No scenes picked yet.</p>
                  ) : (
                    <ul className="plan-list">
                      {summary.locations.map((l) => {
                        const found = placeFor(board, l);
                        return (
                          <li key={l}>
                            <b>{l}</b>
                            {found ? (
                              <em>{found.place || found.address}</em>
                            ) : (
                              <em className="is-open">not scouted yet</em>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <h3 className="sidebar__sub">Artists called</h3>
                  {summary.cast.length === 0 ? (
                    <p className="pp-empty">Nobody speaks in the scenes picked.</p>
                  ) : (
                    <ul className="plan-list">
                      {summary.cast.map((c) => {
                        const actor = castFor(board, c.name);
                        return (
                          <li key={c.name}>
                            <b>{c.name}</b>
                            {actor ? (
                              <em>{actor.name}{actor.contact ? ` · ${actor.contact}` : ''}</em>
                            ) : (
                              <em className="is-open">not cast yet</em>
                            )}
                            <i>sc {c.scenes.join(', ')}</i>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <label className="deck-field">
                    <span>Notes for the day</span>
                    <textarea
                      rows={3}
                      value={plan.note}
                      placeholder="Permissions, equipment, food, anything the unit must know"
                      onChange={(e) => setPlan({ note: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </section>
          )}
        </div>
      )}

      <p className="pp-foot">
        Page lengths are in eighths, the unit a schedule is written in. A scene already promised to
        another day is marked rather than blocked — doubling up is sometimes deliberate.
      </p>
    </div>
  );
}
