import { useMemo, useState } from 'react';
import { IMPORT_ACCEPT } from '../screenplay/import';
import { TYPES } from '../screenplay/elements';
import { extractCast, extractLocations } from '../screenplay/preproduction';
import { flattenShots, sceneBlocks } from '../screenplay/shots';
import { chosenOption, costumeBreakdown } from '../screenplay/costumes';
import { isDesktopApp } from '../downloads';
import { money, totals } from '../screenplay/budget';
import { buildSlides } from '../screenplay/deck';

const SECTION_TITLE = {
  project: 'Project',
  preproduction: 'Preproduction',
  cards: 'Cards',
  comments: 'Comments',
  tools: 'Tools',
  analysis: 'Analysis',
};

const TOOL_BUTTONS = [
  ['tagger', 'Tagger', 'Ctrl+Alt+T'],
  ['alternates', 'Line alternates', 'Ctrl+Alt+A'],
  ['readaloud', 'ReadAloud', ''],
  ['schedule', 'Writing schedule', ''],
  ['rename', 'Rename character…', ''],
  ['progressive', 'Present progressive…', ''],
  ['shorten', 'Shorten document…', ''],
  ['formatting', 'Check formatting…', ''],
  ['wordcount', 'Word count', ''],
];

/**
 * The panel beside the dock. Which section it shows is the dock's business;
 * everything here is about presenting one of them.
 */
