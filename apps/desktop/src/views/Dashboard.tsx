import { periodSummary, type Minor } from '@budgetos/core';
import type { BudgetData, ViewKey } from '../App.js';
import { money, formatDate } from '../format.js';

function monthBounds(now = new Date()): { from: string; to: string; label: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const label = now.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  return { from, to, label };
}

const DONUT_COLORS = ['#7f77dd', '#1d9e75', '#d85a30', '#b4b2a9'];

/** Sum this-period expense-split amounts per category (real spend breakdown). */
function categorySpend(data: BudgetData, from: string, to: string) {
  const totals = new Map<string, number>();
  for (const t of data.transactions) {
    if (t.transaction.kind !== 'expense') continue;
    const at = t.transaction.occurred_at;
    if (at < from || at >= to) continue;
    for (const s of t.splits) {
      const key = s.category_id ?? 'uncategorized';
      totals.set(key, (totals.get(key) ?? 0) + s.amount_minor);
    }
  }
  const named = [...totals.entries()]
    .map(([id, amt]) => ({
      id,
      name: id === 'uncategorized' ? 'Uncategorized' : (data.categories.find((c) => c.id === id)?.display_name ?? '—'),
      amount: amt,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Keep top 3, roll the rest into "Other".
  const top = named.slice(0, 3);
  const restTotal = named.slice(3).reduce((n, r) => n + r.amount, 0);
  const slices = restTotal > 0 ? [...top, { id: 'other', name: 'Other', amount: restTotal }] : top;
  const total = slices.reduce((n, r) => n + r.amount, 0);
  return { slices, total };
}

export function Dashboard({ data, onGo }: { data: BudgetData; onGo: (v: ViewKey) => void }) {
  const { from, to, label } = monthBounds();
  const summary = periodSummary(data.transactions, { from, to });
  const recent = data.transactions.slice(0, 6);
  const { slices, total } = categorySpend(data, from, to);
  const activeAccounts = data.accounts.filter((a) => !a.is_archived).length;

  return (
    <div className="view">
      <header className="view-head">
        <h1>Dashboard</h1>
        <p className="muted">{label}</p>
      </header>

      <section className="cards">
        <StatCard label="Spent this month" value={money(summary.netSpend)} tone="spend" />
        <StatCard label="Income this month" value={money(summary.income)} tone="income" />
        <StatCard
          label="Net"
          value={money(summary.net)}
          tone={summary.net >= 0 ? 'income' : 'spend'}
          sub={summary.net >= 0 ? 'surplus' : 'over'}
          subTone={summary.net >= 0 ? 'good' : 'up'}
        />
        <StatCard label="Accounts" value={String(activeAccounts)} sub="tracked" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Spend by category</h2>
          <span className="muted">{label}</span>
        </div>
        {total === 0 ? (
          <div className="empty" style={{ padding: '24px 10px' }}><p>No spending recorded this month yet.</p></div>
        ) : (
          <div className="donut-card">
            <Donut slices={slices} total={total} />
            <div className="donut-legend">
              {slices.map((s, i) => (
                <div className="legend-row" key={s.id}>
                  <span>
                    <span className="swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    {s.name}
                  </span>
                  <span className="val">{money(s.amount as Minor)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Recent activity</h2>
          <button className="link-btn" onClick={() => onGo('transactions')}>View all →</button>
        </div>
        {recent.length === 0 ? (
          <EmptyState onGo={onGo} />
        ) : (
          <table className="txn-table">
            <tbody>
              {recent.map((t) => (
                <tr key={t.transaction.id}>
                  <td className="date">{formatDate(t.transaction.occurred_at)}</td>
                  <td>
                    <span className={`pill pill-${t.transaction.kind}`}>{t.transaction.kind}</span>
                  </td>
                  <td className="note">{t.transaction.note || <span className="muted">—</span>}</td>
                  <td className={`amount ${t.transaction.kind === 'income' || t.transaction.kind === 'refund' ? 'pos' : 'neg'}`}>
                    {money(t.transaction.total_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Donut({ slices, total }: { slices: { id: string; amount: number }[]; total: number }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="donut">
      {slices.map((s, i) => {
        const frac = s.amount / total;
        const dash = frac * c;
        const el = (
          <circle
            key={s.id}
            cx="50" cy="50" r={r} fill="none"
            stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
            strokeWidth="17"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function StatCard({
  label, value, tone, sub, subTone,
}: {
  label: string; value: string; tone?: 'spend' | 'income';
  sub?: string; subTone?: 'up' | 'good';
}) {
  return (
    <div className={`stat-card ${tone ?? ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className={`stat-sub ${subTone ?? ''}`}>{sub}</div>}
    </div>
  );
}

function EmptyState({ onGo }: { onGo: (v: ViewKey) => void }) {
  return (
    <div className="empty">
      <p>No transactions yet.</p>
      <button className="btn" onClick={() => onGo('transactions')}>Add your first transaction</button>
    </div>
  );
}
