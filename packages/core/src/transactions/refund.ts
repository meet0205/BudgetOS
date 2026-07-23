/**
 * Refund construction (Feature 03). A refund links to the transaction it
 * reverses via `refund_of_transaction_id`. The link matters: an unlinked refund
 * looks like income, which distorts both reports and the tax estimate. Reports
 * net a refund against the original category's spend rather than counting it as
 * earnings.
 *
 * The refund carries a positive total (money coming back); reporting signs it
 * negative against spend. Its splits default to the original's categories so the
 * refund lands on the same lines it reverses.
 */
import type { Minor } from '../money/minor.js';
import type { UUID } from '../db/ids.js';
import type { TransactionWithSplits } from '../db/types.js';
import type { NewTransactionInput, NewSplitInput } from '../db/repositories/transactions.js';

export interface RefundInput {
  userId: UUID;
  original: TransactionWithSplits;
  amount: Minor; // positive; the amount refunded (may be partial)
  occurredAt: string; // ISO
  accountId?: UUID | null; // where the money landed; defaults to the original's account
  note?: string | null;
  /** Category for the refund split when it isn't taken from the original. */
  categoryId?: UUID | null;
}

export function buildRefund(input: RefundInput): NewTransactionInput {
  if (input.amount <= 0) throw new Error('refund amount must be greater than zero');
  if (input.amount > input.original.transaction.total_minor) {
    throw new Error('refund cannot exceed the original transaction total');
  }

  // A full refund mirrors the original's category; a partial refund lands on a
  // single category (the passed one, else the original's first split).
  const isFull = input.amount === input.original.transaction.total_minor;
  const splits: NewSplitInput[] = isFull
    ? input.original.splits.map((s) => ({
        amount_minor: s.amount_minor,
        base_amount_minor: s.base_amount_minor,
        category_id: s.category_id,
      }))
    : [
        {
          amount_minor: input.amount,
          base_amount_minor: input.amount,
          category_id: input.categoryId ?? input.original.splits[0]?.category_id ?? null,
        },
      ];

  return {
    user_id: input.userId,
    kind: 'refund',
    occurred_at: input.occurredAt,
    total_minor: input.amount,
    base_total_minor: input.amount,
    account_id: input.accountId ?? input.original.transaction.account_id,
    merchant_id: input.original.transaction.merchant_id,
    refund_of_transaction_id: input.original.transaction.id,
    note: input.note ?? null,
    splits,
  };
}
