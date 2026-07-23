import type { Adapter } from '../adapter.js';
import type { Transaction, TransactionSplit, TransactionWithSplits, TxnKind } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import type { Minor } from '../../money/minor.js';
import { sum } from '../../money/arithmetic.js';

export const TRANSACTIONS = 'transactions';
export const TRANSACTION_SPLITS = 'transaction_splits';

export interface NewSplitInput {
  amount_minor: Minor;
  base_amount_minor: Minor;
  category_id?: UUID | null;
  note?: string | null;
  is_reimbursable?: boolean;
  reimbursed_at?: string | null;
  business_use_percent?: number;
  business_expense_kind?: string | null;
  hst_paid_minor?: Minor;
}

export interface NewTransactionInput {
  user_id: UUID;
  kind: TxnKind;
  occurred_at: string;
  total_minor: Minor;
  base_total_minor: Minor;
  currency_code?: string;
  fx_rate?: number | null;
  merchant_id?: UUID | null;
  account_id?: UUID | null;
  counterparty_account_id?: UUID | null;
  refund_of_transaction_id?: UUID | null;
  note?: string | null;
  receipt_id?: UUID | null;
  is_user_entered?: boolean;
  splits: NewSplitInput[];
}

export interface ListRange {
  /** Inclusive lower bound on occurred_at (ISO). */
  from?: string;
  /** Exclusive upper bound on occurred_at (ISO). */
  to?: string;
}

export class TransactionRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  /**
   * Create a transaction with its splits atomically. Enforces the split-sum
   * invariant (splits' amount_minor must equal total_minor) — the local mirror
   * of the Postgres deferred trigger.
   */
  async create(input: NewTransactionInput): Promise<TransactionWithSplits> {
    if (input.splits.length === 0) {
      throw new Error('a transaction needs at least one split');
    }

    const splitTotal = sum(input.splits.map((s) => s.amount_minor));
    if (splitTotal !== input.total_minor) {
      throw new Error(
        `splits (${splitTotal}) must equal transaction total (${input.total_minor})`,
      );
    }

    const now = this.clock.now();
    const txnId = this.newId();

    const transaction: Transaction = {
      id: txnId,
      user_id: input.user_id,
      kind: input.kind,
      occurred_at: input.occurred_at,
      total_minor: input.total_minor,
      currency_code: input.currency_code ?? 'CAD',
      fx_rate: input.fx_rate ?? null,
      base_total_minor: input.base_total_minor,
      merchant_id: input.merchant_id ?? null,
      account_id: input.account_id ?? null,
      counterparty_account_id: input.counterparty_account_id ?? null,
      refund_of_transaction_id: input.refund_of_transaction_id ?? null,
      note: input.note ?? null,
      receipt_id: input.receipt_id ?? null,
      is_user_entered: input.is_user_entered ?? true,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    const splits: TransactionSplit[] = input.splits.map((s) => ({
      id: this.newId(),
      transaction_id: txnId,
      user_id: input.user_id,
      category_id: s.category_id ?? null,
      amount_minor: s.amount_minor,
      base_amount_minor: s.base_amount_minor,
      note: s.note ?? null,
      is_reimbursable: s.is_reimbursable ?? false,
      reimbursed_at: s.reimbursed_at ?? null,
      business_use_percent: s.business_use_percent ?? 0,
      business_expense_kind: s.business_expense_kind ?? null,
      hst_paid_minor: s.hst_paid_minor ?? (0 as Minor),
      created_at: now,
    }));

    await this.adapter.tx(async (a) => {
      await a.insert(TRANSACTIONS, transaction);
      for (const split of splits) await a.insert(TRANSACTION_SPLITS, split);
    });

    return { transaction, splits };
  }

  /** Fetch one transaction with splits, respecting ownership and soft delete. */
  async get(userId: UUID, id: UUID): Promise<TransactionWithSplits | null> {
    const transaction = await this.adapter.get<Transaction>(TRANSACTIONS, id);
    if (!transaction || transaction.user_id !== userId || transaction.deleted_at !== null) {
      return null;
    }
    const allSplits = await this.adapter.all<TransactionSplit>(TRANSACTION_SPLITS);
    const splits = allSplits.filter((s) => s.transaction_id === id && s.user_id === userId);
    return { transaction, splits };
  }

  /**
   * List a user's transactions (newest occurred_at first), optionally bounded to
   * an occurred_at range. Soft-deleted rows are excluded.
   */
  async list(userId: UUID, range: ListRange = {}): Promise<TransactionWithSplits[]> {
    const all = await this.adapter.all<Transaction>(TRANSACTIONS);
    const matching = all
      .filter((t) => t.user_id === userId && t.deleted_at === null)
      .filter((t) => (range.from === undefined ? true : t.occurred_at >= range.from))
      .filter((t) => (range.to === undefined ? true : t.occurred_at < range.to))
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0));

    const allSplits = await this.adapter.all<TransactionSplit>(TRANSACTION_SPLITS);
    return matching.map((transaction) => ({
      transaction,
      splits: allSplits.filter((s) => s.transaction_id === transaction.id),
    }));
  }

  /** Soft-delete: sets deleted_at, never removes the row. Ownership-checked. */
  async softDelete(userId: UUID, id: UUID): Promise<void> {
    const transaction = await this.adapter.get<Transaction>(TRANSACTIONS, id);
    if (!transaction || transaction.user_id !== userId) {
      throw new Error(`transaction ${id} not found`);
    }
    if (transaction.deleted_at !== null) return; // already deleted, idempotent
    await this.adapter.update<Transaction>(TRANSACTIONS, id, {
      deleted_at: this.clock.now(),
      updated_at: this.clock.now(),
    });
  }
}
