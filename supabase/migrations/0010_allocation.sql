-- 0010_allocation.sql
-- Feature 06 — Allocation buckets & safe-to-spend.
-- Buckets are named claims on income, funded in priority order: fixed and
-- percent buckets first, then the system tax reserve (system_kind='tax_reserve',
-- created when self-employment income first appears and undeletable while it
-- exists), then remainder buckets. safe_to_spend = income − allocated − reserved
-- − spent, recomputed on every income/expense/bucket change (see packages/core
-- src/budget). Period boundaries honour profiles.month_start_day via period.ts.

create type allocation_mode as enum
  ('fixed','percent_of_income','remainder');

create table allocation_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mode allocation_mode not null,
  target_minor bigint,
  percent numeric(5,2),
  weight numeric(5,2) not null default 1,
  priority int not null default 100,
  linked_account_id uuid references accounts(id),
  is_system boolean not null default false,
  system_kind text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on allocation_buckets (user_id, priority);

create table bucket_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id uuid not null references allocation_buckets(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target_minor bigint not null,
  funded_minor bigint not null default 0,
  spent_minor bigint not null default 0,
  shortfall_minor bigint not null default 0,
  unique (bucket_id, period_start)
);

create table safe_to_spend_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  income_minor bigint not null,
  allocated_minor bigint not null,
  tax_reserved_minor bigint not null,
  spent_minor bigint not null,
  safe_to_spend_minor bigint not null,
  daily_minor bigint not null,
  computed_at timestamptz not null default now()
);
create index on safe_to_spend_snapshots (user_id, period_start desc);

alter table allocation_buckets enable row level security;
create policy owner on allocation_buckets
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table bucket_balances enable row level security;
create policy owner on bucket_balances
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table safe_to_spend_snapshots enable row level security;
create policy owner on safe_to_spend_snapshots
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
