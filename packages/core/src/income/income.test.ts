import { describe, it, expect } from 'vitest';
import { toMinor, minor } from '../money/minor.js';
import { reconciles, imbalance, deductionTotal } from './reconcile.js';
import { checkContinuity } from './continuity.js';
import { annualise, PAY_PERIODS_PER_YEAR } from './annualise.js';
import { feedsTax, DEDUCTION_LABELS } from './deductions.js';
import type { IncomeDocument } from '../db/types.js';

const emp = (gross: string, net: string): Pick<IncomeDocument, 'income_kind' | 'gross_minor' | 'net_minor'> => ({
  income_kind: 'employment', gross_minor: toMinor(gross), net_minor: toMinor(net),
});

describe('reconcile', () => {
  const deductions = [
    { amount_minor: toMinor('284.10') },
    { amount_minor: toMinor('196.40') },
    { amount_minor: toMinor('118.66') },
    { amount_minor: toMinor('35.11') },
  ]; // total 634.27

  it('balances when gross − deductions === net', () => {
    // 2140.00 − 634.27 = 1505.73
    expect(reconciles(emp('2140.00', '1505.73'), deductions)).toBe(true);
    expect(imbalance(emp('2140.00', '1505.73'), deductions)).toBe(0);
  });

  it('reports a signed imbalance, not a boolean only', () => {
    // net entered $12.40 too low → gross − deductions − net = +12.40
    expect(reconciles(emp('2140.00', '1493.33'), deductions)).toBe(false);
    expect(imbalance(emp('2140.00', '1493.33'), deductions)).toBe(toMinor('12.40'));
  });

  it('reports a negative imbalance when net is too high', () => {
    expect(imbalance(emp('2140.00', '1520.73'), deductions)).toBe(toMinor('-15.00'));
  });

  it('self-employment reconciles trivially with no deductions', () => {
    const doc = { income_kind: 'self_employment' as const, gross_minor: toMinor('800.00'), net_minor: null };
    expect(reconciles(doc, [])).toBe(true);
    expect(imbalance(doc, [])).toBe(0);
  });

  it('employment without a net does not reconcile', () => {
    expect(reconciles({ income_kind: 'employment', gross_minor: toMinor('100.00'), net_minor: null }, [])).toBe(false);
  });

  it('deductionTotal sums to Minor', () => {
    expect(deductionTotal(deductions)).toBe(toMinor('634.27'));
    expect(deductionTotal([])).toBe(0);
  });
});

describe('continuity', () => {
  const stub = (pay_date: string, gross: string, ytd: string | null) => ({
    pay_date, gross_minor: toMinor(gross),
    ytd_gross_minor: ytd == null ? null : toMinor(ytd),
  });

  it('passes a clean run', () => {
    const r = checkContinuity([
      stub('2026-06-15', '2140.00', '27820.00'),
      stub('2026-07-01', '2140.00', '29960.00'),
      stub('2026-07-15', '2140.00', '32100.00'),
    ]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(true);
    expect(r.gaps).toHaveLength(0);
  });

  it('detects a gap and names the missing period', () => {
    // Jul 15 jumps by two periods (missing one ~2140 stub).
    const r = checkContinuity([
      stub('2026-07-01', '2140.00', '29960.00'),
      stub('2026-07-29', '2140.00', '34240.00'), // expected 32100, off by +2140
    ]);
    expect(r.ok).toBe(false);
    expect(r.gaps[0]).toMatchObject({
      afterPayDate: '2026-07-01',
      beforePayDate: '2026-07-29',
      missingGrossMinor: toMinor('2140.00'),
    });
  });

  it('reports checked=false when no YTD figures are present', () => {
    const r = checkContinuity([stub('2026-07-01', '2140.00', null), stub('2026-07-15', '2140.00', null)]);
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(false);
  });

  it('sorts by pay date before checking', () => {
    const r = checkContinuity([
      stub('2026-07-15', '2140.00', '32100.00'),
      stub('2026-07-01', '2140.00', '29960.00'),
    ]);
    expect(r.ok).toBe(true);
  });
});

describe('annualise', () => {
  it('projects from a partial year', () => {
    // biweekly, 14 periods elapsed, ytd 29960 → × 26/14
    expect(annualise(toMinor('29960.00'), PAY_PERIODS_PER_YEAR.biweekly!, 14)).toBe(toMinor('55640.00'));
  });

  it('rounds half-up to the cent', () => {
    // 100.00 × 3 / 7 = 42.857… → 42.86
    expect(annualise(toMinor('100.00'), 3, 7)).toBe(toMinor('42.86'));
  });

  it('throws on zero periods elapsed', () => {
    expect(() => annualise(minor(100), 26, 0)).toThrow();
  });
});

describe('deductions vocabulary', () => {
  it('marks only tax/CPP/EI lines as feeding the estimate', () => {
    expect(feedsTax('federal_tax')).toBe(true);
    expect(feedsTax('provincial_tax')).toBe(true);
    expect(feedsTax('cpp')).toBe(true);
    expect(feedsTax('ei')).toBe(true);
    expect(feedsTax('rrsp')).toBe(false);
    expect(feedsTax('union_dues')).toBe(false);
  });

  it('has a plain-language label for every kind', () => {
    expect(DEDUCTION_LABELS.cpp).toBe('CPP');
    expect(DEDUCTION_LABELS.federal_tax).toBe('Federal tax');
  });
});
