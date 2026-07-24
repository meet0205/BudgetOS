import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { TransactionWithSplits } from '../db/types.js';
import { categoryTotals } from './breakdown.js';

export interface CategoryAnomaly {
  categoryId: string;
  currentMinor: Minor;
  averageMinor: Minor;
  /** Percent above the historical average (positive = overspending). */
  deltaPercent: number;
}

interface Range { from: string; to: string }

/**
 * Categories spending meaningfully above their historical average. Compares the
 * current period's category spend to the mean of the same category across the
 * prior periods, flagging those at least `thresholdPercent` above (and above a
 * small absolute floor so a $2 → $3 blip isn't surfaced). Feeds the dashboard
 * insight banner (PRD 23).
 */
export function categoryAnomalies(
  txns: TransactionWithSplits[],
  current: Range,
  priors: Range[],
  thresholdPercent = 25,
  minMinor = 5000,
): CategoryAnomaly[] {
  const cur = new Map(categoryTotals(txns, current.from, current.to).map((c) => [c.categoryId, c.total as number]));
  const priorMaps = priors.map((p) => new Map(categoryTotals(txns, p.from, p.to).map((c) => [c.categoryId, c.total as number])));

  const out: CategoryAnomaly[] = [];
  for (const [cat, curTotal] of cur) {
    if (curTotal < minMinor) continue;
    const vals = priorMaps.map((m) => m.get(cat) ?? 0);
    if (vals.length === 0) continue;
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    if (avg <= 0) continue;
    const delta = ((curTotal - avg) / avg) * 100;
    if (delta >= thresholdPercent) {
      out.push({ categoryId: cat, currentMinor: minor(curTotal), averageMinor: minor(Math.round(avg)), deltaPercent: delta });
    }
  }
  return out.sort((a, b) => b.deltaPercent - a.deltaPercent);
}
