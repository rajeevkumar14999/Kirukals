import { useMemo, useState } from 'react';
import { FORMS, analyse, guessForm } from '../screenplay/analysis';

/**
 * The report.
 *
 * The number at the top is deliberately explained rather than pronounced: each
 * measure shows what was counted, the range it was judged against, and what to
 * do about it. A score nobody can argue with is a score nobody can learn from.
 */
export default function AnalysisReport({ doc, stats, onCommand }) {
  const [form, setForm] = useState(null);
  const report = useMemo(
    () => analyse(doc, stats, form || guessForm(stats.pageCount || 1)),
    [doc, stats, form],
  );

  return (
    <div className="pp an">
      <header className="pp__head">
        <div>
          <h1>Script analysis</h1>
          <p>
            Craft and shape — length, scene rhythm, the balance of talk and action, how the pages
            read. Not whether the story is any good: no arithmetic knows that.
          </p>
        </div>
        <div className="pp__acts">
          <label className="an-form">
            <span>Judge it as</span>
            <select value={form || guessForm(stats.pageCount || 1)} onChange={(e) => setForm(e.target.value)}>
              {Object.entries(FORMS).map(([id, f]) => (
                <option key={id} value={id}>{f.label}</option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="an-verdict">
        <div className={`an-score an-score--${report.score >= 85 ? 'good' : report.score >= 70 ? 'fair' : report.score >= 50 ? 'weak' : 'early'}`}>
          <b>{report.score}</b>
          <span>out of 100</span>
        </div>
        <div className="an-verdict__text">
          <h2>{report.verdict}</h2>
          <p>{report.meaning}</p>
          <p className="an-counts">
            {report.counts.pages} pages · {report.counts.scenes} scenes ·{' '}
            {report.counts.cast} speaking roles · {report.counts.words.toLocaleString()} words
          </p>
        </div>
      </section>

      <ul className="an-metrics">
        {report.metrics.map((m) => (
          <li key={m.id} className={`an-metric an-metric--${m.state}`}>
            <div className="an-metric__head">
              <b>{m.label}</b>
              <span className="an-metric__value">{m.value}</span>
            </div>
            <div className="an-metric__bar"><i style={{ width: `${m.pct}%` }} /></div>
            <p className="an-metric__target">Judged against {m.target}</p>
            <p className="an-metric__note">{m.note}</p>
          </li>
        ))}
      </ul>

      <section className="an-next">
        <h3>What to do next</h3>
        <div className="an-next__row">
          <button className="btn" onClick={() => onCommand('formatting')}>Check formatting</button>
          <button className="btn" onClick={() => onCommand('shorten')}>Find what to cut</button>
          <button className="btn" onClick={() => onCommand('progressive')}>Tighten the action</button>
          <button className="btn" onClick={() => onCommand('wordcount')}>Word count</button>
        </div>
      </section>

      <p className="pp-foot">
        Every range above is a convention, not a law — plenty of good films break all of them. The
        measures exist because a reader forms an opinion in ten pages, and these are the things
        they notice before the story has had a chance to work.
      </p>
    </div>
  );
}
