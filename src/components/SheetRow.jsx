/**
 * One row of a production sheet: a summary line that opens into the work.
 *
 * Shared by the locations, cast and shot sheets so the three read as one
 * document rather than three tools that happen to sit together.
 */
export default function SheetRow({ head, meta, open, onToggle, count, countNoun = 'option', children }) {
  return (
    <>
      <tr className={open ? 'is-open' : ''}>
        <td>
          <button className="pp-name" onClick={onToggle}>
            <i aria-hidden="true">{open ? '▾' : '▸'}</i>
            {head}
          </button>
        </td>
        {meta}
        <td className="pp-count">
          {count > 0 ? `${count} ${countNoun}${count === 1 ? '' : 's'}` : '—'}
        </td>
      </tr>
      {open && (
        <tr className="pp-drawer">
          <td colSpan={5}>{children}</td>
        </tr>
      )}
    </>
  );
}
