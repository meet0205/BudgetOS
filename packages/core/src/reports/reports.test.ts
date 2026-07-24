import { describe, it, expect } from 'vitest';
import { toMinor, minor } from '../money/minor.js';
import { categoryTotals, priorYearPeriod } from './breakdown.js';
import { toCSV } from './csv.js';
import type { TransactionWithSplits } from '../db/types.js';

function txn(kind: string, at: string, splits: [string | null, string][], total?: string): TransactionWithSplits {
  const tot = total ? toMinor(total) : minor(splits.reduce((s, [, a]) => s + toMinor(a), 0));
  return {
    transaction: {
      id: at + kind, user_id: 'u', kind: kind as any, occurred_at: at, total_minor: tot,
      currency_code: 'CAD', fx_rate: null, base_total_minor: tot, merchant_id: null,
      account_id: null, counterparty_account_id: null, refund_of_transaction_id: null, note: null,
      receipt_id: null, is_user_entered: true, created_at: at, updated_at: at, deleted_at: null,
    },
    splits: splits.map(([cat, a], i) => ({
      id: `${at}${i}`, transaction_id: at + kind, user_id: 'u', category_id: cat,
      amount_minor: toMinor(a), base_amount_minor: toMinor(a), note: null, is_reimbursable: false,
      reimbursed_at: null, business_use_percent: 0, business_expense_kind: null, hst_paid_minor: minor(0),
      created_at: at,
    })),
  };
}

const FROM = '2026-07-01T00:00:00.000Z';
const TO = '2026-08-01T00:00:00.000Z';

describe('categoryTotals', () => {
  const txns = [
    txn('expense', '2026-07-10T12:00:00Z', [['groceries', '100.00']]),
    txn('expense', '2026-07-15T12:00:00Z', [['groceries', '50.00'], ['household', '30.00']]),
    txn('refund', '2026-07-20T12:00:00Z', [['groceries', '20.00']]),
    txn('transfer', '2026-07-18T12:00:00Z', [[null, '400.00']]),
    txn('income', '2026-07-01T12:00:00Z', [[null, '3000.00']]),
    txn('expense', '2026-06-30T12:00:00Z', [['groceries', '999.00']]), // out of period
  ];

  it('sums expense splits, subtracts refunds, excludes transfers and income', () => {
    const totals = categoryTotals(txns, FROM, TO);
    const groc = totals.find((t) => t.categoryId === 'groceries')!;
    expect(groc.total).toBe(toMinor('130.00')); // 100 + 50 − 20
    const house = totals.find((t) => t.categoryId === 'household')!;
    expect(house.total).toBe(toMinor('30.00'));
    // no transfer/income categories, no June row
    expect(totals.find((t) => t.categoryId === null || t.categoryId === 'none')).toBeUndefined();
    expect(totals).toHaveLength(2);
  });

  it('sorts largest first', () => {
    const totals = categoryTotals(txns, FROM, TO);
    expect(totals[0]!.categoryId).toBe('groceries');
  });
});

describe('priorYearPeriod', () => {
  it('shifts a period back one year', () => {
    const p = priorYearPeriod('2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    expect(p.from.slice(0, 10)).toBe('2025-07-01');
    expect(p.to.slice(0, 10)).toBe('2025-08-01');
  });
  it('clamps Feb 29 back to Feb 28 in a non-leap prior year', () => {
    const p = priorYearPeriod('2024-02-29T00:00:00.000Z', '2024-03-01T00:00:00.000Z');
    expect(p.from.slice(0, 10)).toBe('2023-02-28');
  });
});

describe('toCSV', () => {
  it('serialises and quotes fields with commas or quotes', () => {
    const csv = toCSV(['Category', 'Total'], [['Groceries', '130.00'], ['Dining, out', '"deluxe"']]);
    expect(csv).toBe('Category,Total\nGroceries,130.00\n"Dining, out","""deluxe"""');
  });
});
