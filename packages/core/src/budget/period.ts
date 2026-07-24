/**
 * Period arithmetic — the single source for budget period boundaries. Nothing
 * elsewhere computes month boundaries inline (PRD 06). `month_start_day` lets a
 * user paid on a cycle that isn't the calendar month define their own period.
 *
 * Dates are date-only strings ("yyyy-mm-dd"). `end` is exclusive. All math uses
 * UTC to stay timezone-independent.
 */
export interface Period {
  /** Inclusive start, "yyyy-mm-dd". */
  start: string;
  /** Exclusive end, "yyyy-mm-dd". */
  end: string;
}

function ymd(y: number, m0: number, d: number): string {
  // m0 is 0-based; Date.UTC normalises overflow/underflow (month -1 -> prev Dec).
  const dt = new Date(Date.UTC(y, m0, d));
  return dt.toISOString().slice(0, 10);
}

/**
 * The period containing `dateISO` for a given `monthStartDay` (1..28).
 * monthStartDay = 1 gives calendar months. Example: monthStartDay = 15 puts
 * 2026-07-20 in [2026-07-15, 2026-08-15) and 2026-07-10 in [2026-06-15, 2026-07-15).
 */
export function periodFor(dateISO: string, monthStartDay: number): Period {
  if (!Number.isInteger(monthStartDay) || monthStartDay < 1 || monthStartDay > 28) {
    throw new RangeError(`periodFor: monthStartDay must be 1..28, got ${monthStartDay}`);
  }
  const [y, m, d] = dateISO.slice(0, 10).split('-').map((n) => parseInt(n, 10)) as [number, number, number];
  const m0 = m - 1; // 0-based month
  if (d >= monthStartDay) {
    return { start: ymd(y, m0, monthStartDay), end: ymd(y, m0 + 1, monthStartDay) };
  }
  return { start: ymd(y, m0 - 1, monthStartDay), end: ymd(y, m0, monthStartDay) };
}

const MS_PER_DAY = 86_400_000;

function toUTC(dateISO: string): number {
  const [y, m, d] = dateISO.slice(0, 10).split('-').map((n) => parseInt(n, 10)) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

/** Whole days in the period (end − start). */
export function periodLength(period: Period): number {
  return Math.round((toUTC(period.end) - toUTC(period.start)) / MS_PER_DAY);
}

/**
 * Days remaining in the period as of `asOfISO`, counting today. Clamped to at
 * least 1 so the daily figure never divides by zero, and never exceeds the
 * period length. `asOf` before the period returns the full length; after it, 1.
 */
export function daysRemaining(period: Period, asOfISO: string): number {
  const asOf = toUTC(asOfISO);
  const end = toUTC(period.end);
  const start = toUTC(period.start);
  if (asOf < start) return periodLength(period);
  const remaining = Math.round((end - asOf) / MS_PER_DAY);
  return Math.max(1, remaining);
}
