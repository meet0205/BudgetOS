import { periodSummary } from '@budgetos/core';
import type { BudgetData, ViewKey } from '../App.js';
import { money, formatDate } from '../format.js';

function monthBounds(now = new Date()): { from: string; to: string; label: string } {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const label = now.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  return { from, to, label };
}

export function Dashboard({ data, onGo }: { data: BudgetData; onGo: (v: ViewKey) => void }) {
  const { from, to, label } = monthBounds();
  const summary = periodSummary(data.transactions, { from, to });
  const recent = data.transactions.slice(0, 6);

  return (
    <div className="view">
      <header className="view-head">
        <h1>Dashboard</h1>
        <p className="muted">{label}</p>
      </header>

      <section className="cards">
        <StatCard label="Spent this month" value={money(summary.netSpend)} tone="spend" />
        <StatCard label="Income this month" value={money(summary.income)} tone="income" />
        <StatCard label="Net" value={money(summary.net)} tone={summary.net >= 0 ? 'income' : 'spend'} />
        <StatCard label="Accounts" value={String(data.accounts.filter((a) => !a.is_archived).length)} />
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
                  <td className={`amount ${t.transaction.kind === 'income' ? 'pos' : 'neg'}`}>
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

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'spend' | 'income' }) {
  return (
    <div className={`stat-card ${tone ?? ''}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
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
