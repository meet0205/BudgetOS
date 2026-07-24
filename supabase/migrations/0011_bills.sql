-- 0011_bills.sql
-- Feature 19 — Recurring bills.
-- A bill has a schedule; the app generates instances 90 days ahead. A safe-to-
-- spend figure that ignores rent due in three days is lying, so upcoming bills
-- surface on the dashboard. Payment matching (merchant + amount tolerance + date
-- window) is offered, not applied — silent linking makes bills appear paid when
-- they aren't. Bill creep compares paid amounts across instances.

create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant_id uuid references merchants(id),
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  expected_minor bigint not null,
  currency_code char(3) not null default 'CAD',
  frequency text not null,
  interval int not null default 1,
  day_of_month smallint,
  day_of_week smallint,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  amount_tolerance_percent numeric(5,2) not null default 10,
  date_tolerance_days int not null default 5,
  created_at timestamptz not null default now()
);

create type bill_state as enum
  ('upcoming','due','paid','skipped','overdue');

create table bill_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  due_date date not null,
  expected_minor bigint not null,
  state bill_state not null default 'upcoming',
  transaction_id uuid references transactions(id),
  paid_minor bigint,
  paid_on date,
  unique (bill_id, due_date)
);
create index on bill_instances (user_id, due_date) where state in ('upcoming','due','overdue');

alter table recurring_bills enable row level security;
create policy owner on recurring_bills
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table bill_instances enable row level security;
create policy owner on bill_instances
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
