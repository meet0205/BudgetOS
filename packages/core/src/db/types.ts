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

// ---- Income (Feature 04) ----

export type IncomeDocType =
  | 'payslip' | 't4' | 't4a' | 't5' | 'invoice' | 'uber_summary' | 'manual';

export type IncomeKind =
  | 'employment' | 'self_employment' | 'investment' | 'rental' | 'other';

/** Controlled deduction vocabulary — Feature 05 consumes these by type. */
export type DeductionKind =
  | 'federal_tax' | 'provincial_tax'
  | 'cpp' | 'cpp2' | 'ei' | 'qpp' | 'qpip'
  | 'rpp' | 'rrsp' | 'union_dues'
  | 'group_benefits' | 'life_insurance' | 'ltd'
  | 'garnishment' | 'other';

export interface IncomeDocument {
  id: UUID;
  user_id: UUID;
  doc_type: IncomeDocType;
  income_kind: IncomeKind;
  source_file_id: UUID | null;
  employer_name: string | null;
  employer_id: string | null;
  period_start: string | null; // date
  period_end: string | null;   // date
  pay_date: string;            // date
  tax_year: number;
  province: string;            // char(2)
  gross_minor: Minor;
  net_minor: Minor | null;
  ytd_gross_minor: Minor | null;
  ytd_net_minor: Minor | null;
  platform_fees_minor: Minor;
  hst_collected_minor: Minor;
  currency_code: string;
  is_user_entered: boolean;
  /** Persisted so Feature 05 can exclude unbalanced records; see reconcile(). */
  reconciles: boolean;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
}

export interface IncomeDeduction {
  id: UUID;
  income_document_id: UUID;
  user_id: UUID;
  kind: DeductionKind;
  raw_label: string | null;
  amount_minor: Minor;
  ytd_amount_minor: Minor | null;
  is_user_entered: boolean;
}

export interface IncomeSource {
  id: UUID;
  user_id: UUID;
  name: string;
  income_kind: IncomeKind;
  employer_id: string | null;
  typical_gross_minor: Minor | null;
  pay_frequency: string | null;
  last_used_at: Timestamp | null;
}

/** An income document with its deductions — the unit reads and writes work in. */
export interface IncomeWithDeductions {
  document: IncomeDocument;
  deductions: IncomeDeduction[];
}

// ---- Allocation & safe-to-spend (Feature 06) ----

export type AllocationMode = 'fixed' | 'percent_of_income' | 'remainder';

export interface AllocationBucket {
  id: UUID;
  user_id: UUID;
  name: string;
  mode: AllocationMode;
  target_minor: Minor | null;      // fixed buckets
  percent: number | null;          // percent_of_income buckets (e.g. 10 for 10%)
  weight: number;                  // remainder split weight
  priority: number;                // funded ascending
  linked_account_id: UUID | null;
  is_system: boolean;
  system_kind: string | null;      // 'tax_reserve' identifies the reserve bucket
  is_archived: boolean;
  created_at: Timestamp;
}

export interface BucketBalance {
  id: UUID;
  user_id: UUID;
  bucket_id: UUID;
  period_start: string; // date
  period_end: string;   // date
  target_minor: Minor;
  funded_minor: Minor;
  spent_minor: Minor;
  shortfall_minor: Minor;
}

export interface SafeToSpendSnapshot {
  id: UUID;
  user_id: UUID;
  period_start: string; // date
  period_end: string;   // date
  income_minor: Minor;
  allocated_minor: Minor;
  tax_reserved_minor: Minor;
  spent_minor: Minor;
  safe_to_spend_minor: Minor;
  daily_minor: Minor;
  computed_at: Timestamp;
}
