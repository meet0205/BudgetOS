import type { Minor } from '../money/minor.js';
import { minor, ZERO } from '../money/minor.js';
import { percentage, allocate as splitByWeights } from '../money/arithmetic.js';
import type { AllocationBucket, AllocationMode } from '../db/types.js';

export const TAX_RESERVE_KIND = 'tax_reserve';

export type FundingBucket = Pick<
  AllocationBucket,
  'id' | 'name' | 'mode' | 'target_minor' | 'percent' | 'weight' | 'priority' | 'system_kind'
>;

export interface FundingLine {
  bucketId: string;
  name: string;
  mode: AllocationMode;
  targetMinor: Minor;
  fundedMinor: Minor;
  shortfallMinor: Minor;
  isTaxReserve: boolean;
}

export interface FundingResult {
  /** Lines in priority order (for display). */
  lines: FundingLine[];
  /** Sum of funded amounts, excluding the tax reserve. */
  allocatedMinor: Minor;
  /** Funded amount of the tax reserve bucket (0 if none). */
  taxReservedMinor: Minor;
}

const clampNonNeg = (n: number): Minor => minor(Math.max(0, n));
const isReserve = (b: FundingBucket): boolean => b.system_kind === TAX_RESERVE_KIND;

/**
 * Fund buckets from `incomeMinor` in the PRD 06 funding order:
 *   1. fixed buckets (by priority) — allocate min(target, available)
 *   2. percent_of_income buckets (by priority) — allocate percent × income
 *   3. the tax reserve — after fixed and percent, before remainder
 *   4. remainder buckets — split what is left by weight
 *
 * A fixed (or reserve) bucket that cannot be fully funded takes what it can and
 * reports the shortfall rather than going negative. Funding never exceeds the
 * income available. Returned lines are sorted by priority for display.
 */
export function fundBuckets(buckets: FundingBucket[], incomeMinor: Minor): FundingResult {
  const funded = new Map<string, number>();
  const shortfall = new Map<string, number>();
  let available = Math.max(0, incomeMinor);

  const byPriority = (a: FundingBucket, b: FundingBucket) => a.priority - b.priority;

  // 1. fixed (excluding the reserve)
  for (const b of buckets.filter((x) => x.mode === 'fixed' && !isReserve(x)).sort(byPriority)) {
    const target = b.target_minor ?? 0;
    const give = Math.min(target, available);
    funded.set(b.id, give);
    shortfall.set(b.id, Math.max(0, target - give));
    available -= give;
  }

  // 2. percent_of_income
  for (const b of buckets.filter((x) => x.mode === 'percent_of_income').sort(byPriority)) {
    const want = percentage(incomeMinor, b.percent ?? 0);
    const give = Math.min(want, available);
    funded.set(b.id, give);
    shortfall.set(b.id, Math.max(0, want - give));
    available -= give;
  }

  // 3. tax reserve (its own phase, after fixed + percent)
  for (const b of buckets.filter(isReserve).sort(byPriority)) {
    const target = b.target_minor ?? 0;
    const give = Math.min(target, available);
    funded.set(b.id, give);
    shortfall.set(b.id, Math.max(0, target - give));
    available -= give;
  }

  // 4. remainder buckets split what's left by weight (integer-scaled)
  const remainders = buckets.filter((x) => x.mode === 'remainder').sort(byPriority);
  if (remainders.length > 0 && available > 0) {
    const weights = remainders.map((b) => Math.max(0, Math.round((b.weight ?? 0) * 100)));
    const totalWeight = weights.reduce((s, w) => s + w, 0);
    if (totalWeight > 0) {
      const parts = splitByWeights(minor(available), weights);
      remainders.forEach((b, i) => funded.set(b.id, parts[i]!));
      available = 0;
    } else {
      for (const b of remainders) funded.set(b.id, 0);
    }
  } else {
    for (const b of remainders) funded.set(b.id, 0);
  }

  const lines: FundingLine[] = [...buckets]
    .sort(byPriority)
    .map((b) => {
      const target = b.mode === 'percent_of_income' ? percentage(incomeMinor, b.percent ?? 0) : (b.target_minor ?? ZERO);
      return {
        bucketId: b.id,
        name: b.name,
        mode: b.mode,
        targetMinor: minor(target),
        fundedMinor: clampNonNeg(funded.get(b.id) ?? 0),
        shortfallMinor: clampNonNeg(shortfall.get(b.id) ?? 0),
        isTaxReserve: isReserve(b),
      };
    });

  const allocatedMinor = minor(
    lines.filter((l) => !l.isTaxReserve).reduce((s, l) => s + l.fundedMinor, 0),
  );
  const taxReservedMinor = minor(
    lines.filter((l) => l.isTaxReserve).reduce((s, l) => s + l.fundedMinor, 0),
  );

  return { lines, allocatedMinor, taxReservedMinor };
}
