import type { Minor } from '../money/minor.js';
import { minor, ZERO } from '../money/minor.js';

function parse(dateISO: string): [number, number, number] {
  return dateISO.slice(0, 10).split('-').map((n) => parseInt(n, 10)) as [number, number, number];
}

/** Amount still needed, floored at zero. */
export function remaining(targetMinor: Minor, currentMinor: Minor): Minor {
  return minor(Math.max(0, targetMinor - currentMinor));
}

/** Fraction complete, 0..100 (100 once current ≥ target). */
export function goalProgress(currentMinor: Minor, targetMinor: Minor): number {
  if (targetMinor <= 0) return 100;
  return Math.min(100, Math.max(0, (currentMinor / targetMinor) * 100));
}

/**
 * Whole months from `fromISO` to `toISO`, clamped to at least 1 — the number of
 * monthly contributions available before the target date.
 */
export function monthsBetween(fromISO: string, toISO: string): number {
  const [fy, fm] = parse(fromISO);
  const [ty, tm] = parse(toISO);
  return Math.max(1, (ty - fy) * 12 + (tm - fm));
}

/**
 * Monthly contribution to reach the target by a date:
 *   monthly = ceil((target − current) / months_remaining)
 * Rounded up so the goal is actually met rather than falling a cent short.
 */
export function monthlyForDate(targetMinor: Minor, currentMinor: Minor, monthsRemaining: number): Minor {
  const need = remaining(targetMinor, currentMinor);
  if (need === 0) return ZERO;
  if (monthsRemaining <= 0) return need;
  return minor(Math.ceil(need / monthsRemaining));
}

/**
 * Months to reach the target at a monthly contribution:
 *   months = ceil((target − current) / monthly)
 * Returns 0 when already met, Infinity when the contribution is non-positive.
 */
export function monthsForMonthly(targetMinor: Minor, currentMinor: Minor, monthlyMinor: Minor): number {
  const need = remaining(targetMinor, currentMinor);
  if (need === 0) return 0;
  if (monthlyMinor <= 0) return Infinity;
  return Math.ceil(need / monthlyMinor);
}

/** The date `months` whole months after `fromISO` (day clamped to month end). */
export function addMonths(fromISO: string, months: number): string {
  if (!Number.isFinite(months)) return fromISO;
  const [y, m, d] = parse(fromISO);
  const m0 = m - 1 + months;
  const ny = y + Math.floor(m0 / 12);
  const nm = ((m0 % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}
