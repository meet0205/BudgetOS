import type { AllocationBucket, IncomeDocument } from '../db/types.js';
import { TAX_RESERVE_KIND } from './allocate.js';

type IncomeKindOnly = Pick<IncomeDocument, 'income_kind' | 'deleted_at'>;
type SystemKindOnly = Pick<AllocationBucket, 'system_kind'>;

export function isReserveBucket(b: SystemKindOnly): boolean {
  return b.system_kind === TAX_RESERVE_KIND;
}

/** Any live self-employment income means the tax reserve must exist. */
export function hasSelfEmploymentIncome(docs: IncomeKindOnly[]): boolean {
  return docs.some((d) => d.income_kind === 'self_employment' && d.deleted_at === null);
}

/** The reserve bucket should be auto-created when SE income appears and none exists. */
export function needsReserveBucket(buckets: SystemKindOnly[], docs: IncomeKindOnly[]): boolean {
  return hasSelfEmploymentIncome(docs) && !buckets.some(isReserveBucket);
}

/**
 * The reserve bucket cannot be deleted while self-employment income exists —
 * that is the specific failure this product prevents. Non-reserve buckets are
 * always deletable.
 */
export function canDeleteBucket(bucket: SystemKindOnly, docs: IncomeKindOnly[]): boolean {
  if (!isReserveBucket(bucket)) return true;
  return !hasSelfEmploymentIncome(docs);
}
