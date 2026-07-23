/**
 * Period spend/income summary (Feature 03 reporting rules). Two rules live here:
 *   - Transfers are excluded — moving money between your own accounts is not
 *     spending, and counting it doubles every savings move.
 *   - Refunds net against spend — a refund reduces the category's spend rather
 *     than counting as income; an unlinked refund would otherwise inflate both.
 *
 * Bucketing is by `occurred_at` (real-world event time), in base currency.
 */
import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { TransactionWithSplits } from '../db/types.js';

export interface PeriodRange {
  from: string; // inclusive ISO
  to: string; // exclusive ISO
}

export interface PeriodSummary {
  grossSpend: Minor; // expenses only
  refunds: Minor; // money returned
  netSpend: Minor; // grossSpend − refunds, floored at nothing below the refunds
  income: Minor; // income only (refunds NOT counted here)
  net: Minor; // income − netSpend
}

export function periodSummary(
  transactions: readonly TransactionWithSplits[],
  range: PeriodRange,
): PeriodSummary {
  let grossSpend = 0;
  let refunds = 0;
  let income = 0;

  for (const { transaction: t } of transactions) {
    if (t.deleted_at !== null) continue;
    if (t.occurred_at < range.from || t.occurred_at >= range.to) continue;
    switch (t.kind) {
      case 'expense':
        grossSpend += t.base_total_minor;
        break;
      case 'refund':
        refunds += t.base_total_minor;
        break;
      case 'income':
        income += t.base_total_minor;
        break;
      // transfer + adjustment excluded from spend/income reporting
    }
  }

  const netSpend = grossSpend - refunds;
  return {
    grossSpend: minor(grossSpend),
    refunds: minor(refunds),
    netSpend: minor(netSpend),
    income: minor(income),
    net: minor(income - netSpend),
  };
}
