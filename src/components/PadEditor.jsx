import '../styles/project.css';

/**
 * The Private Pad and any document added beside the script.
 *
 * Deliberately not the screenplay editor: no element types, no pagination, no
 * export. It is a sheet of paper for the thinking that happens around a
 * script — and nothing written here reaches a printed page.
 */
export default function PadEditor({ title, note, value, onChange }) {
  return (
    <div className="pad">
      <header className="pad__head">
        <h2>{title}</h2>
        <p>{note}</p>
      </header>
      <textarea
        className="pad__sheet"
        value={value}
        placeholder="Nobody sees this but you."
        onChange={(e) => onChange(e.target.value)}
        spellCheck
      />
    </div>
  );
}
