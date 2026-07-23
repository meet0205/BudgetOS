import { describe, it, expect } from 'vitest';
import { minor, type Minor } from '../money/minor.js';
import { remainder, isBalanced, prefillNext } from './split.js';
import { buildTransfer } from './transfer.js';
import { buildRefund } from './refund.js';
import { findDuplicates } from './duplicates.js';
import type { TransactionWithSplits } from '../db/types.js';

const m = (n: number) => minor(n) as Minor;

describe('split remainder', () => {
  it('is total minus the sum of splits, signed', () => {
    expect(remainder(m(10000), [m(4000)])).toBe(6000); // $60 left
    expect(remainder(m(10000), [m(10500)])).toBe(-500); // $5 over
    expect(remainder(m(10000), [m(4000), m(6000)])).toBe(0);
  });

  it('reports balanced only when nothing remains', () => {
    expect(isBalanced(m(10000), [m(4000), m(6000)])).toBe(true);
    expect(isBalanced(m(10000), [m(4000)])).toBe(false);
  });

  it('prefills the next row with the positive remainder, never negative', () => {
    expect(prefillNext(m(10000), [m(4000)])).toBe(6000);
    expect(prefillNext(m(10000), [m(10500)])).toBe(0); // over-allocated → 0
  });
});

describe('buildTransfer', () => {
  it('builds a transfer with both accounts and a single uncategorised split', () => {
    const t = buildTransfer({
      userId: 'u1',
      amount: m(5000),
      fromAccountId: 'a1',
      toAccountId: 'a2',
      occurredAt: '2026-07-23T12:00:00.000Z',
    });
    expect(t.kind).toBe('transfer');
    expect(t.account_id).toBe('a1');
    expect(t.counterparty_account_id).toBe('a2');
    expect(t.total_minor).toBe(5000);
    expect(t.splits).toHaveLength(1);
    expect(t.splits[0]?.category_id).toBeNull();
  });

  it('rejects a zero/negative amount and a same-account transfer', () => {
    const base = { userId: 'u1', occurredAt: '2026-07-23T12:00:00.000Z' };
    expect(() => buildTransfer({ ...base, amount: m(0), fromAccountId: 'a1', toAccountId: 'a2' })).toThrow();
    expect(() => buildTransfer({ ...base, amount: m(5000), fromAccountId: 'a1', toAccountId: 'a1' })).toThrow();
  });
});

describe('buildRefund', () => {
  const original: TransactionWithSplits = {
    transaction: {
      id: 'orig', user_id: 'u1', kind: 'expense', occurred_at: '2026-07-01T12:00:00.000Z',
      total_minor: m(10000), currency_code: 'CAD', fx_rate: null, base_total_minor: m(10000),
      merchant_id: 'merch-1', account_id: 'a1', counterparty_account_id: null,
      refund_of_transaction_id: null, note: null, receipt_id: null, is_user_entered: true,
      created_at: '2026-07-01T12:00:00.000Z', updated_at: '2026-07-01T12:00:00.000Z', deleted_at: null,
    },
    splits: [
      { id: 's1', transaction_id: 'orig', user_id: 'u1', category_id: 'cat-groceries',
        amount_minor: m(7000), base_amount_minor: m(7000), note: null, is_reimbursable: false,
        reimbursed_at: null, business_use_percent: 0, business_expense_kind: null,
        hst_paid_minor: m(0), created_at: '2026-07-01T12:00:00.000Z' },
      { id: 's2', transaction_id: 'orig', user_id: 'u1', category_id: 'cat-household',
        amount_minor: m(3000), base_amount_minor: m(3000), note: null, is_reimbursable: false,
        reimbursed_at: null, business_use_percent: 0, business_expense_kind: null,
        hst_paid_minor: m(0), created_at: '2026-07-01T12:00:00.000Z' },
    ],
  };

  it('links to the original and mirrors categories on a full refund', () => {
    const r = buildRefund({ userId: 'u1', original, amount: m(10000), occurredAt: '2026-07-05T12:00:00.000Z' });
    expect(r.kind).toBe('refund');
    expect(r.refund_of_transaction_id).toBe('orig');
    expect(r.merchant_id).toBe('merch-1');
    expect(r.account_id).toBe('a1');
    expect(r.splits.map((s) => s.category_id)).toEqual(['cat-groceries', 'cat-household']);
  });

  it('puts a partial refund on a single category', () => {
    const r = buildRefund({ userId: 'u1', original, amount: m(2500), occurredAt: '2026-07-05T12:00:00.000Z' });
    expect(r.splits).toHaveLength(1);
    expect(r.splits[0]?.amount_minor).toBe(2500);
    expect(r.splits[0]?.category_id).toBe('cat-groceries'); // original's first split
  });

  it('rejects a refund larger than the original', () => {
    expect(() => buildRefund({ userId: 'u1', original, amount: m(10001), occurredAt: '2026-07-05T12:00:00.000Z' })).toThrow();
  });
});

describe('findDuplicates', () => {
  const txn = (id: string, total: number, merchant: string | null, day: string): TransactionWithSplits => ({
    transaction: {
      id, user_id: 'u1', kind: 'expense', occurred_at: `${day}T09:00:00.000Z`,
      total_minor: m(total), currency_code: 'CAD', fx_rate: null, base_total_minor: m(total),
      merchant_id: merchant, account_id: 'a1', counterparty_account_id: null,
      refund_of_transaction_id: null, note: null, receipt_id: null, is_user_entered: true,
      created_at: `${day}T09:00:00.000Z`, updated_at: `${day}T09:00:00.000Z`, deleted_at: null,
    },
    splits: [],
  });

  const existing = [txn('t1', 599, 'coffee', '2026-07-23'), txn('t2', 4000, 'grocer', '2026-07-23')];

  it('flags same amount + merchant + day', () => {
    const dups = findDuplicates(existing, { total_minor: m(599), merchant_id: 'coffee', occurred_at: '2026-07-23T15:00:00.000Z' });
    expect(dups.map((d) => d.transaction.id)).toEqual(['t1']);
  });

  it('does not flag a different day or amount', () => {
    expect(findDuplicates(existing, { total_minor: m(599), merchant_id: 'coffee', occurred_at: '2026-07-24T09:00:00.000Z' })).toHaveLength(0);
    expect(findDuplicates(existing, { total_minor: m(600), merchant_id: 'coffee', occurred_at: '2026-07-23T09:00:00.000Z' })).toHaveLength(0);
  });
});
