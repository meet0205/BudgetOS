import type { Minor } from '../money/minor.js';
import type { RecurringBill } from '../db/types.js';

type MatchBill = Pick<RecurringBill, 'merchant_id' | 'expected_minor' | 'amount_tolerance_percent' | 'date_tolerance_days'>;

interface MatchTxn {
  merchant_id: string | null;
  total_minor: Minor;
  occurred_at: string; // ISO
}

const MS_DAY = 86_400_000;
function dayDiff(dateISO: string, otherISO: string): number {
  return Math.abs(new Date(dateISO.slice(0, 10)).getTime() - new Date(otherISO.slice(0, 10)).getTime()) / MS_DAY;
}

/**
 * Whether a transaction matches a bill instance: merchant agrees (when the bill
 * names one), amount is within tolerance, and the date is within the window.
 * Matches are *offered*, not applied — silent linking makes bills appear paid
 * when they aren't (PRD 19).
 */
export function matchesInstance(bill: MatchBill, dueDate: string, txn: MatchTxn): boolean {
  if (bill.merchant_id && txn.merchant_id && bill.merchant_id !== txn.merchant_id) return false;

  const tolerance = (Math.abs(bill.expected_minor) * bill.amount_tolerance_percent) / 100;
  if (Math.abs(txn.total_minor - bill.expected_minor) > tolerance) return false;

  return dayDiff(dueDate, txn.occurred_at) <= bill.date_tolerance_days;
}
