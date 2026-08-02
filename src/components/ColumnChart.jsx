import { useId, useState } from 'react';

/**
 * Single-series column chart.
 *
 * Marks follow the house spec: bars capped at 24px with a 2px surface gap
 * between neighbours, a 4px rounded cap and a square baseline, hairline
 * gridlines, and one direct label on the peak rather than a number on every
 * column. Hovering any column shows its exact value; the same numbers are
 * available as a table underneath, so nothing is gated behind a hover.
 */
export default function ColumnChart({
  data,
  color,
  title,
  subtitle,
  format = (v) => String(v),
  height = 150,
}) {
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);
  const labelId = useId();

  const max = Math.max(...data.map((d) => d.value), 0);
  const peak = data.findIndex((d) => d.value === max && max > 0);
  const band = 100 / data.length; // percentage width per slot
  const scale = (v) => (max > 0 ? (v / max) * (height - 26) : 0);

  return (
    <section className="chart" aria-labelledby={labelId}>
      <header className="chart__head">
        <h3 id={labelId}>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </header>

      {max === 0 ? (
        <p className="chart__empty">Nothing recorded in this window yet.</p>
      ) : (
        <div className="chart__plot" style={{ height }} onMouseLeave={() => setHover(null)}>
          {/* Hairline gridlines plus the baseline carry the values that are not
              directly labelled. On a small integer scale the midpoint rounds to
              the same label as the top, so it is dropped rather than repeated. */}
          {[0.5, 1]
            .map((f) => ({ f, label: format(max * f) }))
            .filter((t, i, all) => all.findLastIndex((x) => x.label === t.label) === i)
            .map((t) => (
              <span key={t.f} className="chart__grid" style={{ bottom: `${scale(max * t.f) + 20}px` }}>
                <i>{t.label}</i>
              </span>
            ))}

          <div className="chart__bars">
            {data.map((d, i) => (
              <div
                key={i}
                className={`chart__slot${hover === i ? ' is-hover' : ''}`}
                style={{ width: `${band}%` }}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={-1}
              >
                {i === peak && (
                  <span className="chart__peak" style={{ bottom: `${scale(d.value) + 24}px` }}>
                    {format(d.value)}
                  </span>
                )}
                <span
                  className="chart__bar"
                  style={{ height: `${scale(d.value)}px`, background: color }}
                />
                <span className="chart__tick">{d.tick || ''}</span>
              </div>
            ))}
          </div>

          {hover !== null && (
            <div
              className="chart__tip"
              style={{ left: `${band * (hover + 0.5)}%` }}
              role="status"
            >
              <b>{format(data[hover].value)}</b>
              <span>{data[hover].label}</span>
            </div>
          )}
        </div>
      )}

      <button className="chart__toggle" onClick={() => setShowTable((s) => !s)}>
        {showTable ? 'Hide data' : 'Show as table'}
      </button>
      {showTable && (
        <table className="chart__table">
          <tbody>
            {data
              .filter((d) => d.value > 0)
              .map((d, i) => (
                <tr key={i}>
                  <td>{d.label}</td>
                  <td>{format(d.value)}</td>
                </tr>
              ))}
            {data.every((d) => d.value === 0) && (
              <tr><td colSpan={2}>No activity in this window.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
