-- 0005_accounts.sql
-- Feature 02 — Accounts.
-- Accounts track where money moved, not bank reconciliation. No bank connection.

create type account_kind as enum
  ('cash','bank','credit_card','wallet','savings','investment','loan');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind account_kind not null,
  currency_code char(3) not null default 'CAD',
  opening_balance_minor bigint not null default 0,
  is_archived boolean not null default false,   -- hidden from pickers, kept in history
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on accounts (user_id)
  where deleted_at is null;

alter table accounts enable row level security;
create policy owner on accounts
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
