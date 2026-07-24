import { useEffect, useMemo } from 'react';
import {
  jurisdictionsFor, contributionsFor, computeTaxEstimate, instalmentDueDates,
  isReserveBucket, type Minor,
} from '@budgetos/core';
import type { BudgetData } from '../App.js';
import { db } from '../db.js';
import { money, formatDateOnly, todayISODate } from '../format.js';

export function Tax({ data, reload }: { data: BudgetData; reload: () => Promise<void> }) {
  const today = todayISODate();
  const taxYear = new Date(today + 'T12:00:00').getFullYear();
  const province = data.profile.province;

  const jur = jurisdictionsFor(taxYear, province);
  const contributions = contributionsFor(taxYear);

  const estimate = useMemo(() => {
    if (!jur || !contributions) return null;
    return computeTaxEstimate({
      incomes: data.income, taxYear, province, asOf: today,
      federal: jur.federal, provincial: jur.provincial, contributions,
    });
  }, [data.income, jur, contributions, taxYear, province, today]);

  // Keep the allocation tax-reserve bucket's target in sync with the estimate.
  const reserveBucket = data.buckets.find((b) => isReserveBucket(b));
  useEffect(() => {
    if (estimate && reserveBucket && reserveBucket.target_minor !== estimate.reserveTargetMinor) {
      db.buckets.update(db.userId, reserveBucket.id, { target_minor: estimate.reserveTargetMinor })
        .then(reload).catch(() => {});
    }
  }, [estimate?.reserveTargetMinor, reserveBucket?.id, reserveBucket?.target_minor]);

  if (!jur || !contributions) {
    return (
      <div className="view">
        <header className="view-head">
          <h1>Tax</h1>
          <p className="muted">Annual tax position — a planning estimate, not a filing.</p>
        </header>
        <div className="preview-panel">
          <span className="preview-tag">No rate data</span>
          <p className="preview-lead">No verified tax data for {province} {taxYear}.</p>
          <p className="muted">Rates must be populated from CRA sources before an estimate can be shown.</p>
        </div>
      </div>
    );
  }

  const e = estimate!;
  const owing = e.shortfallMinor;
  const stale = isStale(e.verifiedOn, today);
  const liability = e.totalLiabilityMinor;
  const withheldPct = liability > 0 ? Math.round((e.alreadyWithheldMinor / liability) * 100) : 0;
  const reservePct = liability > 0 ? Math.round((e.reserveTargetMinor / liability) * 100) : 0;

  return (
    <div className="view">
      <header className="view-head">
        <h1>Tax</h1>
        <p className="muted">A planning estimate — not a filing. The app never states what you owe CRA, only what it estimates.</p>
      </header>

      <section className="panel">
        <div className="tax-head">
          <div>
            <div className="muted">Estimated {owing >= 0 ? 'still owing at filing' : 'refund at filing'}</div>
            <div className="tax-big">{money(Math.abs(owing) as Minor)}</div>
            <div className="muted">Planning estimate · rates verified {formatDateOnly(e.verifiedOn)}{stale ? ' · stale, re-check CRA' : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="muted">Reserve target</div>
            <div className="tax-mid">{money(e.reserveTargetMinor)}</div>
            <div className="muted">shortfall × {e.reserveMultiplier.toFixed(2)}</div>
          </div>
        </div>

        <div className="tax-bar">
          <div className="tax-seg withheld" style={{ width: `${withheldPct}%` }} />
          <div className="tax-seg reserve" style={{ width: `${reservePct}%` }} />
        </div>
        <div className="tax-bar-legend">
          <span>Withheld {money(e.alreadyWithheldMinor)}</span>
          <span>Reserve {money(e.reserveTargetMinor)}</span>
          <span>{owing >= 0 ? 'Owing' : 'Refund'} {money(Math.abs(owing) as Minor)}</span>
        </div>
      </section>

      <div className="tax-grid">
        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head"><h2>Income</h2></div>
          <Line label="Employment gross" value={money(e.employmentGrossMinor)} />
          <Line label="Self-employment net" value={money(e.selfEmploymentNetMinor)} />
          {e.otherIncomeMinor > 0 && <Line label="Other income" value={money(e.otherIncomeMinor)} />}
          <Line label="Combined taxable (projected)" value={money(e.projectedAnnualMinor)} strong />
        </section>

        <section className="panel" style={{ margin: 0 }}>
          <div className="panel-head"><h2>Estimated liability</h2></div>
          <Line label="Federal tax" value={money(e.estFederalTaxMinor)} />
          <Line label={`${province} tax`} value={money(e.estProvincialTaxMinor)} />
          <Line label="CPP — employment" value={money(e.estCppEmploymentMinor)} />
          <Line label="CPP — self-employed ×2" value={money(e.estCppSelfEmployedMinor)} warn />
          {e.estCpp2Minor > 0 && <Line label="CPP2" value={money(e.estCpp2Minor)} />}
          <Line label="EI" value={money(e.estEiMinor)} />
          <Line label="Total estimated" value={money(e.totalLiabilityMinor)} strong />
        </section>
      </div>

      {e.requiresInstalments && (
        <div className="banner" style={{ background: 'var(--bg-danger)' }}>
          <div>
            <div className="banner-title">Instalments likely required</div>
            <div className="banner-sub">
              Estimated net owing crosses the CRA threshold ($3,000). Quarterly due dates: {instalmentDueDates(taxYear).map((d) => formatDateOnly(d)).join(' · ')}. Verify with CRA.
            </div>
          </div>
        </div>
      )}

      <section className="panel">
        <div className="panel-head"><h2>Sources</h2><span className="muted">verified {formatDateOnly(e.verifiedOn)}</span></div>
        {e.sources.map((s) => (
          <div className="sts-row" key={s.url}>
            <span className="muted">{s.label}</span>
            <a href={s.url} target="_blank" rel="noreferrer" className="link-btn">canada.ca ↗</a>
          </div>
        ))}
        <p className="muted" style={{ marginTop: 8, fontSize: 11 }}>
          Estimate only. Excludes credits, deductions, RRSP, spousal transfers, and HST (a separate obligation). Unbalanced pay stubs are excluded.
        </p>
      </section>
    </div>
  );
}

function Line({ label, value, strong, warn }: { label: string; value: string; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`tax-line ${warn ? 'warn' : ''}`}>
      <span className={strong ? '' : 'muted'} style={strong ? { fontWeight: 500 } : undefined}>{label}</span>
      <span style={{ fontWeight: strong ? 600 : 500, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

/** Stale when the verified date is more than a year old or from a prior tax year. */
function isStale(verifiedOn: string, todayISO: string): boolean {
  const v = new Date(verifiedOn + 'T00:00:00').getTime();
  const t = new Date(todayISO + 'T00:00:00').getTime();
  return t - v > 366 * 86_400_000;
}
