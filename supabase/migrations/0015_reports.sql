-- 0015_reports.sql
-- Feature 17 — Reports.
-- Pre-aggregation so reports open fast over years of data: one row per user/
-- month/category and one per user/month. Reports read aggregates; drill-downs
-- read splits. Transfers are excluded from spend, refunds reduce the original
-- category. (The local app computes these live from the ledger; these tables are
-- the Postgres source of truth, maintained by trigger on the server.)

create table monthly_category_totals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  category_id uuid not null references categories(id),
  layer category_layer not null,
  total_minor bigint not null default 0,
  transaction_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_start, category_id, layer)
);

create table monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  income_minor bigint not null default 0,
  spend_minor bigint not null default 0,
  allocated_minor bigint not null default 0,
  tax_reserved_minor bigint not null default 0,
  net_minor bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

alter table monthly_category_totals enable row level security;
create policy owner on monthly_category_totals
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table monthly_summaries enable row level security;
create policy owner on monthly_summaries
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
