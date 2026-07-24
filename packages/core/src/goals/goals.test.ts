import { describe, it, expect, beforeEach } from 'vitest';
import { toMinor } from '../money/minor.js';
import {
  remaining, goalProgress, monthsBetween, monthlyForDate, monthsForMonthly, addMonths,
} from './solve.js';
import { InMemoryAdapter } from '../db/adapter.js';
import { GoalRepository, GOAL_CONTRIBUTIONS } from '../db/repositories/goals.js';
import { fixedClock } from '../db/clock.js';
import type { GoalContribution } from '../db/types.js';

describe('goal solve', () => {
  it('computes remaining and progress', () => {
    expect(remaining(toMinor('9000.00'), toMinor('4200.00'))).toBe(toMinor('4800.00'));
    expect(remaining(toMinor('100.00'), toMinor('150.00'))).toBe(0); // floored
    expect(Math.round(goalProgress(toMinor('4200.00'), toMinor('9000.00')))).toBe(47);
    expect(goalProgress(toMinor('100.00'), toMinor('100.00'))).toBe(100);
  });

  it('counts whole months between dates, min 1', () => {
    expect(monthsBetween('2026-07-24', '2027-01-24')).toBe(6);
    expect(monthsBetween('2026-07-24', '2026-07-30')).toBe(1); // same month → 1
  });

  it('solves monthly from a target date (rounded up)', () => {
    // need 4800 over 6 months → 800/mo
    expect(monthlyForDate(toMinor('9000.00'), toMinor('4200.00'), 6)).toBe(toMinor('800.00'));
    // 100 over 3 → ceil(33.33) = 33.34 (rounds up so it's actually reached)
    expect(monthlyForDate(toMinor('100.00'), toMinor('0.00'), 3)).toBe(toMinor('33.34'));
    expect(monthlyForDate(toMinor('100.00'), toMinor('100.00'), 6)).toBe(0); // met
  });

  it('solves months from a monthly contribution', () => {
    expect(monthsForMonthly(toMinor('9000.00'), toMinor('4200.00'), toMinor('800.00'))).toBe(6);
    expect(monthsForMonthly(toMinor('100.00'), toMinor('100.00'), toMinor('50.00'))).toBe(0);
    expect(monthsForMonthly(toMinor('100.00'), toMinor('0.00'), toMinor('0.00'))).toBe(Infinity);
  });

  it('projects a date N months out, clamping the day', () => {
    expect(addMonths('2026-07-24', 6)).toBe('2027-01-24');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28'); // clamped
  });
});

describe('GoalRepository', () => {
  const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
  let repo: GoalRepository;
  let adapter: InMemoryAdapter;
  beforeEach(() => {
    adapter = new InMemoryAdapter();
    let n = 0;
    repo = new GoalRepository(adapter, { clock: fixedClock('2026-07-24T12:00:00.000Z'), newId: () => `id-${++n}` });
  });

  it('creates a goal and contributes, advancing the balance', async () => {
    const goal = await repo.create(USER, { name: 'Used car', target_minor: toMinor('9000.00'), current_minor: toMinor('4200.00'), target_date: '2027-01-24' });
    expect(goal.achieved_at).toBeNull();
    const after = await repo.contribute(USER, goal.id, toMinor('800.00'), '2026-08-01');
    expect(after.current_minor).toBe(toMinor('5000.00'));
    const contribs = (await adapter.all<GoalContribution>(GOAL_CONTRIBUTIONS)).filter((c) => c.goal_id === goal.id);
    expect(contribs).toHaveLength(1);
  });

  it('marks achieved once the target is reached', async () => {
    const goal = await repo.create(USER, { name: 'Trip', target_minor: toMinor('1000.00'), current_minor: toMinor('900.00') });
    const after = await repo.contribute(USER, goal.id, toMinor('150.00'), '2026-08-01');
    expect(after.current_minor).toBe(toMinor('1050.00'));
    expect(after.achieved_at).not.toBeNull();
  });

  it('isolates goals by user', async () => {
    await repo.create(USER, { name: 'A', target_minor: toMinor('100.00') });
    await repo.create('bbbbbbbb-0000-4000-8000-000000000002', { name: 'B', target_minor: toMinor('100.00') });
    expect(await repo.list(USER)).toHaveLength(1);
  });
});
