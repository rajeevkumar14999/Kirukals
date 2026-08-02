import { useState } from 'react';
import { Modal } from './Dialogs';
import { DEFAULTS, DOC_LANGUAGES, PAPER, UI_LANGUAGES, settings } from '../settings';

/**
 * Customize.
 *
 * Seven pages down the side rather than one long scroll, because the pages
 * answer different questions — how typing behaves, how the screen looks, what
 * comes out of the printer — and a person opening this has one of those
 * questions, not all seven.
 *
 * Every control here changes something. Nothing is listed that is not wired,
 * and where a setting only reaches the PDF the page says so, so that a
 * screenwriter is never left wondering why the screen did not change.
 */

function Toggle({ s, set, name, label, note }) {
  return (
    <label className="setting">
      <input type="checkbox" checked={Boolean(s[name])} onChange={(e) => set(name, e.target.checked)} />
      <span>
        <b>{label}</b>
        {note && <i>{note}</i>}
      </span>
    </label>
  );
}

function Choice({ s, set, name, label, note, options }) {
  return (
    <label className="setting setting--field">
      <span>
        <b>{label}</b>
        {note && <i>{note}</i>}
      </span>
      <select value={s[name]} onChange={(e) => set(name, e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

function Num({ s, set, name, label, note, min, max, step = 0.25, unit }) {
  return (
    <label className="setting setting--field">
      <span>
        <b>{label}</b>
        {note && <i>{note}</i>}
      </span>
      <span className="setting__num">
        <input
          type="number"
          value={s[name]}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) set(name, Math.min(max, Math.max(min, v)));
          }}
        />
        {unit && <i>{unit}</i>}
      </span>
    </label>
  );
}

const PAGES = [
  { id: 'editing', label: 'Editing' },
  { id: 'display', label: 'Display' },
  { id: 'format', label: 'Format' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'pdf', label: 'PDF' },
  { id: 'page', label: 'Page' },
  { id: 'misc', label: 'Misc' },
];

export default function SettingsDialog({ prefs, setPrefs, page = 'editing', onClose }) {
  const [tab, setTab] = useState(page);
  const s = settings(prefs);
  const set = (name, value) => setPrefs((p) => ({ ...p, [name]: value }));

  return (
    <Modal title="Customize" onClose={onClose} wide>
      <div className="settings">
        <nav className="settings__nav">
          {PAGES.map((p) => (
            <button
              key={p.id}
              className={tab === p.id ? 'is-on' : ''}
              onClick={() => setTab(p.id)}
            >
              {p.label}
            </button>
          ))}
        </nav>

        <div className="settings__body">
          {tab === 'editing' && (
            <>
              <Toggle s={s} set={set} name="spellcheck" label="Check spelling as I type"
                note="Off for scene headings and character names, which are meant to be shouted" />
              <Toggle s={s} set={set} name="autocomplete" label="Suggest names as I type"
                note="Characters and locations already in the script" />
              <Toggle s={s} set={set} name="graveyard" label="Keep deleted lines in the Graveyard"
                note="Turn this off and a deleted line is gone for good" />
            </>
          )}

          {tab === 'display' && (
            <>
              <Choice s={s} set={set} name="theme" label="Theme"
                options={[{ id: 'dark', label: 'Dark' }, { id: 'light', label: 'Light' }]} />
              <Num s={s} set={set} name="zoom" label="Zoom" min={0.6} max={2} step={0.1} unit="×" />
              <Toggle s={s} set={set} name="focusMode" label="Focus mode"
                note="Dim every line but the one being written" />
              <Toggle s={s} set={set} name="commentMarks" label="Mark commented lines in the margin" />
            </>
          )}

          {tab === 'format' && (
            <>
              <Toggle s={s} set={set} name="boldSceneHeadings" label="Bold scene headings" />
              <Toggle s={s} set={set} name="underlineSceneHeadings" label="Underline scene headings" />
              <Toggle s={s} set={set} name="sceneNumbers" label="Number the scenes"
                note="Printed in both margins beside each heading, as a shooting script has them" />
              <Toggle s={s} set={set} name="contd" label="Add (CONT'D) when a character speaks again"
                note="Applied when printing — the script itself is left as written" />
            </>
          )}

          {tab === 'notifications' && (
            <>
              <Toggle s={s} set={set} name="notifyChat" label="Show a note when a message arrives" />
              <Toggle s={s} set={set} name="notifyUpdates" label="Tell me when a new version is out" />
              <p className="settings__note">
                Kirukals sends nothing to anyone and shows nothing you have not asked for. These are
                the only two notices it has.
              </p>
            </>
          )}

          {tab === 'pdf' && (
            <>
              <Toggle s={s} set={set} name="pdfTitlePage" label="Include the title page"
                note="Only if one has been filled in" />
              <Toggle s={s} set={set} name="pdfPageNumbers" label="Number the pages"
                note="Top right, from page two, as a script always has" />
              <Choice s={s} set={set} name="pdfFontSize" label="Type size"
                note="12pt is the standard the one-page-one-minute rule is calibrated against"
                options={[{ id: 11, label: '11 pt' }, { id: 12, label: '12 pt (standard)' }, { id: 13, label: '13 pt' }]} />
            </>
          )}

          {tab === 'page' && (
            <>
              <Choice s={s} set={set} name="paper" label="Paper"
                note="Letter is what the trade reads, even where everything else is A4"
                options={Object.entries(PAPER).map(([id, p]) => ({ id, label: p.label }))} />
              <Num s={s} set={set} name="marginTop" label="Top margin" min={0.25} max={2} unit="in" />
              <Num s={s} set={set} name="marginBottom" label="Bottom margin" min={0.25} max={2} unit="in" />
              <Num s={s} set={set} name="marginLeft" label="Left margin" min={0.5} max={2.5} unit="in"
                note="1.5in leaves room for the binding" />
              <Num s={s} set={set} name="marginRight" label="Right margin" min={0.25} max={2} unit="in" />
              <p className="settings__note">
                These are the margins of the printed page. The editor keeps its own measure so that
                what is on screen stays a page of script.
              </p>
            </>
          )}

          {tab === 'misc' && (
            <>
              <Toggle s={s} set={set} name="confirmClose" label="Warn me before closing with unsaved work" />
              <Choice s={s} set={set} name="uiLanguage" label="Interface language" options={UI_LANGUAGES} />
              <Choice s={s} set={set} name="docLanguage" label="Document language"
                note="The dictionary the spell-checker reads from"
                options={DOC_LANGUAGES} />
              <div className="settings__reset">
                <button
                  className="btn"
                  onClick={() => setPrefs((p) => ({ ...p, ...DEFAULTS, schedule: p.schedule }))}
                >
                  Reset everything to its default
                </button>
                <i>Your scripts are not touched.</i>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="modal__actions">
        <button className="btn btn--primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}
