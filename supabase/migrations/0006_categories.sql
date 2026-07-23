-- 0006_categories.sql
-- Feature 02 — Categories.
-- Two layers: 'transaction' (receipt-level: Groceries, Vehicle) and 'product'
-- (line-level: Dairy, Fuel). Self-referencing hierarchy, max depth 3 (enforced
-- in application code — feature 02 tree.ts). System rows have user_id IS NULL
-- and are visible to everyone; they can be hidden but not deleted.

create type category_layer as enum ('transaction','product');

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,  -- NULL => system category
  layer category_layer not null,
  slug text not null,
  display_name text not null,
  parent_id uuid references categories(id),
  icon text,
  color text,
  is_system boolean not null default false,
  is_hidden boolean not null default false,
  business_expense_kind text,       -- CRA kind; product-layer categories used by feature 13
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
-- Coalesce NULL user_id so system and user slugs don't collide within a layer.
create unique index on categories
  (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), layer, slug);
create index on categories (user_id, layer, parent_id);

create table category_merges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_category_id uuid not null,
  into_category_id uuid not null,
  rows_moved int not null,
  merged_at timestamptz not null default now()
);

-- RLS: users see their own rows plus shared system rows (user_id IS NULL).
-- Writes are restricted to their own rows — nobody can mutate system categories.
alter table categories enable row level security;
create policy read_own_and_system on categories
  for select
  using (user_id = auth.uid() or user_id is null);
create policy write_own on categories
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table category_merges enable row level security;
create policy owner on category_merges
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
