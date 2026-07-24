import { useMemo, useState } from 'react';
import {
  toMinor, minor,
  imbalance, reconciles, checkContinuity,
  DEDUCTION_LABELS, DEDUCTION_ORDER,
  type Minor, type DeductionKind, type IncomeKind,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money, formatDateOnly, todayISODate } from '../format.js';

type Mode = 'employment' | 'self_employment';

interface DedRow { kind: DeductionKind; amount: string; }
const emptyDed = (): DedRow => ({ kind: 'federal_tax', amount: '' });

function parseAmount(s: string): Minor | null {
  if (!s.trim()) return null;
  try { return toMinor(s); } catch { return null; }
}

export function Income({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const [mode, setMode] = useState<Mode>('employment');
  const [employer, setEmployer] = useState('');
  const [payDate, setPayDate] = useState(todayISODate());
  const [gross, setGross] = useState('');
  const [net, setNet] = useState('');
  const [ytdGross, setYtdGross] = useState('');
  const [platformFees, setPlatformFees] = useState('');
  const [hst, setHst] = useState('');
  const [deds, setDeds] = useState<DedRow[]>([
    { kind: 'federal_tax', amount: '' },
    { kind: 'provincial_tax', amount: '' },
    { kind: 'cpp', amount: '' },
    { kind: 'ei', amount: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const grossM = parseAmount(gross);
  const netM = parseAmount(net);
  const dedMinors = deds.map((d) => parseAmount(d.amount) ?? minor(0));

  // Live reconciliation (employment only).
  const doc = { income_kind: 'employment' as const, gross_minor: grossM ?? minor(0), net_minor: netM };
  const off = grossM !== null && netM !== null ? imbalance(doc, dedMinors.map((m) => ({ amount_minor: m }))) : null;
  const balanced = grossM !== null && netM !== null && reconciles(doc, dedMinors.map((m) => ({ amount_minor: m })));

  // Merchant-style employer autocomplete over known sources.
  const suggestions = useMemo(() => {
    const q = employer.trim().toLowerCase();
    if (!q) return [];
    return data.incomeSources
      .filter((s) => s.income_kind === mode && s.name.toLowerCase().includes(q) && s.name.toLowerCase() !== q)
      .slice(0, 5);
  }, [employer, data.incomeSources, mode]);

  // YTD continuity preview: does this stub continue the run for this employer?
  const continuity = useMemo(() => {
    const ytdM = parseAmount(ytdGross);
    if (mode !== 'employment' || grossM === null || ytdM === null || !employer.trim()) return null;
    const priors = data.income
      .filter((r) => r.document.income_kind === 'employment' && r.document.employer_name === employer.trim())
      .map((r) => ({ pay_date: r.document.pay_date, gross_minor: r.document.gross_minor, ytd_gross_minor: r.document.ytd_gross_minor }));
    const res = checkContinuity([...priors, { pay_date: payDate, gross_minor: grossM, ytd_gross_minor: ytdM }]);
    if (!res.checked) return null;
    return res;
  }, [mode, grossM, ytdGross, employer, payDate, data.income]);

  function updateDed(i: number, patch: Partial<DedRow>) {
    setDeds((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addDed() { setDeds((rows) => [...rows, emptyDed()]); }
  function removeDed(i: number) {
    setDeds((rows) => { const k = rows.filter((_, idx) => idx !== i); return k.length ? k : [emptyDed()]; });
  }

  function resetForm() {
    setEmployer(''); setGross(''); setNet(''); setYtdGross(''); setPlatformFees(''); setHst('');
    setDeds([{ kind: 'federal_tax', amount: '' }, { kind: 'provincial_tax', amount: '' }, { kind: 'cpp', amount: '' }, { kind: 'ei', amount: '' }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (grossM === null || grossM <= 0) return setErr('Enter a valid gross amount greater than zero');
    if (!employer.trim()) return setErr(mode === 'employment' ? 'Employer is required' : 'Source is required');

    try {
      setBusy(true);
      if (mode === 'employment') {
        if (netM === null) return setErr('Enter the net for the period');
        if (!balanced) return; // guarded by disabled button; belt-and-suspenders
        const deductions = deds
          .map((d) => ({ kind: d.kind, amount_minor: parseAmount(d.amount) }))
          .filter((d): d is { kind: DeductionKind; amount_minor: Minor } => d.amount_minor !== null && d.amount_minor > 0);
        await db.income.create({
          user_id: db.userId,
          income_kind: 'employment',
          employer_name: employer.trim(),
          pay_date: payDate,
          province: data.profile.province,
          gross_minor: grossM,
          net_minor: netM,
          ytd_gross_minor: parseAmount(ytdGross),
          deductions,
        });
      } else {
        await db.income.create({
          user_id: db.userId,
          income_kind: 'self_employment',
          employer_name: employer.trim(),
          pay_date: payDate,
          province: data.profile.province,
          gross_minor: grossM,
          platform_fees_minor: parseAmount(platformFees) ?? minor(0),
          hst_collected_minor: parseAmount(hst) ?? minor(0),
        });
      }
      resetForm();
      await reload();
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  }

  const dedTotalM = minor(dedMinors.reduce((n, m) => n + m, 0));

  return (
    <div className="view">
      <header className="view-head">
        <h1>Income</h1>
        <p className="muted">Manual entry with live reconciliation. Employment stubs must balance before they save.</p>
      </header>

      <section className="panel">
        <div className="mode-tabs">
          {(['employment', 'self_employment'] as Mode[]).map((m) => (
            <button key={m} type="button" className={`mode-tab ${mode === m ? 'active' : ''}`}
              onClick={() => { setMode(m); setErr(null); }}>
              {m === 'employment' ? 'Employment' : 'Self-employment'}
            </button>
          ))}
        </div>

        <form className="entry-form" onSubmit={submit}>
          <div className="field-row">
            <div className="field grow autocomplete">
              <span>{mode === 'employment' ? 'Employer' : 'Source'}</span>
              <input className="input" placeholder={mode === 'employment' ? 'e.g. Maritime Logistics Co' : 'e.g. Uber'}
                value={employer} onChange={(e) => setEmployer(e.target.value)} autoComplete="off" />
              {suggestions.length > 0 && (
                <ul className="suggestions">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); setEmployer(s.name); }}>
                        {s.name}
                        {s.typical_gross_minor != null && <span className="muted"> · usually {money(s.typical_gross_minor)}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="field narrow">
              <span>Pay date</span>
              <input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </label>
            <label className="field narrow">
              <span>Gross</span>
              <input className="input" placeholder="$0.00" value={gross} inputMode="decimal"
                onChange={(e) => setGross(e.target.value)} />
            </label>
          </div>

          {mode === 'employment' ? (
            <>
              <div className="field-row">
                <label className="field narrow">
                  <span>Net</span>
                  <input className="input" placeholder="$0.00" value={net} inputMode="decimal"
                    onChange={(e) => setNet(e.target.value)} />
                </label>
                <label className="field narrow">
                  <span>YTD gross <span className="muted">(optional)</span></span>
                  <input className="input" placeholder="$0.00" value={ytdGross} inputMode="decimal"
                    onChange={(e) => setYtdGross(e.target.value)} />
                </label>
              </div>

              <div className="splits">
                <div className="splits-head"><span>Deductions</span></div>
                {deds.map((d, i) => (
                  <div className="split-row" key={i}>
                    <select className="input grow" value={d.kind}
                      onChange={(e) => updateDed(i, { kind: e.target.value as DeductionKind })}>
                      {DEDUCTION_ORDER.map((k) => <option key={k} value={k}>{DEDUCTION_LABELS[k]}</option>)}
                    </select>
                    <input className="input narrow" placeholder="$" value={d.amount} inputMode="decimal"
                      onChange={(e) => updateDed(i, { amount: e.target.value })} />
                    <button type="button" className="link-btn danger" onClick={() => removeDed(i)}>×</button>
                  </div>
                ))}
                <div className="splits-foot">
                  <button type="button" className="link-btn" onClick={addDed}>+ Add deduction</button>
                  {off !== null && (
                    <span className={`remainder ${off === 0 ? 'ok' : 'over'}`}>
                      {money(grossM!)} − {money(dedTotalM)} = {money(minor(grossM! - dedTotalM))}
                      {off === 0 ? ' · Balances' : ` · Off by ${money(minor(Math.abs(off)))}`}
                    </span>
                  )}
                </div>
              </div>

              {continuity && (
                <p className={continuity.ok ? 'muted' : 'error'} style={{ margin: 0 }}>
                  {continuity.ok
                    ? `Continues the run for ${employer.trim()} ✓`
                    : `YTD gap: expected a stub between ${formatDateOnly(continuity.gaps[0]!.afterPayDate)} and ${formatDateOnly(continuity.gaps[0]!.beforePayDate)} (${money(continuity.gaps[0]!.missingGrossMinor)} unaccounted)`}
                </p>
              )}
            </>
          ) : (
            <div className="field-row">
              <label className="field narrow">
                <span>Platform fees <span className="muted">(optional)</span></span>
                <input className="input" placeholder="$0.00" value={platformFees} inputMode="decimal"
                  onChange={(e) => setPlatformFees(e.target.value)} />
              </label>
              <label className="field narrow">
                <span>HST collected <span className="muted">(optional)</span></span>
                <input className="input" placeholder="$0.00" value={hst} inputMode="decimal"
                  onChange={(e) => setHst(e.target.value)} />
              </label>
            </div>
          )}

          <div className="field-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn primary" disabled={busy || (mode === 'employment' && !balanced)}>
              {busy ? 'Saving…' : mode === 'employment' ? 'Save stub' : 'Save income'}
            </button>
          </div>
          {err && <p className="error">{err}</p>}
        </form>
      </section>

      <section className="panel">
        {data.income.length === 0 ? (
          <div className="empty"><p>No income recorded yet.</p></div>
        ) : (
          <table className="list-table">
            <thead>
              <tr><th>Pay date</th><th>Source</th><th>Kind</th><th className="amount">Gross</th><th className="amount">Net</th><th></th><th></th></tr>
            </thead>
            <tbody>
              {data.income.map((r) => {
                const d = r.document;
                return (
                  <tr key={d.id}>
                    <td className="date">{formatDateOnly(d.pay_date)}</td>
                    <td>{d.employer_name || <span className="muted">—</span>}</td>
                    <td><span className={`pill ${d.income_kind === 'employment' ? 'pill-income' : 'pill-expense'}`}>
                      {d.income_kind === 'employment' ? 'Employment' : 'Self-employed'}</span></td>
                    <td className="amount pos">{money(d.gross_minor)}</td>
                    <td className="amount">{d.net_minor != null ? money(d.net_minor) : <span className="muted">—</span>}</td>
                    <td>{d.income_kind === 'employment' && (d.reconciles
                      ? <span className="chip" style={{ background: 'var(--bg-success)', color: 'var(--text-success)' }}>balances</span>
                      : <span className="chip" style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)' }}>off</span>)}</td>
                    <td className="right"><button className="link-btn danger" onClick={() => del(d.id)}>Delete</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );

  async function del(id: string) {
    await db.income.softDelete(db.userId, id);
    await reload();
  }
}
