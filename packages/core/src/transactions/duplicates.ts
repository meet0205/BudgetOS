/**
 * Duplicate detection (Feature 03). On save, if a transaction with the same
 * amount, merchant, and calendar day already exists, the app asks rather than
 * blocks — two coffees at the same shop on one day is genuine. This is a
 * question, not a rejection.
 */
import type { Minor } from '../money/minor.js';
import type { UUID } from '../db/ids.js';
import type { TransactionWithSplits } from '../db/types.js';

export interface DuplicateProbe {
  total_minor: Minor;
  merchant_id: UUID | null;
  occurred_at: string; // ISO
}

/** Calendar day (UTC) of an ISO timestamp — duplicates match on day, not instant. */
function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Existing transactions that look like duplicates of `probe`: same amount, same
 * merchant, same day. A null merchant only matches another null merchant, so
 * uncategorised cash entries don't collide with every merchant-less row.
 */
export function findDuplicates(
  existing: readonly TransactionWithSplits[],
  probe: DuplicateProbe,
): TransactionWithSplits[] {
  const probeDay = dayOf(probe.occurred_at);
  return existing.filter(
    (t) =>
      t.transaction.deleted_at === null &&
      t.transaction.total_minor === probe.total_minor &&
      t.transaction.merchant_id === probe.merchant_id &&
      dayOf(t.transaction.occurred_at) === probeDay,
  );
}
