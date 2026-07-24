import { useMemo, useState } from 'react';
import {
  generateDueDates, billState, matchesInstance, detectSubscriptions,
  toMinor, minor, sum,
  type BillFrequency, type BillState, type RecurringBill, type Minor,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money, formatDateOnly, todayISODate } from '../format.js';

const FREQ_LABEL: Record<BillFrequency, string> = {
  weekly: 'weekly', biweekly: 'biweekly', monthly: 'monthly', yearly: 'yearly',
};
const STATE_LABEL: Record<BillState, string> = {
  upcoming: 'Upcoming', due: 'Due soon', paid: 'Paid', skipped: 'Skipped', overdue: 'Overdue',
};

const HORIZON_DAYS = 45;

function parseAmount(s: string): Minor | null {
  if (!s.trim()) return null;
  try { return toMinor(s); } catch { return null; }
}

interface UpcomingRow {
  bill: RecurringBill;
  dueDate: string;
  state: BillState;
  paidMinor: Minor | null;
}

export function Bills({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const today = todayISODate();
  const activeBills = data.bills.filter((b) => b.is_active);

  const rows: UpcomingRow[] = useMemo(() => {
    const out: UpcomingRow[] = [];
    for (const bill of activeBills) {
      for (const dueDate of generateDueDates(bill, today, HORIZON_DAYS)) {
        // A bill instance counts as paid when a ledger transaction matches it.
        const match = data.transactions.find((t) =>
          matchesInstance(bill, dueDate, {
            merchant_id: t.transaction.merchant_id,
            total_minor: t.transaction.total_minor,
            occurred_at: t.transaction.occurred_at,
          }),
        );
        out.push({
          bill,
          dueDate,
          state: billState({ dueDate, todayISO: today, paid: !!match, dateToleranceDays: bill.date_tolerance_days }),
          paidMinor: match ? match.transaction.total_minor : null,
        });
      }
    }
    return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [activeBills, data.transactions, today]);

  const upcomingTotal = sum(rows.filter((r) => r.state !== 'paid').map((r) => r.bill.expected_minor));

  return (
    <div className="view">
      <header className="view-head">
        <h1>Bills</h1>
        <p className="muted">Recurring bills and what’s due. A safe-to-spend figure that ignores rent due in three days is lying.</p>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h2>Next {HORIZON_DAYS} days</h2>
          <span className="muted">{money(upcomingTotal)} upcoming</span>
        </div>
        {rows.length === 0 ? (
          <div className="empty" style={{ padding: '24px 10px' }}><p>No bills yet. Add one below to track what’s due.</p></div>
        ) : (
          <table className="list-table">
            <thead><tr><th>Due</th><th>Bill</th><th>Schedule</th><th className="amount">Expected</th><th></th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.bill.id + r.dueDate} className={r.state === 'overdue' ? 'reserve-row' : ''}>
                  <td className="date">{formatDateOnly(r.dueDate)}</td>
                  <td>{r.bill.name}</td>
                  <td className="muted">
                    {r.bill.interval > 1 ? `every ${r.bill.interval} ` : ''}{FREQ_LABEL[r.bill.frequency]}
                  </td>
                  <td className="amount">
                    {money(r.bill.expected_minor)}
                    {r.paidMinor != null && r.paidMinor !== r.bill.expected_minor && (
                      <span className="short-note"> paid {money(r.paidMinor)}</span>
                    )}
                  </td>
                  <td><span className={`pill ${pillClass(r.state)}`}>{STATE_LABEL[r.state]}</span></td>
                  <td className="right">
                    {i === firstIndexForBill(rows, r.bill.id) && (
                      <button className="link-btn danger" onClick={() => del(r.bill.id)}>Remove</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <BillEditor onAdd={reload} today={today} />
      </section>

      <Subscriptions data={data} reload={reload} today={today} />
    </div>
  );

  async function del(id: string) {
    await db.bills.remove(db.userId, id);
    await reload();
  }
}

function cadenceLabel(days: number): string {
  if (days >= 350) return 'yearly';
  if (days >= 25 && days <= 35) return 'monthly';
  if (days >= 12 && days <= 16) return 'biweekly';
  if (days >= 6 && days <= 8) return 'weekly';
  return `~${days}d`;
}

function Subscriptions({ data, reload, today }: { data: BudgetData; reload: () => Promise<void>; today: string }) {
  const subs = detectSubscriptions(data.transactions);
  const merchName = (id: string) => data.merchants.find((m) => m.id === id)?.name ?? '—';
  const trackedMerchantIds = new Set(data.bills.map((b) => b.merchant_id).filter(Boolean));
  const untracked = subs.filter((s) => !trackedMerchantIds.has(s.merchantId));

  if (untracked.length === 0) return null;

  async function track(merchantId: string, typical: Minor, days: number) {
    const freq: BillFrequency = days >= 350 ? 'yearly' : days >= 12 && days <= 16 ? 'biweekly' : days >= 6 && days <= 8 ? 'weekly' : 'monthly';
    await db.bills.create(db.userId, {
      name: merchName(merchantId), expected_minor: typical, frequency: freq, starts_on: today,
      merchant_id: merchantId,
    });
    await reload();
  }

  return (
    <section className="panel">
      <div className="panel-head"><h2>Detected subscriptions</h2><span className="muted">recurring charges you’re not tracking</span></div>
      <table className="list-table">
        <thead><tr><th>Merchant</th><th>Cadence</th><th className="amount">Typical</th><th className="amount">Seen</th><th></th></tr></thead>
        <tbody>
          {untracked.map((s) => (
            <tr key={s.merchantId}>
              <td>{merchName(s.merchantId)}</td>
              <td className="muted">{cadenceLabel(s.avgIntervalDays)}</td>
              <td className="amount">{money(s.typicalMinor)}</td>
              <td className="amount muted">{s.occurrences}×</td>
              <td className="right"><button className="link-btn" onClick={() => track(s.merchantId, s.typicalMinor, s.avgIntervalDays)}>Track as bill</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function firstIndexForBill(rows: UpcomingRow[], billId: string): number {
  return rows.findIndex((r) => r.bill.id === billId);
}

function pillClass(state: BillState): string {
  if (state === 'paid') return 'pill-income';
  if (state === 'overdue') return 'pill-expense';
  if (state === 'due') return 'pill-transfer';
  return '';
}

function BillEditor({ onAdd, today }: { onAdd: () => Promise<void>; today: string }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<BillFrequency>('monthly');
  const [startsOn, setStartsOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('Name is required');
    const amt = parseAmount(amount);
    if (amt === null || amt <= 0) return setErr('Enter an expected amount');
    const [, m, d] = startsOn.split('-').map((n) => parseInt(n, 10));
    try {
      setBusy(true);
      await db.bills.create(db.userId, {
        name: name.trim(),
        expected_minor: amt,
        frequency,
        starts_on: startsOn,
        // Monthly/yearly key off the day-of-month; weekly/biweekly off the start weekday.
        day_of_month: frequency === 'monthly' || frequency === 'yearly' ? d! : null,
      });
      setName(''); setAmount('');
      await onAdd();
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="row-form" onSubmit={add} style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
      <input className="input grow" placeholder="Bill name (e.g. Rent)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input narrow" placeholder="Expected $" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
      <select className="input" value={frequency} onChange={(e) => setFrequency(e.target.value as BillFrequency)}>
        <option value="weekly">Weekly</option>
        <option value="biweekly">Biweekly</option>
        <option value="monthly">Monthly</option>
        <option value="yearly">Yearly</option>
      </select>
      <label className="field" style={{ gap: 2 }}>
        <span style={{ fontSize: 10 }}>First due</span>
        <input className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
      </label>
      <button className="btn" disabled={busy}>Add bill</button>
      {err && <p className="error" style={{ width: '100%' }}>{err}</p>}
    </form>
  );
}
