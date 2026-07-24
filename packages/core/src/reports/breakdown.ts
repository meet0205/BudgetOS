import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { TransactionWithSplits } from '../db/types.js';

export interface CategoryTotal {
  categoryId: string; // 'uncategorized' when null
  total: Minor;
  count: number;
}

function inPeriod(at: string, from: string, to: string): boolean {
  return at >= from && at < to;
}

/**
 * Spend by category for a period. Transfers are excluded (moving own money is
 * not spending); refunds reduce their original category rather than showing as
 * income; income is not spend. Returns categories with non-zero spend, largest
 * first — the numbers most budget apps get wrong (PRD 17).
 */
export function categoryTotals(txns: TransactionWithSplits[], from: string, to: string): CategoryTotal[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    const kind = t.transaction.kind;
    if (kind === 'transfer' || kind === 'income') continue;
    if (!inPeriod(t.transaction.occurred_at, from, to)) continue;
    const sign = kind === 'refund' ? -1 : 1;
    for (const s of t.splits) {
      const id = s.category_id ?? 'uncategorized';
      const cur = map.get(id) ?? { total: 0, count: 0 };
      cur.total += sign * s.amount_minor;
      cur.count += 1;
      map.set(id, cur);
    }
  }
  return [...map.entries()]
    .map(([categoryId, v]) => ({ categoryId, total: minor(v.total), count: v.count }))
    .filter((c) => c.total !== 0)
    .sort((a, b) => b.total - a.total);
}

/** Spend by merchant for a period (same exclusion rules as categoryTotals). */
export function merchantTotals(txns: TransactionWithSplits[], from: string, to: string): { merchantId: string; total: Minor; count: number }[] {
  const map = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    const kind = t.transaction.kind;
    if (kind === 'transfer' || kind === 'income') continue;
    if (!inPeriod(t.transaction.occurred_at, from, to)) continue;
    const sign = kind === 'refund' ? -1 : 1;
    const id = t.transaction.merchant_id ?? 'none';
    const cur = map.get(id) ?? { total: 0, count: 0 };
    cur.total += sign * t.transaction.total_minor;
    cur.count += 1;
    map.set(id, cur);
  }
  return [...map.entries()]
    .map(([merchantId, v]) => ({ merchantId, total: minor(v.total), count: v.count }))
    .filter((c) => c.total !== 0)
    .sort((a, b) => b.total - a.total);
}

/** One year earlier, aligned to the same day (leap-year safe via clamping). */
export function priorYearPeriod(from: string, to: string): { from: string; to: string } {
  return { from: shiftYear(from, -1), to: shiftYear(to, -1) };
}

function shiftYear(dateISO: string, delta: number): string {
  const d = new Date(dateISO);
  const y = d.getUTCFullYear() + delta;
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const clamped = new Date(Date.UTC(y, m, Math.min(day, lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  return clamped.toISOString();
}
