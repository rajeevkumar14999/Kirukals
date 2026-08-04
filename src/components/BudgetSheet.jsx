import { Fragment, useMemo, useState } from 'react';
import TrashIcon from './TrashIcon';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PAGES_PER_DAY,
  UNITS,
  budgetToCsv,
  emptyBudget,
  lineActual,
  lineTotal,
  makeItem,
  money,
  printBudget,
  suggestBudget,
  totals,
} from '../screenplay/budget';
import { download } from '../screenplay/formats';

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

/**
 * What the film costs, line by line.
 *
 * The estimate column is the plan and the actual column is what happened; both
 * live on the same row so the gap between them is never a separate document
 * nobody updates.
 */
export default function BudgetSheet({ doc, stats, board, onChange }) {
  const [openCat, setOpenCat] = useState('cast');
  const budget = board.budget || emptyBudget();
  const t = useMemo(() => totals(budget), [budget]);

  const write = (patch) => onChange({ ...board, budget: { ...budget, ...patch } });
  const setItems = (items) => write({ items });

  const setItem = (id, patch) =>
    setItems(budget.items.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const days = budget.shootDays || Math.max(1, Math.ceil((stats.pageCount || 1) / PAGES_PER_DAY));
  const perDay = days ? Math.round(t.grand / days) : 0;
  const perMinute = stats.runtime ? Math.round(t.grand / stats.runtime) : 0;

  const draft = () => {
    if (
      budget.items.length &&
      !window.confirm('Replace the current budget with a fresh draft from the script?')
    ) {
      return;
    }
    onChange({ ...board, budget: suggestBudget(doc, stats) });
  };

  return (
    <div className="pp">
      <header className="pp__head">
        <div>
          <h1>Budget</h1>
          <p>
            {budget.items.length} lines · {days} shooting days at {PAGES_PER_DAY} pages a day ·
            {' '}{stats.pageCount} pages
          </p>
        </div>
        <div className="pp__acts">
          <button className="btn" onClick={draft}>
            {budget.items.length ? 'Redraft from the script' : 'Draft from the script'}
          </button>
          <button
            className="btn btn--primary"
            disabled={!budget.items.length}
            onClick={() => printBudget(doc, budget, stats)}
          >
            Export budget (PDF)
          </button>
          <button
            className="btn"
            disabled={!budget.items.length}
            title="The same budget as a spreadsheet"
            onClick={() =>
              download(
                `${(doc.name || 'script').replace(/\W+/g, '-').toLowerCase()}-budget.csv`,
                budgetToCsv(budget),
                'text/csv',
              )
            }
          >
            .csv
          </button>
        </div>
      </header>

      {/* ------------------------------ top sheet ----------------------------- */}
      <section className="bud-top">
        <div className="bud-figure">
          <span>Total</span>
          <b>{money(t.grand, budget.currency)}</b>
          <em>including {budget.contingencyPct}% contingency</em>
        </div>
        <div className="bud-figure">
          <span>Spent so far</span>
          <b>{money(t.actual, budget.currency)}</b>
          <em className={t.variance < 0 ? 'is-over' : ''}>
            {t.variance < 0
              ? `${money(-t.variance, budget.currency)} over the estimate`
              : `${money(t.variance, budget.currency)} still unspent`}
          </em>
        </div>
        <div className="bud-figure">
          <span>Per shooting day</span>
          <b>{money(perDay, budget.currency)}</b>
          <em>{money(perMinute, budget.currency)} per screen minute</em>
        </div>

        <div className="bud-controls">
          <label>
            <span>Currency</span>
            <select value={budget.currency} onChange={(e) => write({ currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>
            <span>Contingency %</span>
            <input
              type="number" min="0" max="50"
              value={budget.contingencyPct}
              onChange={(e) => write({ contingencyPct: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label>
            <span>Shooting days</span>
            <input
              type="number" min="1"
              value={days}
              onChange={(e) => write({ shootDays: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
        </div>
      </section>

      {budget.items.length === 0 ? (
        <p className="pp-empty">
          Nothing budgeted yet. <b>Draft from the script</b> writes the lines for you — one per
          speaking role, one per location, and the crew and services a shoot this long needs —
          with the rates left blank, because only you know what they cost where you are shooting.
        </p>
      ) : (
        <table className="pp-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Lines</th>
              <th>Estimate</th>
              <th>Actual</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => {
              const rows = budget.items.filter((i) => i.cat === cat.id);
              const sum = t.byCategory.get(cat.id) || { estimate: 0, actual: 0 };
              const share = t.subtotal ? Math.round((sum.estimate / t.subtotal) * 100) : 0;
              const open = openCat === cat.id;
              if (!rows.length && !open) {
                return (
                  <tr key={cat.id} className="bud-quiet">
                    <td>
                      <button className="pp-name" onClick={() => setOpenCat(cat.id)}>
                        <i aria-hidden="true">▸</i>
                        {cat.label}
                      </button>
                    </td>
                    <td colSpan={4} className="pp-pages">nothing yet</td>
                  </tr>
                );
              }
              return (
                // The fragment carries the key: without it React cannot tell
                // one category's rows from another's when the list changes.
                <Fragment key={cat.id}>
                  <tr className={open ? 'is-open' : ''}>
                    <td>
                      <button className="pp-name" onClick={() => setOpenCat(open ? null : cat.id)}>
                        <i aria-hidden="true">{open ? '▾' : '▸'}</i>
                        {cat.label}
                      </button>
                    </td>
                    <td className="pp-pages">{rows.length}</td>
                    <td className="bud-num">{money(sum.estimate, budget.currency)}</td>
                    <td className="bud-num">{sum.actual ? money(sum.actual, budget.currency) : '—'}</td>
                    <td className="bud-share">
                      <i style={{ width: `${share}%` }} />
                      <span>{share}%</span>
                    </td>
                  </tr>

                  {open && (
                    <tr className="pp-drawer">
                      <td colSpan={5}>
                        <table className="bud-lines">
                          <thead>
                            <tr>
                              <th>Line</th>
                              <th>Qty</th>
                              <th>Unit</th>
                              <th>Rate</th>
                              <th>Days</th>
                              <th>Estimate</th>
                              <th>Actual</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((item) => (
                              <tr key={item.id}>
                                <td>
                                  <input
                                    className="bud-name"
                                    value={item.name}
                                    placeholder="What it is"
                                    onChange={(e) => setItem(item.id, { name: e.target.value })}
                                  />
                                  {item.note && <span className="bud-note">{item.note}</span>}
                                </td>
                                <td>
                                  <input
                                    type="number" min="0" className="bud-sm"
                                    value={item.qty}
                                    onChange={(e) => setItem(item.id, { qty: Number(e.target.value) || 0 })}
                                  />
                                </td>
                                <td>
                                  <select
                                    value={item.unit}
                                    onChange={(e) => setItem(item.id, { unit: e.target.value })}
                                  >
                                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                  </select>
                                </td>
                                <td>
                                  <input
                                    type="number" min="0" className="bud-md"
                                    value={item.rate}
                                    onChange={(e) => setItem(item.id, { rate: Number(e.target.value) || 0 })}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="number" min="1" className="bud-sm"
                                    value={item.days}
                                    onChange={(e) => setItem(item.id, { days: Number(e.target.value) || 1 })}
                                  />
                                </td>
                                <td className="bud-num">{money(lineTotal(item), budget.currency)}</td>
                                <td>
                                  <input
                                    type="number" min="0" className="bud-md"
                                    value={item.actual}
                                    placeholder="0"
                                    onChange={(e) => setItem(item.id, { actual: Number(e.target.value) || 0 })}
                                  />
                                </td>
                                <td>
                                  <button
                                    className="linkish"
                                    title="Remove this line"
                                    onClick={() => setItems(budget.items.filter((i) => i.id !== item.id))}
                                  >
                                    <TrashIcon />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <button
                          className="pp-add"
                          onClick={() => setItems([...budget.items, makeItem({ cat: cat.id })])}
                        >
                          ＋ Add a line to {cat.label.toLowerCase()}
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            <tr className="bud-total">
              <td>Subtotal</td>
              <td />
              <td className="bud-num">{money(t.subtotal, budget.currency)}</td>
              <td className="bud-num">{t.actual ? money(t.actual, budget.currency) : '—'}</td>
              <td />
            </tr>
            <tr className="bud-total">
              <td>Contingency {budget.contingencyPct}%</td>
              <td />
              <td className="bud-num">{money(t.contingency, budget.currency)}</td>
              <td />
              <td />
            </tr>
            <tr className="bud-total bud-total--grand">
              <td>Total</td>
              <td />
              <td className="bud-num">{money(t.grand, budget.currency)}</td>
              <td className="bud-num">{t.actual ? money(t.actual, budget.currency) : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      )}

      <p className="pp-foot">
        The estimate is arithmetic on what you type — quantity × rate × days — and nothing is
        assumed about local rates. The shooting-day count starts from {PAGES_PER_DAY} pages a day
        and is yours to change; per-day and per-minute figures follow from it.
      </p>
    </div>
  );
}
