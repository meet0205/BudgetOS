import type { Minor } from '../money/minor.js';
import { minor, ZERO } from '../money/minor.js';
import type { IncomeDocument, IncomeDeduction } from '../db/types.js';

type DeductionLike = Pick<IncomeDeduction, 'amount_minor'>;
type DocLike = Pick<IncomeDocument, 'income_kind' | 'gross_minor' | 'net_minor'>;

/** Sum of deduction amounts, as Minor. */
export function deductionTotal(deductions: DeductionLike[]): Minor {
  return minor(deductions.reduce((sum, d) => sum + d.amount_minor, 0));
}

/**
 * Signed imbalance for an employment stub: gross − deductions − net.
 *   0  → balances
 *   >0 → deductions+net fall short of gross (money unaccounted)
 *   <0 → deductions+net exceed gross
 * Returns 0 for non-employment kinds (nothing to reconcile) and when net is absent.
 */
export function imbalance(doc: DocLike, deductions: DeductionLike[]): Minor {
  if (doc.income_kind !== 'employment') return ZERO;
  if (doc.net_minor == null) return ZERO;
  return minor(doc.gross_minor - deductionTotal(deductions) - doc.net_minor);
}

/**
 * Whether an income document balances. Only employment stubs reconcile
 * (gross − deductions === net); every other kind is trivially true.
 * Persisted on the document so Feature 05 can exclude unbalanced records.
 */
export function reconciles(doc: DocLike, deductions: DeductionLike[]): boolean {
  if (doc.income_kind !== 'employment') return true;
  if (doc.net_minor == null) return false;
  return doc.gross_minor - deductionTotal(deductions) === doc.net_minor;
}
