-- 0004_rls.sql
-- Feature 01 — Data foundation.
-- Row-level security on every user-data table: user_id = auth.uid(), no exceptions.
-- profiles keys on id (which IS the user id).

alter table profiles enable row level security;
create policy owner on profiles
  using (id = auth.uid())
  with check (id = auth.uid());

alter table transactions enable row level security;
create policy owner on transactions
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table transaction_splits enable row level security;
create policy owner on transaction_splits
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
