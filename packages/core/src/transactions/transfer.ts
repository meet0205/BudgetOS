/**
 * Transfer construction (Feature 03). A transfer moves money between two of the
 * user's own accounts. It is NOT spending — counting it would double every month
 * a user moves savings — so reports exclude `kind = 'transfer'`.
 *
 * The built schema (01) carries both accounts on the transaction row itself
 * (`account_id` = source, `counterparty_account_id` = destination), so the
 * transfer is a single positive-amount transaction rather than a pair of signed
 * splits; balance computation signs each leg (see reporting/balances). The split
 * is uncategorised — a transfer has no spending category.
 */
import type { Minor } from '../money/minor.js';
import type { UUID } from '../db/ids.js';
import type { NewTransactionInput } from '../db/repositories/transactions.js';

export interface TransferInput {
  userId: UUID;
  amount: Minor; // positive; the amount leaving source and arriving at destination
  fromAccountId: UUID;
  toAccountId: UUID;
  occurredAt: string; // ISO
  note?: string | null;
}

export function buildTransfer(input: TransferInput): NewTransactionInput {
  if (input.amount <= 0) throw new Error('transfer amount must be greater than zero');
  if (input.fromAccountId === input.toAccountId) {
    throw new Error('transfer source and destination must differ');
  }
  return {
    user_id: input.userId,
    kind: 'transfer',
    occurred_at: input.occurredAt,
    total_minor: input.amount,
    base_total_minor: input.amount,
    account_id: input.fromAccountId,
    counterparty_account_id: input.toAccountId,
    note: input.note ?? null,
    splits: [
      {
        amount_minor: input.amount,
        base_amount_minor: input.amount,
        category_id: null,
      },
    ],
  };
}
