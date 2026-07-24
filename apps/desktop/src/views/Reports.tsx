import { useMemo, useState } from 'react';
import {
  periodFor, periodSummary, categoryTotals, priorYearPeriod, toCSV,
  type Minor,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { money, todayISODate } from '../format.js';

const DONUT_COLORS = ['#7f77dd', '#1d9e75', '#d85a30', '#ef9f27', '#378add', '#b4b2a9'];

type Mode = 'monthly' | 'yoy';

export function Reports({ data }: { data: BudgetData }) {
  const [mode, setMode] = useState<Mode>('monthly');
  const today = todayISODate();
  const period = periodFor(today, data.profile.month_start_day);
  const from = period.start + 'T00:00:00.000Z';
  const to = period.end + 'T00:00:00.000Z';
  // Label from local-noon to avoid a UTC-midnight date-string rendering the prior day.
  const monthLabel = (ymd: string) => new Date(ymd + 'T12:00:00').toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  const label = monthLabel(period.start);

  const catName = (id: string) =>
    id === 'uncategorized' ? 'Uncategorized' : (data.categories.find((c) => c.id === id)?.display_name ?? '—');

  const summary = useMemo(() => periodSummary(data.transactions, { from, to }), [data.transactions, from, to]);
  const cats = useMemo(() => categoryTotals(data.transactions, from, to), [data.transactions, from, to]);
  const maxCat = cats.reduce((m, c) => Math.max(m, c.total), 0);

  const prior = priorYearPeriod(from, to);
  const priorSummary = useMemo(
    () => periodSummary(data.transactions, { from: prior.from, to: prior.to }),
    [data.transactions, prior.from, prior.to],
  );
  const priorLabel = monthLabel(prior.from.slice(0, 10));
  const spendDelta = summary.netSpend - priorSummary.netSpend;

  function exportCSV() {
    const rows: (string | number)[][] = cats.map((c) => [catName(c.categoryId), (c.total / 100).toFixed(2), c.count]);
    const csv = toCSV(['Category', 'Spend', 'Transactions'], rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budgetos-${period.start}-categories.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Reports</h1>
        <p className="muted">Where the money went. Transfers excluded from spend; refunds reduce their category.</p>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div className="segmented" style={{ marginBottom: 0 }}>
          <button className={mode === 'monthly' ? 'active' : ''} onClick={() => setMode('monthly')}>Monthly</button>
          <button className={mode === 'yoy' ? 'active' : ''} onClick={() => setMode('yoy')}>Year over year</button>
        </div>
        <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={exportCSV}>Export CSV</button>
      </div>

      <section className="cards" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="stat-card"><div className="stat-label">Income · {label}</div><div className="stat-value">{money(summary.income)}</div></div>
        <div className="stat-card"><div className="stat-label">Spend · {label}</div><div className="stat-value">{money(summary.netSpend)}</div>
          {mode === 'yoy' && <div className={`stat-sub ${spendDelta > 0 ? 'up' : 'good'}`}>{spendDelta >= 0 ? '+' : '−'}{money(Math.abs(spendDelta) as Minor)} vs {priorLabel}</div>}
        </div>
        <div className="stat-card"><div className="stat-label">Net · {label}</div><div className="stat-value">{money(summary.net)}</div></div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Spend by category</h2><span className="muted">{label}</span></div>
        {cats.length === 0 ? (
          <div className="empty" style={{ padding: '24px 10px' }}><p>No spending recorded this period.</p></div>
        ) : (
          <table className="list-table">
            <thead><tr><th>Category</th><th></th><th className="amount">Spend</th><th className="amount">Txns</th></tr></thead>
            <tbody>
              {cats.map((c, i) => (
                <tr key={c.categoryId}>
                  <td><span className="swatch" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 7, background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{catName(c.categoryId)}</td>
                  <td style={{ width: '40%' }}>
                    <div className="bar"><div className="bar-fill" style={{ width: `${maxCat > 0 ? (c.total / maxCat) * 100 : 0}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }} /></div>
                  </td>
                  <td className="amount">{money(c.total)}</td>
                  <td className="amount muted">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {mode === 'yoy' && (
        <section className="panel">
          <div className="panel-head"><h2>vs {priorLabel}</h2></div>
          <div className="sts-row"><span className="muted">Income</span><span>{money(priorSummary.income)} → {money(summary.income)}</span></div>
          <div className="sts-row"><span className="muted">Spend</span><span>{money(priorSummary.netSpend)} → {money(summary.netSpend)}</span></div>
          <div className="sts-row"><span className="muted">Net</span><span>{money(priorSummary.net)} → {money(summary.net)}</span></div>
        </section>
      )}
    </div>
  );
}
