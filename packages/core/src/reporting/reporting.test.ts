import { describe, it, expect } from 'vitest';
import { minor, type Minor } from '../money/minor.js';
import { computeBalances } from './balances.js';
import { periodSummary } from './summary.js';
import type { Account, TransactionWithSplits, TxnKind } from '../db/types.js';

const m = (n: number) => minor(n) as Minor;

function account(id: string, opening: number): Account {
  return {
    id, user_id: 'u1', name: id, kind: 'bank', currency_code: 'CAD',
    opening_balance_minor: m(opening), is_archived: false, sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z', deleted_at: null,
  };
}

function txn(
  kind: TxnKind, total: number, opts: { account?: string; counterparty?: string; day?: string; deleted?: boolean } = {},
): TransactionWithSplits {
  const day = opts.day ?? '2026-07-15';
  return {
    transaction: {
      id: `${kind}-${total}-${day}`, user_id: 'u1', kind, occurred_at: `${day}T12:00:00.000Z`,
      total_minor: m(total), currency_code: 'CAD', fx_rate: null, base_total_minor: m(total),
      merchant_id: null, account_id: opts.account ?? null, counterparty_account_id: opts.counterparty ?? null,
      refund_of_transaction_id: null, note: null, receipt_id: null, is_user_entered: true,
      created_at: `${day}T12:00:00.000Z`, updated_at: `${day}T12:00:00.000Z`,
      deleted_at: opts.deleted ? `${day}T13:00:00.000Z` : null,
    },
    splits: [],
  };
}

describe('computeBalances', () => {
  it('signs each kind and moves both legs of a transfer', () => {
    const accounts = [account('chq', 100000), account('sav', 0)];
    const txns = [
      txn('expense', 4000, { account: 'chq' }), //  -40
      txn('income', 250000, { account: 'chq' }), // +2500
      txn('refund', 1000, { account: 'chq' }), //   +10
      txn('transfer', 50000, { account: 'chq', counterparty: 'sav' }), // -500 chq / +500 sav
    ];
    const balances = computeBalances(accounts, txns);
    // 1000.00 - 40 + 2500 + 10 - 500 = 2970.00
    expect(balances.get('chq')).toBe(297000);
    expect(balances.get('sav')).toBe(50000);
  });

  it('ignores soft-deleted transactions', () => {
    const accounts = [account('chq', 10000)];
    const txns = [txn('expense', 5000, { account: 'chq', deleted: true })];
    expect(computeBalances(accounts, txns).get('chq')).toBe(10000);
  });
});

describe('periodSummary', () => {
  const range = { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' };

  it('nets refunds against spend, counts income, excludes transfers', () => {
    const txns = [
      txn('expense', 10000, { account: 'chq' }),
      txn('refund', 2500, { account: 'chq' }),
      txn('income', 300000, { account: 'chq' }),
      txn('transfer', 50000, { account: 'chq', counterparty: 'sav' }),
    ];
    const s = periodSummary(txns, range);
    expect(s.grossSpend).toBe(10000);
    expect(s.refunds).toBe(2500);
    expect(s.netSpend).toBe(7500);
    expect(s.income).toBe(300000); // refund not counted as income
    expect(s.net).toBe(292500); // 300000 - 7500
  });

  it('excludes transactions outside the range', () => {
    const txns = [txn('expense', 9999, { account: 'chq', day: '2026-06-30' })];
    expect(periodSummary(txns, range).grossSpend).toBe(0);
  });
});
