-- 0008_merchants.sql
-- Feature 03 — Manual transaction entry.
-- Merchants are created on save, never on keystroke. normalized_name is the
-- match key shared with OCR merchant resolution (09): lowercased, punctuation
-- stripped, whitespace collapsed. The trigram index backs both autocomplete
-- here and fuzzy resolution there.

create table merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  chain_id uuid,
  default_category_id uuid references categories(id),
  transaction_count int not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on merchants using gin (normalized_name gin_trgm_ops);
create unique index on merchants (user_id, normalized_name)
  where deleted_at is null;

create table merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null,
  source text not null default 'user'
);
create index on merchant_aliases using gin (alias gin_trgm_ops);

-- Now that merchants exists, close the FK left open in 0003.
alter table transactions
  add constraint transactions_merchant_id_fkey
  foreign key (merchant_id) references merchants(id);

alter table merchants enable row level security;
create policy owner on merchants
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table merchant_aliases enable row level security;
create policy owner on merchant_aliases
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
