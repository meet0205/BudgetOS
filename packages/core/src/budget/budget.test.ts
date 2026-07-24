import { describe, it, expect } from 'vitest';
import { toMinor, minor } from '../money/minor.js';
import { periodFor, periodLength, daysRemaining } from './period.js';
import { fundBuckets, TAX_RESERVE_KIND, type FundingBucket } from './allocate.js';
import { computeSafeToSpend } from './safe-to-spend.js';
import { hasSelfEmploymentIncome, needsReserveBucket, canDeleteBucket, isReserveBucket } from './reserve-bucket.js';
import { receivedIncomeMinor } from './income-received.js';

describe('period', () => {
  it('gives calendar months when month_start_day is 1', () => {
    expect(periodFor('2026-07-20', 1)).toEqual({ start: '2026-07-01', end: '2026-08-01' });
  });

  it('shifts the period for a mid-month start day', () => {
    expect(periodFor('2026-07-20', 15)).toEqual({ start: '2026-07-15', end: '2026-08-15' });
    expect(periodFor('2026-07-10', 15)).toEqual({ start: '2026-06-15', end: '2026-07-15' });
  });

  it('wraps across the year boundary', () => {
    expect(periodFor('2026-01-05', 15)).toEqual({ start: '2025-12-15', end: '2026-01-15' });
  });

  it('counts days remaining including today, clamped to ≥1', () => {
    const p = { start: '2026-07-01', end: '2026-08-01' };
    expect(periodLength(p)).toBe(31);
    expect(daysRemaining(p, '2026-07-18')).toBe(14); // 18..31 inclusive-ish → Aug 1 − Jul 18
    expect(daysRemaining(p, '2026-08-05')).toBe(1);  // past end → 1
    expect(daysRemaining(p, '2026-06-20')).toBe(31); // before start → full length
  });
});

describe('fundBuckets', () => {
  const b = (o: Partial<FundingBucket> & Pick<FundingBucket, 'id' | 'name' | 'mode'>): FundingBucket => ({
    target_minor: null, percent: null, weight: 1, priority: 100, system_kind: null, ...o,
  });

  it('funds fixed buckets in priority order', () => {
    const r = fundBuckets([
      b({ id: 'rent', name: 'Rent', mode: 'fixed', target_minor: toMinor('1450.00'), priority: 1 }),
      b({ id: 'bills', name: 'Bills', mode: 'fixed', target_minor: toMinor('310.00'), priority: 2 }),
    ], toMinor('3290.00'));
    expect(r.allocatedMinor).toBe(toMinor('1760.00'));
    expect(r.lines.find((l) => l.bucketId === 'rent')!.fundedMinor).toBe(toMinor('1450.00'));
  });

  it('underfunds a fixed bucket rather than going negative, and flags the shortfall', () => {
    const r = fundBuckets([
      b({ id: 'rent', name: 'Rent', mode: 'fixed', target_minor: toMinor('1450.00'), priority: 1 }),
      b({ id: 'car', name: 'Car', mode: 'fixed', target_minor: toMinor('250.00'), priority: 2 }),
    ], toMinor('1600.00'));
    const car = r.lines.find((l) => l.bucketId === 'car')!;
    expect(car.fundedMinor).toBe(toMinor('150.00'));      // only $150 left
    expect(car.shortfallMinor).toBe(toMinor('100.00'));   // flagged, not negative
  });

  it('allocates percent_of_income off gross income', () => {
    const r = fundBuckets([
      b({ id: 'emerg', name: 'Emergency', mode: 'percent_of_income', percent: 10, priority: 5 }),
    ], toMinor('3290.00'));
    expect(r.lines[0]!.fundedMinor).toBe(toMinor('329.00'));
  });

  it('funds the tax reserve after fixed and percent, before remainder', () => {
    const r = fundBuckets([
      b({ id: 'rent', name: 'Rent', mode: 'fixed', target_minor: toMinor('1000.00'), priority: 1 }),
      b({ id: 'save', name: 'Savings', mode: 'remainder', weight: 1, priority: 9 }),
      b({ id: 'tax', name: 'Tax reserve', mode: 'fixed', target_minor: toMinor('500.00'), priority: 3, system_kind: TAX_RESERVE_KIND }),
    ], toMinor('2000.00'));
    // rent 1000 + reserve 500 → remainder gets the last 500
    expect(r.taxReservedMinor).toBe(toMinor('500.00'));
    expect(r.allocatedMinor).toBe(toMinor('1500.00')); // rent + savings, excludes reserve
    expect(r.lines.find((l) => l.bucketId === 'save')!.fundedMinor).toBe(toMinor('500.00'));
  });

  it('splits remainder buckets by weight, preserving the total', () => {
    const r = fundBuckets([
      b({ id: 'a', name: 'A', mode: 'remainder', weight: 2, priority: 1 }),
      b({ id: 'b', name: 'B', mode: 'remainder', weight: 1, priority: 2 }),
    ], toMinor('900.00'));
    const a = r.lines.find((l) => l.bucketId === 'a')!.fundedMinor;
    const bb = r.lines.find((l) => l.bucketId === 'b')!.fundedMinor;
    expect(a).toBe(toMinor('600.00'));
    expect(bb).toBe(toMinor('300.00'));
    expect(a + bb).toBe(toMinor('900.00'));
  });
});

