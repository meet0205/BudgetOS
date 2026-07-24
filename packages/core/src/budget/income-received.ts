import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { IncomeDocument } from '../db/types.js';
import type { Period } from './period.js';

/** Money that actually lands, per document: net for employment, gross − fees for self-employment. */
export function receivedAmount(doc: Pick<IncomeDocument, 'income_kind' | 'gross_minor' | 'net_minor' | 'platform_fees_minor'>): Minor {
  if (doc.income_kind === 'employment') return minor(doc.net_minor ?? doc.gross_minor);
  if (doc.income_kind === 'self_employment') return minor(doc.gross_minor - doc.platform_fees_minor);
  return minor(doc.gross_minor);
}

/**
 * Income received in a period — the money available to allocate (PRD 06). Sums
 * `receivedAmount` over documents whose pay_date falls in [period.start, period.end).
 */
export function receivedIncomeMinor(
  docs: Pick<IncomeDocument, 'income_kind' | 'gross_minor' | 'net_minor' | 'platform_fees_minor' | 'pay_date' | 'deleted_at'>[],
  period: Period,
): Minor {
  const total = docs
    .filter((d) => d.deleted_at === null && d.pay_date >= period.start && d.pay_date < period.end)
    .reduce((sum, d) => sum + receivedAmount(d), 0);
  return minor(total);
}
