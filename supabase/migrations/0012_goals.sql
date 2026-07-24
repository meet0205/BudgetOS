-- 0012_goals.sql
-- Feature 21 — Savings goals.
-- A goal has a target amount and either a target date or a monthly contribution;
-- entering one computes the other (bidirectional solve in packages/core goals/).
-- Goals fund from allocation buckets in priority order; a goal that can't be
-- fully funded this period takes what it can and shows the revised date.

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_minor bigint not null,
  current_minor bigint not null default 0,
  target_date date,
  monthly_contribution_minor bigint,
  priority int not null default 100,
  bucket_id uuid references allocation_buckets(id),
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);
create index on goals (user_id, priority);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  amount_minor bigint not null,
  occurred_at date not null,
  source text not null default 'allocation'
);
create index on goal_contributions (goal_id);

alter table goals enable row level security;
create policy owner on goals
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table goal_contributions enable row level security;
create policy owner on goal_contributions
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
