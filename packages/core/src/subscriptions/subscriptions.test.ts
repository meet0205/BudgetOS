import { describe, it, expect } from 'vitest';
import { toMinor } from '../money/minor.js';
import { detectSubscriptions } from './detect.js';
import type { TransactionWithSplits } from '../db/types.js';

function charge(merchantId: string | null, at: string, amt: string, kind = 'expense'): TransactionWithSplits {
  const m = toMinor(amt);
  return {
    transaction: {
      id: at + (merchantId ?? 'x'), user_id: 'u', kind: kind as any, occurred_at: at, total_minor: m,
      currency_code: 'CAD', fx_rate: null, base_total_minor: m, merchant_id: merchantId,
      account_id: null, counterparty_account_id: null, refund_of_transaction_id: null, note: null,
      receipt_id: null, is_user_entered: true, created_at: at, updated_at: at, deleted_at: null,
    },
    splits: [],
  };
}

describe('detectSubscriptions', () => {
  it('detects a monthly same-merchant recurring charge', () => {
    const txns = [
      charge('netflix', '2026-05-02T12:00:00Z', '16.49'),
      charge('netflix', '2026-06-02T12:00:00Z', '16.49'),
      charge('netflix', '2026-07-02T12:00:00Z', '16.49'),
    ];
    const subs = detectSubscriptions(txns);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.merchantId).toBe('netflix');
    expect(subs[0]!.typicalMinor).toBe(toMinor('16.49'));
    expect(subs[0]!.occurrences).toBe(3);
    expect(subs[0]!.avgIntervalDays).toBeGreaterThanOrEqual(29);
    expect(subs[0]!.avgIntervalDays).toBeLessThanOrEqual(31);
  });

  it('tolerates small price changes within the threshold', () => {
    const txns = [
      charge('spotify', '2026-05-10T12:00:00Z', '10.99'),
      charge('spotify', '2026-06-10T12:00:00Z', '11.99'), // ~9% rise, within 15%
      charge('spotify', '2026-07-10T12:00:00Z', '11.99'),
    ];
    expect(detectSubscriptions(txns)).toHaveLength(1);
  });

  it('ignores one-offs and merchants below the occurrence floor', () => {
    const txns = [
      charge('gap', '2026-07-01T12:00:00Z', '84.00'),
      charge('gap', '2026-07-15T12:00:00Z', '12.00'), // different amounts, only 2
    ];
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });

  it('ignores non-expense kinds and null merchants', () => {
    const txns = [
      charge(null, '2026-05-01T12:00:00Z', '9.99'),
      charge(null, '2026-06-01T12:00:00Z', '9.99'),
      charge(null, '2026-07-01T12:00:00Z', '9.99'),
      charge('x', '2026-05-01T12:00:00Z', '9.99', 'income'),
    ];
    expect(detectSubscriptions(txns)).toHaveLength(0);
  });
});
