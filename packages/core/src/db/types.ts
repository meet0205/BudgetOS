/**
 * Domain row types. These mirror the Postgres schema in supabase/migrations
 * (the source of truth) but use TS/JS-native representations:
 *   - money is `Minor` (integer cents)
 *   - timestamps are ISO strings
 *   - uuids are strings
 *
 * When Supabase is wired in, generated types should be assignable to these.
 */
import type { Minor } from '../money/minor.js';
import type { UUID } from './ids.js';
import type { Timestamp } from './clock.js';

export type TxnKind = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment';

export type AccountKind =
  | 'cash'
  | 'bank'
  | 'credit_card'
  | 'wallet'
  | 'savings'
  | 'investment'
  | 'loan';

export interface Account {
  id: UUID;
  user_id: UUID;
  name: string;
  kind: AccountKind;
  currency_code: string;
  opening_balance_minor: Minor;
  is_archived: boolean;
  sort_order: number;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
}

export type CategoryLayer = 'transaction' | 'product';

export interface Category {
  id: UUID;
  user_id: UUID | null; // NULL => system category, visible to all
  layer: CategoryLayer;
  slug: string;
  display_name: string;
  parent_id: UUID | null;
  icon: string | null;
  color: string | null;
  is_system: boolean;
  is_hidden: boolean;
  business_expense_kind: string | null;
  sort_order: number;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface Merchant {
  id: UUID;
  user_id: UUID;
  name: string;
  normalized_name: string;
  chain_id: UUID | null;
  default_category_id: UUID | null;
  transaction_count: number;
  last_seen_at: Timestamp | null;
  created_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface CategoryMerge {
  id: UUID;
  user_id: UUID;
  from_category_id: UUID;
  into_category_id: UUID;
  rows_moved: number;
  merged_at: Timestamp;
}

export interface Profile {
  id: UUID; // == auth user id
  display_name: string | null;
  base_currency: string; // char(3)
  country: string; // char(2)
  province: string; // char(2)
  month_start_day: number; // 1..28
  ocr_review_threshold: number; // 0..1
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface Transaction {
  id: UUID;
  user_id: UUID;
  kind: TxnKind;
  occurred_at: Timestamp; // real-world event time — drives report bucketing
  total_minor: Minor;
  currency_code: string;
  fx_rate: number | null;
  base_total_minor: Minor;
  merchant_id: UUID | null;
  account_id: UUID | null;
  counterparty_account_id: UUID | null;
  refund_of_transaction_id: UUID | null;
  note: string | null;
  receipt_id: UUID | null;
  is_user_entered: boolean;
  created_at: Timestamp;
  updated_at: Timestamp; // drives sync
  deleted_at: Timestamp | null; // soft delete
}

export interface TransactionSplit {
  id: UUID;
  transaction_id: UUID;
  user_id: UUID;
  category_id: UUID | null;
  amount_minor: Minor;
  base_amount_minor: Minor;
  note: string | null;
  is_reimbursable: boolean;
  reimbursed_at: string | null; // date
  business_use_percent: number; // 0..100
  business_expense_kind: string | null;
  hst_paid_minor: Minor;
  created_at: Timestamp;
}

/** A transaction together with its splits — the unit reads and writes work in. */
export interface TransactionWithSplits {
  transaction: Transaction;
  splits: TransactionSplit[];
}
