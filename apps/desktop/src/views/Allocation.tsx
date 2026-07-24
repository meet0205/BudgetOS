import { useEffect, useMemo, useState } from 'react';
import {
  periodFor, fundBuckets, computeSafeToSpend, receivedIncomeMinor,
  needsReserveBucket, canDeleteBucket, isReserveBucket, periodSummary,
  toMinor, minor,
  type AllocationMode, type AllocationBucket, type Minor,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money, todayISODate } from '../format.js';

const MODE_LABEL: Record<AllocationMode, string> = {
  fixed: 'Fixed',
  percent_of_income: '% of income',
  remainder: 'Remainder',
};

function parseAmount(s: string): Minor | null {
  if (!s.trim()) return null;
  try { return toMinor(s); } catch { return null; }
}

export function Allocation({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const today = todayISODate();
  const period = periodFor(today, data.profile.month_start_day);
  const docs = data.income.map((r) => r.document);
  const activeBuckets = data.buckets.filter((b) => !b.is_archived);

  const income = receivedIncomeMinor(docs, period);
  const spent = useMemo(() => {
    const from = period.start + 'T00:00:00.000Z';
    const to = period.end + 'T00:00:00.000Z';
    return periodSummary(data.transactions, { from, to }).netSpend;
  }, [data.transactions, period.start, period.end]);

  const funding = useMemo(() => fundBuckets(activeBuckets, income), [activeBuckets, income]);
  const sts = useMemo(
    () => computeSafeToSpend({ incomeMinor: income, funding, spentMinor: spent, period, asOfISO: today }),
    [income, funding, spent, period.start, period.end, today],
  );

  // Auto-create the tax reserve once self-employment income appears. Idempotent;
  // the condition flips false after creation, so this can't loop.
  useEffect(() => {
    if (needsReserveBucket(data.buckets, docs)) {
      db.buckets.ensureReserveBucket(db.userId).then(reload).catch(() => {});
    }
  }, [data.buckets, data.income]);

  return (
    <div className="view">
      <header className="view-head">
        <h1>Allocation</h1>
        <p className="muted">Buckets take their share of income in funding order. What’s left is safe to spend.</p>
      </header>

      <div className="alloc-grid">
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head"><h2>Funding order</h2><span className="muted">{money(income)} income this period</span></div>
          {activeBuckets.length === 0 ? (
            <div className="empty" style={{ padding: '24px 10px' }}><p>No buckets yet. Add one to start allocating income.</p></div>
          ) : (
            <table className="list-table">
              <thead><tr><th>Bucket</th><th>Mode</th><th>Funded</th><th className="amount">Target</th><th></th></tr></thead>
              <tbody>
                {funding.lines.map((l) => {
                  const bucket = data.buckets.find((b) => b.id === l.bucketId)!;
                  const pct = l.targetMinor > 0 ? Math.min(100, Math.round((l.fundedMinor / l.targetMinor) * 100)) : 100;
                  const full = l.shortfallMinor === 0;
                  return (
                    <tr key={l.bucketId} className={l.isTaxReserve ? 'reserve-row' : ''}>
                      <td>
                        {l.isTaxReserve && <span title="System — locked while self-employment income exists">🔒 </span>}
                        {l.name}
                        {l.isTaxReserve && <span className="tag cra">System</span>}
                      </td>
                      <td className="muted">{MODE_LABEL[l.mode]}</td>
                      <td>
                        {l.mode === 'remainder' ? (
                          <span className="muted">{money(l.fundedMinor)}</span>
                        ) : (
                          <div className="bar" title={`${money(l.fundedMinor)} of ${money(l.targetMinor)}`}>
                            <div className={`bar-fill ${full ? 'ok' : 'short'}`} style={{ width: `${pct}%` }} />
                          </div>
                        )}
                        {l.shortfallMinor > 0 && <span className="short-note">short {money(l.shortfallMinor)}</span>}
                      </td>
                      <td className="amount">{l.mode === 'remainder' ? '—' : money(l.targetMinor)}</td>
                      <td className="right">
                        {canDeleteBucket(bucket, docs)
                          ? <button className="link-btn danger" onClick={() => del(l.bucketId)}>Remove</button>
                          : <span className="muted" title="Locked while self-employment income exists">locked</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <BucketEditor onAdd={reload} />
        </section>

        <section className="panel sts-card" style={{ margin: 0 }}>
          <div className="muted">Income this period</div>
          <div className="sts-income">{money(income)}</div>
          <div className="sts-breakdown">
            <Row label="− Allocated" value={money(funding.allocatedMinor)} />
            <Row label="− Tax reserve" value={money(funding.taxReservedMinor)} />
            <Row label="− Spent" value={money(spent)} />
          </div>
          <div className="muted" style={{ marginTop: 10 }}>Safe to spend</div>
          <div className={`sts-big ${sts.safeToSpendMinor < 0 ? 'neg' : ''}`}>{money(sts.safeToSpendMinor)}</div>
          <div className="muted">{money(sts.dailyMinor)} / day · {sts.daysRemaining} days left</div>
        </section>
      </div>
    </div>
  );

  async function del(id: string) {
    await db.buckets.remove(db.userId, id);
    await reload();
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sts-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function BucketEditor({ onAdd }: { onAdd: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<AllocationMode>('fixed');
  const [amount, setAmount] = useState(''); // $ for fixed, % for percent, weight for remainder
  const [priority, setPriority] = useState('100');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('Name is required');
    const prio = parseInt(priority || '100', 10);
    try {
      setBusy(true);
      const input: Parameters<typeof db.buckets.create>[1] = { name: name.trim(), mode, priority: prio };
      if (mode === 'fixed') {
        const t = parseAmount(amount);
        if (t === null || t <= 0) return setErr('Enter a target amount');
        input.target_minor = t;
      } else if (mode === 'percent_of_income') {
        const pct = Number(amount);
        if (!(pct > 0 && pct <= 100)) return setErr('Enter a percent between 0 and 100');
        input.percent = pct;
      } else {
        const w = Number(amount || '1');
        if (!(w > 0)) return setErr('Enter a positive weight');
        input.weight = w;
      }
      await db.buckets.create(db.userId, input);
      setName(''); setAmount('');
      await onAdd();
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  const amountPlaceholder = mode === 'fixed' ? 'Target $' : mode === 'percent_of_income' ? 'Percent %' : 'Weight';

  return (
    <form className="row-form" onSubmit={add} style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
      <input className="input grow" placeholder="Bucket name (e.g. Emergency fund)" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="input" value={mode} onChange={(e) => setMode(e.target.value as AllocationMode)}>
        <option value="fixed">Fixed</option>
        <option value="percent_of_income">% of income</option>
        <option value="remainder">Remainder</option>
      </select>
      <input className="input narrow" placeholder={amountPlaceholder} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
      <input className="input tiny" placeholder="Priority" value={priority} inputMode="numeric" onChange={(e) => setPriority(e.target.value)} title="Lower funds first" />
      <button className="btn" disabled={busy}>Add bucket</button>
      {err && <p className="error" style={{ width: '100%' }}>{err}</p>}
    </form>
  );
}
