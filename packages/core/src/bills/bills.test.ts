import { describe, it, expect } from 'vitest';
import { toMinor } from '../money/minor.js';
import { generateDueDates } from './schedule.js';
import { billState } from './state.js';
import { creepPercent, isMeaningfulCreep } from './creep.js';
import { matchesInstance } from './match.js';
import type { RecurringBill } from '../db/types.js';

const monthly = (o: Partial<RecurringBill> = {}): RecurringBill => ({
  id: 'b1', user_id: 'u1', name: 'Rent', merchant_id: null, category_id: null, account_id: null,
  expected_minor: toMinor('1450.00'), currency_code: 'CAD', frequency: 'monthly', interval: 1,
  day_of_month: 1, day_of_week: null, starts_on: '2026-01-01', ends_on: null, is_active: true,
  amount_tolerance_percent: 10, date_tolerance_days: 5, created_at: '2026-01-01T00:00:00Z', ...o,
});

describe('generateDueDates', () => {
  it('generates monthly occurrences within the horizon', () => {
    const dates = generateDueDates(monthly({ day_of_month: 1 }), '2026-07-15', 90);
    expect(dates).toEqual(['2026-08-01', '2026-09-01', '2026-10-01']);
  });

  it('clamps day 31 to the last day of shorter months (never rolls to the 1st)', () => {
    const dates = generateDueDates(monthly({ day_of_month: 31, starts_on: '2026-01-31' }), '2026-02-01', 90);
    // Feb 28, Mar 31, Apr 30 — never Mar 1
    expect(dates).toEqual(['2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('generates weekly occurrences and fast-forwards to the window', () => {
    const dates = generateDueDates(
      monthly({ frequency: 'weekly', day_of_month: null, starts_on: '2026-01-02' }),
      '2026-07-01', 21,
    );
    // Jan 2 is a Friday; weekly lands on Fridays within Jul 1–22
    expect(dates.length).toBe(3);
    dates.forEach((d) => expect(new Date(d + 'T00:00:00Z').getUTCDay()).toBe(5));
  });

  it('respects ends_on', () => {
    const dates = generateDueDates(monthly({ day_of_month: 1, ends_on: '2026-08-15' }), '2026-07-15', 90);
    expect(dates).toEqual(['2026-08-01']);
  });

  it('steps yearly by 12 months', () => {
    const dates = generateDueDates(monthly({ frequency: 'yearly', starts_on: '2025-03-10', day_of_month: 10 }), '2026-01-01', 120);
    expect(dates).toEqual(['2026-03-10']);
  });
});

describe('billState', () => {
  it('classifies by due date and paid flag', () => {
    expect(billState({ dueDate: '2026-07-30', todayISO: '2026-07-24', paid: false })).toBe('upcoming');
    expect(billState({ dueDate: '2026-07-27', todayISO: '2026-07-24', paid: false })).toBe('due'); // within 5 days
    expect(billState({ dueDate: '2026-07-20', todayISO: '2026-07-24', paid: false })).toBe('overdue');
    expect(billState({ dueDate: '2026-07-20', todayISO: '2026-07-24', paid: true })).toBe('paid');
  });
});

describe('creep', () => {
  it('computes percent change and flags meaningful increases', () => {
    expect(Math.round(creepPercent(toMinor('71.00'), toMinor('88.00')))).toBe(24);
    expect(isMeaningfulCreep(24)).toBe(true);
    expect(isMeaningfulCreep(5)).toBe(false);
    expect(isMeaningfulCreep(creepPercent(toMinor('71.00'), toMinor('88.00')))).toBe(true);
  });
});

describe('matchesInstance', () => {
  const bill = { merchant_id: 'm1', expected_minor: toMinor('88.00'), amount_tolerance_percent: 10, date_tolerance_days: 5 };

  it('matches within amount tolerance and date window', () => {
    expect(matchesInstance(bill, '2026-08-04', { merchant_id: 'm1', total_minor: toMinor('85.00'), occurred_at: '2026-08-02T10:00:00Z' })).toBe(true);
  });
  it('rejects an amount outside tolerance', () => {
    expect(matchesInstance(bill, '2026-08-04', { merchant_id: 'm1', total_minor: toMinor('120.00'), occurred_at: '2026-08-04T10:00:00Z' })).toBe(false);
  });
  it('rejects a date outside the window', () => {
    expect(matchesInstance(bill, '2026-08-04', { merchant_id: 'm1', total_minor: toMinor('88.00'), occurred_at: '2026-08-20T10:00:00Z' })).toBe(false);
  });
  it('rejects a different merchant', () => {
    expect(matchesInstance(bill, '2026-08-04', { merchant_id: 'm2', total_minor: toMinor('88.00'), occurred_at: '2026-08-04T10:00:00Z' })).toBe(false);
  });
});
