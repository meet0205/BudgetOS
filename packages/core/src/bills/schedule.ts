import type { RecurringBill, BillFrequency } from '../db/types.js';

type ScheduleFields = Pick<
  RecurringBill,
  'frequency' | 'interval' | 'day_of_month' | 'day_of_week' | 'starts_on' | 'ends_on'
>;

function parse(dateISO: string): [number, number, number] {
  return dateISO.slice(0, 10).split('-').map((n) => parseInt(n, 10)) as [number, number, number];
}
function iso(y: number, m0: number, d: number): string {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}
function lastDayOfMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
const MS_DAY = 86_400_000;
const toUTC = (d: string): number => { const [y, m, dd] = parse(d); return Date.UTC(y, m - 1, dd); };

const STEP_DAYS: Partial<Record<BillFrequency, number>> = { weekly: 7, biweekly: 14 };

/**
 * Generate a bill's due dates in [fromISO, fromISO + horizonDays], inclusive.
 *
 * Monthly/yearly step by `interval` months/years from `starts_on`, placing the
 * occurrence on `day_of_month` (falling back to the start day), clamped to the
 * last day in shorter months — a bill due on the 31st lands on Feb 28, never
 * Mar 1. Weekly/biweekly step by 7/14 × interval days from `starts_on`.
 * Respects `ends_on`.
 */
export function generateDueDates(bill: ScheduleFields, fromISO: string, horizonDays = 90): string[] {
  const from = toUTC(fromISO);
  const horizonEnd = from + horizonDays * MS_DAY;
  const endsOn = bill.ends_on ? toUTC(bill.ends_on) : null;
  const interval = Math.max(1, bill.interval);
  const [sy, sm, sd] = parse(bill.starts_on);
  const dueDates: string[] = [];

  if (bill.frequency === 'monthly' || bill.frequency === 'yearly') {
    const stepMonths = bill.frequency === 'yearly' ? 12 * interval : interval;
    const day = bill.day_of_month ?? sd;
    // Walk occurrences from the start month until past the horizon.
    for (let k = 0; k < 1200; k++) {
      const m0 = sm - 1 + k * stepMonths;
      const y = sy + Math.floor(m0 / 12);
      const month = ((m0 % 12) + 12) % 12;
      const d = Math.min(day, lastDayOfMonth(y, month));
      const occ = Date.UTC(y, month, d);
      if (occ > horizonEnd) break;
      if (occ >= from && (endsOn === null || occ <= endsOn)) dueDates.push(iso(y, month, d));
    }
    return dueDates;
  }

  // weekly / biweekly
  const stepDays = (STEP_DAYS[bill.frequency] ?? 7) * interval;
  let occ = Date.UTC(sy, sm - 1, sd);
  // Fast-forward to the first occurrence at or after `from`.
  if (occ < from) {
    const skip = Math.ceil((from - occ) / (stepDays * MS_DAY));
    occ += skip * stepDays * MS_DAY;
  }
  for (let k = 0; k < 1200 && occ <= horizonEnd; k++) {
    if (endsOn === null || occ <= endsOn) dueDates.push(new Date(occ).toISOString().slice(0, 10));
    occ += stepDays * MS_DAY;
  }
  return dueDates;
}
