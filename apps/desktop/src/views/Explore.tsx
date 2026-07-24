import { useMemo, useState } from 'react';
import { toMinor, minor, sum, toCSV, type Minor } from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { money, formatDate } from '../format.js';

function parseAmount(s: string): Minor | null {
  if (!s.trim()) return null;
  try { return toMinor(s); } catch { return null; }
}

export function Explore({ data }: { data: BudgetData }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bizOnly, setBizOnly] = useState(false);

  const txnCategories = data.categories.filter((c) => c.layer === 'transaction' && !c.is_hidden);
  const catName = (id: string | null) => (id ? data.categories.find((c) => c.id === id)?.display_name ?? '—' : '—');
  const acctName = (id: string | null) => (id ? data.accounts.find((a) => a.id === id)?.name ?? '—' : '—');
  const merchName = (id: string | null) => (id ? data.merchants.find((m) => m.id === id)?.name ?? '' : '');

  const min = parseAmount(minAmt);
  const max = parseAmount(maxAmt);

  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return data.transactions.filter((t) => {
      const tx = t.transaction;
      if (kind && tx.kind !== kind) return false;
      if (accountId && tx.account_id !== accountId) return false;
      if (categoryId && !t.splits.some((s) => s.category_id === categoryId)) return false;
      if (bizOnly && !t.splits.some((s) => s.business_use_percent > 0)) return false;
      if (min !== null && tx.total_minor < min) return false;
      if (max !== null && tx.total_minor > max) return false;
      if (from && tx.occurred_at < from + 'T00:00:00.000Z') return false;
      if (to && tx.occurred_at >= to + 'T23:59:59.999Z') return false;
      if (ql) {
        const hay = `${merchName(tx.merchant_id)} ${tx.note ?? ''}`.toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [data.transactions, q, kind, categoryId, accountId, min, max, from, to, bizOnly]);

  const total = sum(results.map((t) => t.transaction.total_minor));
  const avg = results.length ? minor(Math.round(total / results.length)) : minor(0);

  // Store (merchant) breakdown of the result set.
  const byStore = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of results) {
      const nm = merchName(t.transaction.merchant_id) || '—';
      map.set(nm, (map.get(nm) ?? 0) + t.transaction.total_minor);
    }
    return [...map.entries()].map(([name, v]) => ({ name, total: minor(v) })).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [results]);

  const anyFilter = q || kind || categoryId || accountId || minAmt || maxAmt || from || to || bizOnly;
  function clearAll() { setQ(''); setKind(''); setCategoryId(''); setAccountId(''); setMinAmt(''); setMaxAmt(''); setFrom(''); setTo(''); setBizOnly(false); }

  function exportCSV() {
    const rows: (string | number)[][] = results.map((t) => [
      formatDate(t.transaction.occurred_at), t.transaction.kind, merchName(t.transaction.merchant_id),
      t.splits.length > 1 ? `${t.splits.length} splits` : catName(t.splits[0]?.category_id ?? null),
      acctName(t.transaction.account_id), (t.transaction.total_minor / 100).toFixed(2),
    ]);
    const csv = toCSV(['Date', 'Kind', 'Merchant', 'Category', 'Account', 'Amount'], rows);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'budgetos-explore.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="view">
      <header className="view-head">
        <h1>Explore</h1>
        <p className="muted">Filter the ledger by any combination. Item-level (product) filtering arrives with receipt capture.</p>
      </header>

      <section className="panel">
        <div className="explore-filters">
          <input className="input grow" placeholder="Search merchant or note" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">Any kind</option>
            <option value="expense">Expense</option><option value="income">Income</option>
            <option value="transfer">Transfer</option><option value="refund">Refund</option>
          </select>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Any category</option>
            {txnCategories.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Any account</option>
            {data.accounts.filter((a) => !a.is_archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="explore-filters" style={{ marginTop: 8 }}>
          <input className="input narrow" placeholder="Min $" value={minAmt} inputMode="decimal" onChange={(e) => setMinAmt(e.target.value)} />
          <input className="input narrow" placeholder="Max $" value={maxAmt} inputMode="decimal" onChange={(e) => setMaxAmt(e.target.value)} />
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To" />
          <label className="biz-toggle"><input type="checkbox" checked={bizOnly} onChange={(e) => setBizOnly(e.target.checked)} />Business use</label>
          {anyFilter && <button className="link-btn" onClick={clearAll}>Clear</button>}
          <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={exportCSV}>Export CSV</button>
        </div>
      </section>

      <section className="cards" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <div className="stat-card"><div className="stat-label">Total</div><div className="stat-value">{money(total)}</div></div>
        <div className="stat-card"><div className="stat-label">Matches</div><div className="stat-value">{results.length}</div></div>
        <div className="stat-card"><div className="stat-label">Average</div><div className="stat-value">{money(avg)}</div></div>
      </section>

      <div className="tax-grid">
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head"><h2>Results</h2></div>
          {results.length === 0 ? (
            <div className="empty" style={{ padding: '24px 10px' }}><p>No transactions match these filters.</p></div>
          ) : (
            <table className="list-table">
              <thead><tr><th>Date</th><th>Merchant</th><th>Category</th><th className="amount">Amount</th></tr></thead>
              <tbody>
                {results.slice(0, 50).map((t) => (
                  <tr key={t.transaction.id}>
                    <td className="date">{formatDate(t.transaction.occurred_at)}</td>
                    <td>{merchName(t.transaction.merchant_id) || <span className="muted">—</span>}</td>
                    <td>{t.splits.length > 1 ? <span className="muted">Split ×{t.splits.length}</span> : <span className="chip">{catName(t.splits[0]?.category_id ?? null)}</span>}</td>
                    <td className="amount">{money(t.transaction.total_minor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head"><h2>By store</h2></div>
          {byStore.length === 0 ? <div className="empty" style={{ padding: 16 }}><p>—</p></div> : byStore.map((s) => (
            <div className="sts-row" key={s.name}><span className="muted">{s.name}</span><span>{money(s.total)}</span></div>
          ))}
        </section>
      </div>
    </div>
  );
}