describe('computeSafeToSpend', () => {
  it('matches income − allocated − reserved − spent and the daily figure', () => {
    const funding = fundBuckets([
      { id: 'rent', name: 'Rent', mode: 'fixed', target_minor: toMinor('1450.00'), percent: null, weight: 1, priority: 1, system_kind: null },
      { id: 'bills', name: 'Bills', mode: 'fixed', target_minor: toMinor('310.00'), percent: null, weight: 1, priority: 2, system_kind: null },
      { id: 'emerg', name: 'Emergency', mode: 'fixed', target_minor: toMinor('329.00'), percent: null, weight: 1, priority: 3, system_kind: null },
      { id: 'car', name: 'Car', mode: 'fixed', target_minor: toMinor('250.00'), percent: null, weight: 1, priority: 4, system_kind: null },
      { id: 'tax', name: 'Tax reserve', mode: 'fixed', target_minor: toMinor('211.00'), percent: null, weight: 1, priority: 5, system_kind: TAX_RESERVE_KIND },
    ], toMinor('3290.00'));
    const s = computeSafeToSpend({
      incomeMinor: toMinor('3290.00'), funding, spentMinor: toMinor('327.00'),
      period: { start: '2026-07-01', end: '2026-08-01' }, asOfISO: '2026-07-18',
    });
    // 3290 − (1450+310+329+250) − 211 − 327 = 413
    expect(s.safeToSpendMinor).toBe(toMinor('413.00'));
    expect(s.taxReservedMinor).toBe(toMinor('211.00'));
    // 413.00 / 14 days = 29.50 (truncated)
    expect(s.daysRemaining).toBe(14);
    expect(s.dailyMinor).toBe(toMinor('29.50'));
  });

  it('goes negative when overspent', () => {
    const funding = fundBuckets([], toMinor('100.00'));
    const s = computeSafeToSpend({
      incomeMinor: toMinor('100.00'), funding, spentMinor: toMinor('150.00'),
      period: { start: '2026-07-01', end: '2026-08-01' }, asOfISO: '2026-07-15',
    });
    expect(s.safeToSpendMinor).toBe(toMinor('-50.00'));
  });
});

describe('reserve bucket lifecycle', () => {
  const seDoc = { income_kind: 'self_employment' as const, deleted_at: null };
  const empDoc = { income_kind: 'employment' as const, deleted_at: null };
  const reserve = { system_kind: TAX_RESERVE_KIND };
  const normal = { system_kind: null };

  it('detects self-employment income', () => {
    expect(hasSelfEmploymentIncome([seDoc])).toBe(true);
    expect(hasSelfEmploymentIncome([empDoc])).toBe(false);
    expect(hasSelfEmploymentIncome([{ ...seDoc, deleted_at: '2026-07-01T00:00:00Z' }])).toBe(false);
  });

  it('needs a reserve bucket when SE income exists and none is present', () => {
    expect(needsReserveBucket([normal], [seDoc])).toBe(true);
    expect(needsReserveBucket([reserve], [seDoc])).toBe(false);
    expect(needsReserveBucket([normal], [empDoc])).toBe(false);
  });

  it('forbids deleting the reserve while SE income exists', () => {
    expect(isReserveBucket(reserve)).toBe(true);
    expect(canDeleteBucket(reserve, [seDoc])).toBe(false);
    expect(canDeleteBucket(reserve, [empDoc])).toBe(true); // no SE income → deletable
    expect(canDeleteBucket(normal, [seDoc])).toBe(true);   // normal buckets always deletable
  });
});

describe('receivedIncomeMinor', () => {
  const period = { start: '2026-07-01', end: '2026-08-01' };
  it('uses net for employment and gross − fees for self-employment, within the period', () => {
    const docs = [
      { income_kind: 'employment' as const, gross_minor: toMinor('2140.00'), net_minor: toMinor('1505.73'), platform_fees_minor: minor(0), pay_date: '2026-07-15', deleted_at: null },
      { income_kind: 'self_employment' as const, gross_minor: toMinor('812.40'), net_minor: null, platform_fees_minor: toMinor('162.48'), pay_date: '2026-07-20', deleted_at: null },
      { income_kind: 'employment' as const, gross_minor: toMinor('2140.00'), net_minor: toMinor('1505.73'), platform_fees_minor: minor(0), pay_date: '2026-08-05', deleted_at: null }, // out of period
    ];
    // 1505.73 + (812.40 − 162.48) = 1505.73 + 649.92 = 2155.65
    expect(receivedIncomeMinor(docs, period)).toBe(toMinor('2155.65'));
  });
});