export default function Sidebar({
  doc,
  section,
  ppSheet,
  onOpenSheet,
  docView,
  owner,
  backup,
  stats,
  index,
  prefs,
  setPrefs,
  onJump,
  onMoveScene,
  onNew,
  onOpen,
  onDelete,
  onImportFile,
  onCommand,
  onOpenDocument,
  onAddDocument,
  onDeleteDocument,
  onUnpin,
  onExhume,
  onBury,
}) {
  const [filter, setFilter] = useState('');

  const scenes = stats.scenes.filter((s) =>
    !filter || s.text.toLowerCase().includes(filter.toLowerCase()),
  );

  const byId = useMemo(() => new Map(doc.elements.map((el) => [el.id, el])), [doc.elements]);

  // Headline numbers for the preproduction panel: how much is still open.
  const board = doc.preproduction || { locations: {}, cast: {} };
  const locationCount = useMemo(() => extractLocations(doc.elements).length, [doc.elements]);
  const castCount = useMemo(() => extractCast(doc.elements).length, [doc.elements]);
  const chosenLocations = Object.values(board.locations || {}).filter((r) => r.chosen).length;
  const chosenCast = Object.values(board.cast || {}).filter((r) => r.chosen).length;
  const sceneList = useMemo(() => sceneBlocks(doc.elements), [doc.elements]);
  const shotCount = flattenShots(sceneList, board.shots || {}).length;
  const dividedScenes = sceneList.filter((s) => (board.shots?.[s.id]?.list || []).length).length;
  const budgetTotals = totals(board.budget || {});
  const budgetLines = (board.budget?.items || []).length;
  const shootDayCount = (board.shootDays || []).length;
  const costumePeople = useMemo(() => costumeBreakdown(doc, stats), [doc, stats]);
  const costumeLooks = Object.values(board.costumes || {}).reduce(
    (n, p) => n + (p.looks || []).length,
    0,
  );
  const costumeDecided = Object.values(board.costumes || {}).reduce(
    (n, p) => n + (p.looks || []).filter((l) => chosenOption(l)).length,
    0,
  );
  const plannedScenes = new Set(
    (board.shootDays || []).flatMap((d) => d[d.active || 'A']?.sceneIds || []),
  ).size;
  const deckSlides = useMemo(
    () => buildSlides(doc, stats, board).length,
    [doc, stats, board],
  );
  const pins = (doc.pins || []).map((id) => byId.get(id)).filter(Boolean);
  const grave = doc.graveyard || [];

  const comments = useMemo(
    () =>
      doc.elements.flatMap((el) =>
        (el.comments || []).map((c) => ({ ...c, elementId: el.id, on: el.text })),
      ).sort((a, b) => b.at - a.at),
    [doc.elements],
  );

  // Every tag in the script, gathered per category — the production breakdown.
  const tagGroups = useMemo(() => {
    const groups = new Map();
    for (const el of doc.elements) {
      for (const t of el.tags || []) {
        if (!groups.has(t.cat)) groups.set(t.cat, new Map());
        const bucket = groups.get(t.cat);
        bucket.set(t.label, [...(bucket.get(t.label) || []), el.id]);
      }
    }
    return [...groups.entries()].map(([cat, bucket]) => ({
      cat,
      items: [...bucket.entries()].map(([label, ids]) => ({ label, ids })),
    }));
  }, [doc.elements]);

  return (
    <aside className="sidebar">
      <header className="sidebar__head">
        <h2>{SECTION_TITLE[section] || 'Project'}</h2>
      </header>

      <div className="sidebar__body">
        {/* ------------------------------ project ----------------------------- */}
        {section === 'project' && (
          <>
            <h3 className="sidebar__sub sidebar__sub--first">Project documents</h3>
            <ul className="doclist">
              <li>
                <button
                  className={docView === 'screenplay' ? 'is-current' : ''}
                  onClick={() => onOpenDocument('screenplay')}
                >
                  <span className="doclist__icon" aria-hidden="true">▤</span>
                  <b>{doc.name || 'Default Document'}</b>
                  <i className="doclist__owner" title={`${owner} owns this script`} aria-hidden="true">●</i>
                </button>
              </li>
              <li>
                <button
                  className={docView === 'pad' ? 'is-current' : ''}
                  onClick={() => onOpenDocument('pad')}
                  title="Notes only you see — never exported, never printed"
                >
                  <span className="doclist__icon" aria-hidden="true">✎</span>
                  <b>Private Pad</b>
                </button>
              </li>
              <li>
                <button onClick={() => onCommand('title')}>
                  <span className="doclist__icon" aria-hidden="true">▥</span>
                  <b>Title Page</b>
                </button>
              </li>
              {(doc.documents || []).map((d) => (
                <li key={d.id}>
                  <button
                    className={docView === d.id ? 'is-current' : ''}
                    onClick={() => onOpenDocument(d.id)}
                  >
                    <span className="doclist__icon" aria-hidden="true">▤</span>
                    <b>{d.name}</b>
                  </button>
                  <button
                    className="linkish"
                    title="Delete this document"
                    onClick={() => onDeleteDocument(d.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
              <li>
                <button className="doclist__add" onClick={onAddDocument}>
                  <span className="doclist__icon" aria-hidden="true">＋</span>
                  <b>Add Document</b>
                </button>
              </li>
            </ul>

            <ul className="doclist doclist--actions">
              <li>
                <label className="doclist__file">
                  <span className="doclist__icon" aria-hidden="true">↥</span>
                  <b>Import</b>
                  <input
                    type="file"
                    accept={IMPORT_ACCEPT}
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onImportFile(file);
                      e.target.value = '';
                    }}
                  />
                </label>
              </li>
              <li>
                <button onClick={() => onCommand('export')}>
                  <span className="doclist__icon" aria-hidden="true">↧</span>
                  <b>Export</b>
                </button>
              </li>
              <li>
                <button onClick={() => onCommand('print')}>
                  <span className="doclist__icon" aria-hidden="true">▦</span>
                  <b>Quick Export (PDF)</b>
                </button>
              </li>
            </ul>

            <ul className="doclist doclist--actions">
              <li>
                <button onClick={onNew}>
                  <span className="doclist__icon" aria-hidden="true">▣</span>
                  <b>New Project</b>
                </button>
              </li>
              <li>
                <button onClick={() => onCommand('portfolio')}>
                  <span className="doclist__icon" aria-hidden="true">▤</span>
                  <b>Open Portfolio</b>
                  <kbd>Ctrl+O</kbd>
                </button>
              </li>
              <li>
                <button onClick={() => onCommand('backups')}>
                  <span className="doclist__icon" aria-hidden="true">▩</span>
                  <b>Set External Backups</b>
                </button>
              </li>
              {!isDesktopApp() && (
                <li>
                  <button onClick={() => onCommand('download')}>
                    <span className="doclist__icon" aria-hidden="true">⤓</span>
                    <b>Download for Windows</b>
                  </button>
                </li>
              )}
            </ul>

            {/* Said plainly, because the answer matters: is there a copy of
                this outside the browser yet, or not. */}
            <p className={`savestate${backup?.lastWrite ? ' is-ok' : ''}`}>
              <span aria-hidden="true">{backup?.lastWrite ? '✔' : '!'}</span>
              {backup?.lastWrite
                ? `Saved to ${backup.folderName} at ${new Date(backup.lastWrite).toLocaleTimeString()}`
                : 'Not saved offline this session'}
            </p>

            <h3 className="sidebar__sub">Scenes</h3>
            <input
              className="sidebar__search"
              placeholder="Filter scenes…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {scenes.length === 0 && <p className="empty">No scene headings yet.</p>}
            <ol className="scene-list">
              {scenes.map((s, i) => (
                <li key={s.id}>
                  <button className="scene-list__item" onClick={() => onJump(s.id)}>
                    <span className="scene-list__no">{i + 1}</span>
                    <span className="scene-list__text">{s.text}</span>
                    <span className="scene-list__page">p.{s.page}</span>
                  </button>
                  <span className="scene-list__moves">
                    <button title="Move scene up" onClick={() => onMoveScene(s.id, -1)}>↑</button>
                    <button title="Move scene down" onClick={() => onMoveScene(s.id, 1)}>↓</button>
                  </span>
                </li>
              ))}
            </ol>

            <h3 className="sidebar__sub">Pins</h3>
            {pins.length === 0 ? (
              <p className="empty">Nothing pinned. Ctrl+Alt+K pins the line you are on.</p>
            ) : (
              <ul className="pin-list">
                {pins.map((el) => (
                  <li key={el.id}>
                    <button onClick={() => onJump(el.id)}>
                      <span className="tag tag--muted">{TYPES[el.type].short}</span>
                      {el.text.slice(0, 48) || '(empty line)'}
                    </button>
                    <button className="linkish" onClick={() => onUnpin(el.id)} title="Unpin">✕</button>
                  </li>
                ))}
              </ul>
            )}

            <h3 className="sidebar__sub">Graveyard</h3>
            {grave.length === 0 ? (
              <p className="empty">Deleted lines are kept here, in case you want them back.</p>
            ) : (
              <ul className="pin-list">
                {grave.map((g) => (
                  <li key={g.buriedId}>
                    <button onClick={() => onExhume(g.buriedId)} title="Put this line back at the end">
                      <span className="tag tag--muted">{TYPES[g.type]?.short || '?'}</span>
                      {g.text.slice(0, 48) || '(empty line)'}
                    </button>
                    <button className="linkish" onClick={() => onBury(g.buriedId)} title="Forget it for good">✕</button>
                  </li>
                ))}
              </ul>
            )}

          </>
        )}

        {/* --------------------------- preproduction -------------------------- */}
        {section === 'preproduction' && (
          <>
            <ul className="doclist">
              <li>
                <button
                  className={ppSheet === 'locations' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('locations')}
                >
                  <span className="doclist__icon" aria-hidden="true">▦</span>
                  <b>Locations</b>
                  <kbd>{locationCount}</kbd>
                </button>
              </li>
              <li>
                <button
                  className={ppSheet === 'cast' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('cast')}
                >
                  <span className="doclist__icon" aria-hidden="true">☺</span>
                  <b>Actors</b>
                  <kbd>{castCount}</kbd>
                </button>
              </li>
              <li>
                <button
                  className={ppSheet === 'costumes' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('costumes')}
                >
                  <span className="doclist__icon" aria-hidden="true">✂</span>
                  <b>Costumes</b>
                  <kbd>{costumePeople.length}</kbd>
                </button>
              </li>
              <li>
                <button
                  className={ppSheet === 'shots' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('shots')}
                >
                  <span className="doclist__icon" aria-hidden="true">▶</span>
                  <b>Shot division</b>
                  <kbd>{shotCount}</kbd>
                </button>
              </li>
              <li>
                <button
                  className={ppSheet === 'plan' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('plan')}
                >
                  <span className="doclist__icon" aria-hidden="true">◷</span>
                  <b>Shoot plan</b>
                  <kbd>{shootDayCount}</kbd>
                </button>
              </li>
              <li>
                <button
                  className={ppSheet === 'budget' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('budget')}
                >
                  <span className="doclist__icon" aria-hidden="true">₹</span>
                  <b>Budget</b>
                  <kbd>{budgetLines}</kbd>
                </button>
              </li>
              <li>
                <button
                  className={ppSheet === 'deck' ? 'is-current' : ''}
                  onClick={() => onOpenSheet('deck')}
                >
                  <span className="doclist__icon" aria-hidden="true">◈</span>
                  <b>Pitch deck</b>
                  <kbd>{deckSlides}</kbd>
                </button>
              </li>
            </ul>

            <p className="empty">
              Both sheets are read from the script: every scene heading becomes a location, every
              character cue becomes a role. Scout each one as options A, B, C — then choose.
            </p>

            <h3 className="sidebar__sub">Decided</h3>
            <ul className="pin-list">
              <li>
                <button onClick={() => onOpenSheet('locations')}>
                  <span className="tag tag--muted">LOC</span>
                  {chosenLocations} of {locationCount} locked
                </button>
              </li>
              <li>
                <button onClick={() => onOpenSheet('cast')}>
                  <span className="tag tag--muted">CAST</span>
                  {chosenCast} of {castCount} cast
                </button>
              </li>
              <li>
                <button onClick={() => onOpenSheet('shots')}>
                  <span className="tag tag--muted">SHOTS</span>
                  {dividedScenes} of {sceneList.length} scenes divided
                </button>
              </li>
              <li>
                <button onClick={() => onOpenSheet('costumes')}>
                  <span className="tag tag--muted">WARDROBE</span>
                  {costumeLooks ? `${costumeDecided} of ${costumeLooks} changes set` : 'not started'}
                </button>
              </li>
              <li>
                <button onClick={() => onOpenSheet('plan')}>
                  <span className="tag tag--muted">PLAN</span>
                  {plannedScenes} of {sceneList.length} scenes scheduled
                </button>
              </li>
              <li>
                <button onClick={() => onOpenSheet('budget')}>
                  <span className="tag tag--muted">BUDGET</span>
                  {budgetLines
                    ? money(budgetTotals.grand, board.budget?.currency || 'INR')
                    : 'not drafted'}
                </button>
              </li>
            </ul>
          </>
        )}

        {/* ------------------------------- cards ------------------------------ */}
        {section === 'cards' && (
          <>
            {stats.scenes.length === 0 && (
              <p className="empty">Write a scene heading and it appears here as a card.</p>
            )}
            <div className="cards">
              {stats.scenes.map((s, i) => (
                <button className="card" key={s.id} onClick={() => onJump(s.id)}>
                  <header>
                    <span>{i + 1}</span>
                    <b>p.{s.page}</b>
                  </header>
                  <h4>{s.text || 'Untitled scene'}</h4>
                  <p>{sceneSummary(doc.elements, s.id)}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ------------------------------ comments ---------------------------- */}
        {section === 'comments' && (
          <>
            {comments.length === 0 && (
              <p className="empty">No comments yet. Ctrl+Alt+M leaves one on the line you are on.</p>
            )}
            <ul className="cmt-list">
              {comments.map((c) => (
                <li key={c.id}>
                  <button onClick={() => onJump(c.elementId)}>
                    <span className="cmt-list__on">{c.on.slice(0, 44) || '(empty line)'}</span>
                    <p>{c.body}</p>
                    <span className="cmt-list__by">{c.author}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* -------------------------------- tools ----------------------------- */}
        {section === 'tools' && (
          <>
            <ul className="tool-menu">
              {TOOL_BUTTONS.map(([id, label, key]) => (
                <li key={id}>
                  <button onClick={() => onCommand(id)}>
                    <span>{label}</span>
                    {key && <kbd>{key}</kbd>}
                  </button>
                </li>
              ))}
            </ul>

            <h3 className="sidebar__sub">Spelling</h3>
            <label className="form__check">
              <input
                type="checkbox"
                checked={prefs.spellcheck !== false}
                onChange={(e) => setPrefs((p) => ({ ...p, spellcheck: e.target.checked }))}
              />
              <span>Check spelling as I type</span>
            </label>
            <p className="empty">
              Spelling is your browser's own dictionary, which is why it works offline. There is no
              grammar checker — that would need a server.
            </p>
          </>
        )}

        {/* ------------------------------ analysis ---------------------------- */}
        {section === 'analysis' && (
          <>
            <button className="btn btn--primary an-run" onClick={() => onCommand('analyse')}>
              Analyse the script
            </button>
            <p className="empty">
              Measures craft and shape — length, scene rhythm, how the action reads — and says
              what a reader would notice first.
            </p>

            <ul className="stat-grid">
              <li><b>{stats.pageCount}</b><span>pages</span></li>
              <li><b>{stats.scenes.length}</b><span>scenes</span></li>
              <li><b>{stats.cast.length}</b><span>speaking roles</span></li>
              <li><b>{stats.words.toLocaleString()}</b><span>words</span></li>
              <li><b>~{stats.runtime}</b><span>minutes on screen</span></li>
              <li><b>{doc.elements.length}</b><span>elements</span></li>
            </ul>

            <h3 className="sidebar__sub">Cast</h3>
            {stats.cast.length === 0 && <p className="empty">No dialogue written yet.</p>}
            <ul className="cast-list">
              {stats.cast.map((c) => (
                <li key={c.name}>
                  <div className="cast-list__head">
                    <span className="cast-list__name">{c.name}</span>
                    <span className="cast-list__lines">{c.lines} lines</span>
                  </div>
                  <div className="cast-list__bar">
                    <i style={{ width: `${Math.min(100, (c.lines / (stats.cast[0].lines || 1)) * 100)}%` }} />
                  </div>
                  <div className="cast-list__meta">{c.scenes} scenes · {c.words} words</div>
                </li>
              ))}
            </ul>

            <h3 className="sidebar__sub">Breakdown</h3>
            {tagGroups.length === 0 ? (
              <p className="empty">Nothing tagged yet. Ctrl+Alt+T tags the line you are on.</p>
            ) : (
              tagGroups.map((g) => (
                <div className="tag-group" key={g.cat}>
                  <h4>{g.cat}</h4>
                  <ul>
                    {g.items.map((it) => (
                      <li key={it.label}>
                        <button onClick={() => onJump(it.ids[0])}>
                          {it.label}
                          <b>{it.ids.length}</b>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </aside>
  );
}

/** The first line of action under a slug — enough to recognise the scene by. */
function sceneSummary(elements, sceneId) {
  const start = elements.findIndex((el) => el.id === sceneId);
  if (start === -1) return '';
  for (let i = start + 1; i < elements.length; i += 1) {
    if (elements[i].type === 'scene_heading') break;
    if (elements[i].text.trim()) return elements[i].text.slice(0, 120);
  }
  return 'Nothing written in this scene yet.';
}
