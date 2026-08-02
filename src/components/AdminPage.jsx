import { useMemo, useState } from 'react';
import ColumnChart from './ColumnChart';
import { clearActivity, daily, readActivity, summarise, toCsv } from '../auth/activity';
import { listUsers } from '../auth/session';
import { scriptCountFor } from '../screenplay/storage';
import { download } from '../screenplay/formats';
import {
  PLAN,
  listPayments,
  loadMerchant,
  rejectPayment,
  revenueStats,
  saveMerchant,
  verifyPayment,
} from '../billing/subscription';
import { formatInr, isValidVpa } from '../billing/upi';
import { clientId as googleClientId, isConfigured as googleConfigured, setClientId as setGoogleClientId } from '../auth/google';
import '../styles/billing.css';
import '../styles/admin.css';

const DAY = 86_400_000;

// Validated against both app surfaces — see the palette check in the README.
const SERIES = {
  signups: 'var(--viz-1)',
  hours: 'var(--viz-2)',
};

const fmtHours = (ms) => {
  const mins = ms / 60000;
  if (mins < 1) return '0m';
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${(mins / 60).toFixed(1)}h`;
};

const fmtDate = (d) =>
  new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function fmtAgo(ts) {
  if (!ts) return 'never';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < DAY) return `${Math.round(diff / 3_600_000)} h ago`;
  if (diff < 30 * DAY) return `${Math.round(diff / DAY)} d ago`;
  return fmtDate(ts);
}

export default function AdminPage({ session, onExit }) {
  const [tick, setTick] = useState(0);
  const [sort, setSort] = useState('hours');
  const [merchant, setMerchant] = useState(loadMerchant);
  const [merchantSaved, setMerchantSaved] = useState(false);
  const [googleId, setGoogleId] = useState(googleClientId);
  const [googleSaved, setGoogleSaved] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` re-reads localStorage
  const payments = useMemo(() => listPayments(), [tick]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` re-reads localStorage
  const revenue = useMemo(() => revenueStats(), [tick]);
  const refresh = () => setTick((t) => t + 1);

  const storeMerchant = () => {
    saveMerchant(merchant);
    setMerchantSaved(true);
    setTimeout(() => setMerchantSaved(false), 1800);
  };

  const { users, records, byUser, stats, signupSeries, hoursSeries } = useMemo(() => {
    const now = Date.now();
    const userList = listUsers();
    const log = readActivity(now);
    const totals = summarise(log);

    const weekAgo = now - 7 * DAY;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    return {
      users: userList,
      records: log,
      byUser: totals,
      stats: {
        total: userList.length,
        newThisWeek: userList.filter((u) => u.createdAt >= weekAgo).length,
        activeToday: new Set(
          log.filter((r) => r.startedAt >= dayStart.getTime()).map((r) => r.uid),
        ).size,
        totalMs: log.reduce((sum, r) => sum + r.durationMs, 0),
        sessions: log.length,
        online: log.filter((r) => r.live).length,
      },
      // Sign-ups land on their creation day.
      signupSeries: daily(userList, 30, (u, from, to) =>
        u.createdAt >= from && u.createdAt < to ? 1 : 0,
      ),
      // A session contributes only the part of itself that falls inside the day,
      // so one long session spanning midnight is split rather than double-counted.
      hoursSeries: daily(log, 14, (r, from, to) => {
        const end = r.endedAt ?? now;
        return Math.max(0, Math.min(end, to) - Math.max(r.startedAt, from));
      }),
    };
    // `tick` is the refresh trigger: localStorage is not reactive, so bumping it
    // is what re-reads the log.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const rows = useMemo(() => {
    const list = users.map((u) => {
      const t = byUser.get(u.id);
      return {
        ...u,
        sessions: t?.sessions || 0,
        totalMs: t?.totalMs || 0,
        lastSeen: t?.lastSeen || 0,
        live: t?.live || false,
        scripts: scriptCountFor(u.id),
      };
    });
    const by = {
      hours: (a, b) => b.totalMs - a.totalMs,
      joined: (a, b) => b.createdAt - a.createdAt,
      name: (a, b) => a.name.localeCompare(b.name),
      seen: (a, b) => b.lastSeen - a.lastSeen,
    };
    return list.sort(by[sort]);
  }, [users, byUser, sort]);

  const guestSessions = records.filter((r) => r.guest);

  const exportCsv = () =>
    download(`kirukals-activity-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(records), 'text/csv');

  const wipe = () => {
    if (!window.confirm('Delete the whole activity log? Accounts are not affected.')) return;
    clearActivity();
    setTick((t) => t + 1);
  };

  return (
    <div className="admin">
      <header className="admin__bar">
        <button className="btn" onClick={onExit}>← Back to editor</button>
        <div className="admin__titles">
          <h1>Admin</h1>
          <p>Signed in as {session.name}</p>
        </div>
        <div className="admin__actions">
          <button className="btn" onClick={refresh}>Refresh</button>
          <button className="btn" onClick={exportCsv} disabled={!records.length}>Export CSV</button>
          <button className="btn" onClick={wipe} disabled={!records.length}>Clear log</button>
        </div>
      </header>

      <p className="admin__scope">
        This dashboard reads the accounts and activity stored in <b>this browser</b>. Kirukals has
        no server, so it cannot see people using the app on other machines.
      </p>

      <section className="kpis">
        <article className="kpi">
          <span className="kpi__label">Accounts</span>
          <b className="kpi__value">{stats.total}</b>
          <span className="kpi__delta">{stats.newThisWeek} new in the last 7 days</span>
        </article>
        <article className="kpi">
          <span className="kpi__label">Active today</span>
          <b className="kpi__value">{stats.activeToday}</b>
          <span className="kpi__delta">
            {stats.online ? `${stats.online} signed in right now` : 'nobody signed in right now'}
          </span>
        </article>
        <article className="kpi">
          <span className="kpi__label">Time logged in</span>
          <b className="kpi__value">{fmtHours(stats.totalMs)}</b>
          <span className="kpi__delta">across {stats.sessions} sessions</span>
        </article>
        <article className="kpi">
          <span className="kpi__label">Average session</span>
          <b className="kpi__value">
            {stats.sessions ? fmtHours(stats.totalMs / stats.sessions) : '—'}
          </b>
          <span className="kpi__delta">
            {guestSessions.length} guest session{guestSessions.length === 1 ? '' : 's'}
          </span>
        </article>
      </section>

      <div className="admin__charts">
        <ColumnChart
          title="New accounts"
          subtitle="Per day, last 30 days"
          data={signupSeries.map((d, i) => ({
            value: d.value,
            label: fmtDate(d.date),
            tick: i % 7 === 0 ? fmtDate(d.date) : '',
          }))}
          color={SERIES.signups}
          format={(v) => `${Math.round(v)}`}
        />
        <ColumnChart
          title="Time logged in"
          subtitle="Per day, last 14 days"
          data={hoursSeries.map((d, i) => ({
            value: d.value,
            label: fmtDate(d.date),
            tick: i % 3 === 0 ? fmtDate(d.date) : '',
          }))}
          color={SERIES.hours}
          format={fmtHours}
        />
      </div>

      <section className="panel">
        <header className="panel__head">
          <h2>Users</h2>
          <label className="panel__sort">
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="hours">Time logged in</option>
              <option value="seen">Last seen</option>
              <option value="joined">Newest</option>
              <option value="name">Name</option>
            </select>
          </label>
        </header>

        {rows.length === 0 ? (
          <p className="admin__empty">No accounts yet — everyone has been using guest sessions.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th className="num">Scripts</th>
                  <th className="num">Sessions</th>
                  <th className="num">Time logged in</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span className="who">
                        {u.live && <i className="dot" title="Signed in now" />}
                        <b>{u.name}</b>
                        <span>{u.email}</span>
                      </span>
                    </td>
                    <td>{u.role === 'admin' ? <span className="tag">admin</span> : 'member'}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                    <td className="num">{u.scripts}</td>
                    <td className="num">{u.sessions}</td>
                    <td className="num">{fmtHours(u.totalMs)}</td>
                    <td>{fmtAgo(u.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel__head"><h2>Google sign-in</h2></header>
        <div className="pay-setup">
          <label>
            <span>OAuth client ID</span>
            <input
              value={googleId}
              placeholder="1234567890-abc123.apps.googleusercontent.com"
              onChange={(e) => setGoogleId(e.target.value)}
            />
          </label>
          <button
            className="btn btn--primary"
            onClick={() => {
              setGoogleClientId(googleId);
              setGoogleSaved(true);
              setTimeout(() => setGoogleSaved(false), 1800);
            }}
          >
            Save
          </button>
          {googleSaved && <span className="saved">Saved — reload to see the button</span>}
        </div>
        <p className="admin__note" style={{ marginTop: 0 }}>
          {googleConfigured()
            ? 'The “Continue with Google” button is live on the sign-in page. Tokens are verified against Google’s published keys before an account is created.'
            : 'Create an OAuth client (type: Web application) in the Google Cloud console, add this app’s address as an authorised JavaScript origin, and paste the client ID here. The client ID is public — it is not a secret.'}
        </p>
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2>Payments</h2>
          <span className="panel__sort">
            {formatInr(revenue.mrrPaise)} MRR · {revenue.activeSubscribers} active
          </span>
        </header>

        <div className="pay-setup">
          <label>
            <span>Receiving UPI ID</span>
            <input
              value={merchant.vpa}
              placeholder="yourname@okhdfcbank"
              onChange={(e) => setMerchant((m) => ({ ...m, vpa: e.target.value.trim() }))}
            />
          </label>
          <label>
            <span>Payee name</span>
            <input
              value={merchant.payeeName}
              onChange={(e) => setMerchant((m) => ({ ...m, payeeName: e.target.value }))}
            />
          </label>
          <button className="btn btn--primary" onClick={storeMerchant} disabled={!isValidVpa(merchant.vpa)}>
            Save
          </button>
          {merchantSaved && <span className="saved">Saved</span>}
        </div>

        {!isValidVpa(merchant.vpa) && (
          <p className="admin__empty">
            Set the UPI ID that should receive {formatInr(PLAN.amountPaise)} payments — the
            subscribe screen shows nothing to scan until it is set.
          </p>
        )}

        <section className="kpis">
          <article className="kpi">
            <span className="kpi__label">Awaiting verification</span>
            <b className="kpi__value">{revenue.pending}</b>
            <span className="kpi__delta">check each UTR against the bank statement</span>
          </article>
          <article className="kpi">
            <span className="kpi__label">Collected (all time)</span>
            <b className="kpi__value">{formatInr(revenue.collectedPaise)}</b>
            <span className="kpi__delta">{formatInr(revenue.last30Paise)} in the last 30 days</span>
          </article>
          <article className="kpi">
            <span className="kpi__label">Active subscribers</span>
            <b className="kpi__value">{revenue.activeSubscribers}</b>
            <span className="kpi__delta">{formatInr(revenue.mrrPaise)} monthly recurring</span>
          </article>
        </section>

        {payments.length === 0 ? (
          <p className="admin__empty">No payments recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Submitted</th>
                  <th>UTR</th>
                  <th>Reference</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  <th>Period</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...payments].reverse().map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="who">
                        <b>{p.name}</b>
                        <span>{p.email}</span>
                      </span>
                    </td>
                    <td>{fmtDate(p.createdAt)}</td>
                    <td><code>{p.utr}</code></td>
                    <td><code>{p.txnRef}</code></td>
                    <td className="num">{formatInr(p.amountPaise)}</td>
                    <td><span className={`pill pill--${p.status}`}>{p.status}</span></td>
                    <td>
                      {p.periodEnd
                        ? `${fmtDate(p.periodStart)} → ${fmtDate(p.periodEnd)}`
                        : '—'}
                    </td>
                    <td>
                      {p.status === 'pending' && (
                        <span className="pay-actions">
                          <button
                            className="btn btn--primary"
                            onClick={() => { verifyPayment(p.id, session); refresh(); }}
                          >
                            Approve
                          </button>
                          <button
                            className="btn"
                            onClick={() => {
                              const why = window.prompt('Reason for rejecting this payment?') || '';
                              rejectPayment(p.id, why);
                              refresh();
                            }}
                          >
                            Reject
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="admin__note" style={{ marginTop: 14 }}>
          Approving grants one month from today, or from the end of the user's current month if they
          still have time left. Nothing here proves the money arrived — match the UTR against your
          bank statement before approving.
        </p>
      </section>

      <section className="panel">
        <header className="panel__head"><h2>Recent sessions</h2></header>
        {records.length === 0 ? (
          <p className="admin__empty">Nothing logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th className="num">Duration</th>
                </tr>
              </thead>
              <tbody>
                {[...records].reverse().slice(0, 25).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="who">
                        {r.live && <i className="dot" />}
                        <b>{r.name}</b>
                        {r.guest && <span className="tag tag--muted">guest</span>}
                      </span>
                    </td>
                    <td>{new Date(r.startedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>{r.endedAt ? new Date(r.endedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'in progress'}</td>
                    <td className="num">{fmtHours(r.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="admin__note">
        “Time logged in” counts the app being open in a visible tab, sampled every 30 seconds. A
        background tab stops counting, and a session whose heartbeat stops for five minutes is
        closed at its last beat — so a browser that crashed does not read as an endless session.
      </p>
    </div>
  );
}
