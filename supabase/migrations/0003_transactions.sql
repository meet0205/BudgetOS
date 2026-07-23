-- 0003_transactions.sql
-- Feature 01 — Data foundation.
-- The split-based ledger. A transaction is a container; the splits ARE the
-- ledger and all reporting reads splits, never transaction totals.
--
-- Invariant: splits must sum to the transaction total. Enforced by a deferred
-- constraint trigger so a multi-split insert validates at commit, not per row.

create type txn_kind as enum
  ('expense','income','transfer','refund','adjustment');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind txn_kind not null,
  occurred_at timestamptz not null,            -- real-world event time; drives report bucketing
  total_minor bigint not null,                 -- integer cents, transaction currency
  currency_code char(3) not null default 'CAD',
  fx_rate numeric(18,8),
  base_total_minor bigint not null,            -- integer cents, profile base currency
  merchant_id uuid,
  account_id uuid,
  counterparty_account_id uuid,                -- the other leg of a transfer
  refund_of_transaction_id uuid references transactions(id),
  note text,
  receipt_id uuid,
  is_user_entered boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),  -- drives sync
  deleted_at timestamptz                          -- soft delete
);
create index on transactions (user_id, occurred_at desc)
  where deleted_at is null;
create index on transactions (user_id, kind, occurred_at desc)
  where deleted_at is null;

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function set_updated_at();

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  amount_minor bigint not null,                -- integer cents, transaction currency
  base_amount_minor bigint not null,           -- integer cents, base currency
  note text,
  is_reimbursable boolean not null default false,
  reimbursed_at date,
  business_use_percent numeric(5,2) not null default 0
    check (business_use_percent between 0 and 100),
  business_expense_kind text,                  -- CRA kind, set by feature 13
  hst_paid_minor bigint not null default 0,    -- used by feature 30
  created_at timestamptz not null default now()
);
create index on transaction_splits (transaction_id);
create index on transaction_splits (user_id, category_id);
create index on transaction_splits (user_id)
  where business_use_percent > 0;

-- The sum invariant. Deferred so a multi-row insert validates once, at commit.
create or replace function check_split_sum() returns trigger as $$
declare
  target_txn uuid := coalesce(new.transaction_id, old.transaction_id);
  txn_total bigint;
  split_total bigint;
begin
  -- If the parent transaction is gone (cascade delete), nothing to check.
  select total_minor into txn_total from transactions where id = target_txn;
  if not found then
    return null;
  end if;

  select coalesce(sum(amount_minor), 0) into split_total
    from transaction_splits
    where transaction_id = target_txn;

  if split_total <> txn_total then
    raise exception 'Splits (%) must equal transaction total (%) for transaction %',
      split_total, txn_total, target_txn;
  end if;
  return null;
end;
$$ language plpgsql;

create constraint trigger split_sum_check
  after insert or update or delete on transaction_splits
  deferrable initially deferred
  for each row execute function check_split_sum();
