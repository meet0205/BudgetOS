import { useState } from 'react';
import {
  goalProgress, remaining, monthsBetween, monthlyForDate, monthsForMonthly, addMonths,
  toMinor, minor,
  type Goal, type Minor,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money, formatDateOnly, todayISODate } from '../format.js';

function parseAmount(s: string): Minor | null {
  if (!s.trim()) return null;
  try { return toMinor(s); } catch { return null; }
}

function monthLabel(ymd: string): string {
  return new Date(ymd + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', year: 'numeric' });
}

/** Whole months from `later` back to `earlier` (positive when earlier is sooner). */
function monthsDiff(later: string, earlier: string): number {
  const [ly, lm] = later.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  const [ey, em] = earlier.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  return (ly! - ey!) * 12 + (lm! - em!);
}

export function Goals({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const today = todayISODate();

  return (
    <div className="view">
      <header className="view-head">
        <h1>Goals</h1>
        <p className="muted">A goal turns saving into a number with a date. Set a target date or a monthly amount — each solves for the other.</p>
      </header>

      <section className="panel">
        <div className="panel-head"><h2>Active goals</h2></div>
        {data.goals.length === 0 ? (
          <div className="empty" style={{ padding: '24px 10px' }}><p>No goals yet. Add one below.</p></div>
        ) : (
          <div className="goal-list">
            {data.goals.map((g) => <GoalCard key={g.id} goal={g} today={today} reload={reload} />)}
          </div>
        )}
        <GoalEditor onAdd={reload} />
      </section>
    </div>
  );
}

function GoalCard({ goal, today, reload }: { goal: Goal; today: string; reload: () => Promise<void> }) {
  const [contrib, setContrib] = useState('');
  const [whatIf, setWhatIf] = useState('');
  const pct = goalProgress(goal.current_minor, goal.target_minor);
  const achieved = goal.achieved_at !== null;

  // Derive whichever field wasn't entered.
  let monthly: Minor | null = goal.monthly_contribution_minor;
  let projected: string | null = goal.target_date;
  if (goal.target_date && monthly === null) {
    monthly = monthlyForDate(goal.target_minor, goal.current_minor, monthsBetween(today, goal.target_date));
  } else if (monthly !== null && projected === null) {
    const months = monthsForMonthly(goal.target_minor, goal.current_minor, monthly);
    projected = Number.isFinite(months) ? addMonths(today, months) : null;
  }

  async function add() {
    const amt = parseAmount(contrib);
    if (amt === null || amt <= 0) return;
    await db.goals.contribute(db.userId, goal.id, amt, today);
    setContrib('');
    await reload();
  }

  // Trade-off (Feature 24): a what-if monthly contribution → resulting target date.
  const whatIfMinor = parseAmount(whatIf);
  const whatIfMonths = whatIfMinor && whatIfMinor > 0 ? monthsForMonthly(goal.target_minor, goal.current_minor, whatIfMinor) : null;
  const whatIfDate = whatIfMonths != null && Number.isFinite(whatIfMonths) ? addMonths(today, whatIfMonths) : null;
  const baseDate = projected;
  const monthsSooner = whatIfDate && baseDate ? monthsDiff(baseDate, whatIfDate) : null;

  return (
    <div className="goal-card">
      <div className="goal-top">
        <span className="goal-name">{goal.name}{achieved && <span className="tag cra" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>reached</span>}</span>
        <span className="goal-amt">{money(goal.current_minor)} / {money(goal.target_minor)}</span>
      </div>
      <div className="bar" style={{ height: 6 }}>
        <div className="bar-fill" style={{ width: `${pct}%`, background: achieved ? 'var(--fill-success)' : 'var(--fill-accent)' }} />
      </div>
      <div className="goal-meta">
        <span>{monthly != null ? `${money(monthly)} / month` : '—'}</span>
        <span className="muted">
          {achieved ? 'Complete' : projected ? `${monthLabel(projected)}` : 'set a date or monthly amount'}
          {!achieved && remaining(goal.target_minor, goal.current_minor) > 0 && ` · ${money(remaining(goal.target_minor, goal.current_minor))} to go`}
        </span>
      </div>
      {!achieved && (
        <>
          <div className="goal-actions">
            <input className="input tiny" placeholder="$" value={contrib} inputMode="decimal"
              onChange={(e) => setContrib(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
            <button type="button" className="link-btn" onClick={add}>Contribute</button>
            <button type="button" className="link-btn danger" style={{ marginLeft: 'auto' }} onClick={async () => { await db.goals.remove(db.userId, goal.id); await reload(); }}>Remove</button>
          </div>
          <div className="goal-tradeoff">
            <span className="muted">What-if</span>
            <input className="input tiny" placeholder="$/mo" value={whatIf} inputMode="decimal" onChange={(e) => setWhatIf(e.target.value)} />
            <span className="muted">
              {whatIfDate
                ? `reaches ${monthLabel(whatIfDate)}${monthsSooner != null && monthsSooner !== 0 ? ` · ${Math.abs(monthsSooner)} mo ${monthsSooner > 0 ? 'sooner' : 'later'}` : ''}`
                : 'try a monthly amount'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function GoalEditor({ onAdd }: { onAdd: () => Promise<void> }) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [by, setBy] = useState<'date' | 'monthly'>('date');
  const [value, setValue] = useState(''); // a date (yyyy-mm-dd) or a monthly $ amount
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('Name is required');
    const tgt = parseAmount(target);
    if (tgt === null || tgt <= 0) return setErr('Enter a target amount');
    try {
      setBusy(true);
      const input: Parameters<typeof db.goals.create>[1] = { name: name.trim(), target_minor: tgt };
      if (by === 'date') {
        if (!value) return setErr('Pick a target date');
        input.target_date = value;
      } else {
        const m = parseAmount(value);
        if (m === null || m <= 0) return setErr('Enter a monthly amount');
        input.monthly_contribution_minor = m;
      }
      await db.goals.create(db.userId, input);
      setName(''); setTarget(''); setValue('');
      await onAdd();
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="row-form" onSubmit={add} style={{ marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
      <input className="input grow" placeholder="Goal name (e.g. Used car)" value={name} onChange={(e) => setName(e.target.value)} />
      <input className="input narrow" placeholder="Target $" value={target} inputMode="decimal" onChange={(e) => setTarget(e.target.value)} />
      <select className="input" value={by} onChange={(e) => { setBy(e.target.value as 'date' | 'monthly'); setValue(''); }}>
        <option value="date">By target date</option>
        <option value="monthly">By monthly $</option>
      </select>
      {by === 'date'
        ? <input className="input" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        : <input className="input narrow" placeholder="Monthly $" value={value} inputMode="decimal" onChange={(e) => setValue(e.target.value)} />}
      <button className="btn" disabled={busy}>Add goal</button>
      {err && <p className="error" style={{ width: '100%' }}>{err}</p>}
    </form>
  );
}
