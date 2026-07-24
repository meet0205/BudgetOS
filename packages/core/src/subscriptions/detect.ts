import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { TransactionWithSplits } from '../db/types.js';

export interface SubscriptionCandidate {
  merchantId: string;
  typicalMinor: Minor;
  occurrences: number;
  /** Average days between charges (≈30 monthly, ≈365 yearly). */
  avgIntervalDays: number;
  lastChargedAt: string;
}

const DAY = 86_400_000;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/**
 * Detect likely subscriptions: a merchant charged repeatedly for a similar
 * amount at a roughly regular cadence. Amounts within `amountTolerancePercent`
 * of the median count as the same charge; needs at least `minOccurrences`.
 * Surfaces recurring spend the user isn't tracking as a bill (PRD 26).
 */
export function detectSubscriptions(
  txns: TransactionWithSplits[],
  opts: { minOccurrences?: number; amountTolerancePercent?: number } = {},
): SubscriptionCandidate[] {
  const minOcc = opts.minOccurrences ?? 3;
  const tol = opts.amountTolerancePercent ?? 15;

  const byMerchant = new Map<string, { amount: number; at: string }[]>();
  for (const t of txns) {
    if (t.transaction.kind !== 'expense' || !t.transaction.merchant_id) continue;
    const arr = byMerchant.get(t.transaction.merchant_id) ?? [];
    arr.push({ amount: t.transaction.total_minor, at: t.transaction.occurred_at });
    byMerchant.set(t.transaction.merchant_id, arr);
  }

  const out: SubscriptionCandidate[] = [];
  for (const [merchantId, charges] of byMerchant) {
    if (charges.length < minOcc) continue;
    const med = median(charges.map((c) => c.amount));
    if (med <= 0) continue;
    const consistent = charges.filter((c) => Math.abs(c.amount - med) <= (med * tol) / 100);
    if (consistent.length < minOcc) continue;

    const times = consistent.map((c) => new Date(c.at).getTime()).sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i]! - times[i - 1]!) / DAY);
    const avgInterval = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : 0;

    out.push({
      merchantId,
      typicalMinor: minor(med),
      occurrences: consistent.length,
      avgIntervalDays: Math.round(avgInterval),
      lastChargedAt: new Date(times[times.length - 1]!).toISOString(),
    });
  }
  return out.sort((a, b) => b.occurrences - a.occurrences);
}
