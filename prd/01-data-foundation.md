# 01 — Data Foundation & Schema

**Priority:** P0
**Depends on:** nothing
**Blocks:** everything

---

## Problem

Every later feature reads and writes money. If the money representation is wrong, or if the ledger shape can't express refunds, transfers, and split transactions, the errors surface months later as reports that don't reconcile and a tax estimate built on bad inputs.

This feature exists to get the foundation right once.

---

## Behaviour

Not user-facing. The user sees the result of this feature as: numbers that always add up, deleted things that can be recovered, and data that survives a device change.

---

## Mechanism

### Money representation

**Integer cents. No floats. Anywhere.**

`bigint` in Postgres, `number` in TypeScript with a branded type to prevent accidental float arithmetic:

```ts
type Minor = number & { readonly __brand: 'minor' };

const toMinor = (major: string): Minor => {
  const [whole, frac = ''] = major.split('.');
  const cents = (frac + '00').slice(0, 2);
  return (parseInt(whole, 10) * 100 + parseInt(cents, 10)) as Minor;
};

const format = (m: Minor, currency = 'CAD') =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency })
    .format(m / 100);
```

Division only at the display boundary. Any intermediate calculation stays in integers.

### Split-based ledger

A transaction is a container. **The splits are the ledger.** All reporting reads splits, never transaction totals.

This shape handles the cases that break simpler designs:

| Case | Shape |
|---|---|
| Simple purchase | 1 transaction, 1 split |
| Grocery trip across categories | 1 transaction, N splits |
| Transfer between accounts | 1 transaction, 2 splits (one negative) |
| Partial refund | 1 transaction, 1 negative split, linked to original |
| Reimbursable expense | 1 split flagged `is_reimbursable` |
| Business expense | 1 split with `business_use_percent > 0` |

**Invariant: splits must sum to the transaction total.** Enforced by trigger, not application code.

### Soft deletes

`deleted_at timestamptz` on every user-data table. Queries filter `deleted_at is null` via a view or a repository-layer default. Nothing is hard-deleted except on explicit account deletion.

### Timestamps

- `created_at` — row creation
- `updated_at` — maintained by trigger
- `occurred_at` / `purchased_at` — when the real-world event happened

Reports use the real-world timestamp. Sync uses the row timestamps. Conflating them produces transactions that appear in the wrong month.

---

## Data

```sql
create extension if not exists pg_trgm;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency char(3) not null default 'CAD',
  country char(2) not null default 'CA',
  province char(2) not null default 'NS',
  month_start_day smallint not null default 1
    check (month_start_day between 1 and 28),
  ocr_review_threshold numeric(3,2) not null default 0.80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type txn_kind as enum
  ('expense','income','transfer','refund','adjustment');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind txn_kind not null,
  occurred_at timestamptz not null,
  total_minor bigint not null,
  currency_code char(3) not null default 'CAD',
  fx_rate numeric(18,8),
  base_total_minor bigint not null,
  merchant_id uuid,
  account_id uuid,
  counterparty_account_id uuid,
  refund_of_transaction_id uuid references transactions(id),
  note text,
  receipt_id uuid,
  is_user_entered boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on transactions (user_id, occurred_at desc)
  where deleted_at is null;
create index on transactions (user_id, kind, occurred_at desc)
  where deleted_at is null;

create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid,
  amount_minor bigint not null,
  base_amount_minor bigint not null,
  note text,
  is_reimbursable boolean not null default false,
  reimbursed_at date,
  business_use_percent numeric(5,2) not null default 0
    check (business_use_percent between 0 and 100),
  business_expense_kind text,
  hst_paid_minor bigint not null default 0,
  created_at timestamptz not null default now()
);
create index on transaction_splits (transaction_id);
create index on transaction_splits (user_id, category_id);
create index on transaction_splits (user_id)
  where business_use_percent > 0;
```

### The sum invariant

```sql
create or replace function check_split_sum() returns trigger as $$
declare
  txn_total bigint;
  split_total bigint;
begin
  select total_minor into txn_total
    from transactions where id = coalesce(new.transaction_id, old.transaction_id);

  select coalesce(sum(amount_minor), 0) into split_total
    from transaction_splits
    where transaction_id = coalesce(new.transaction_id, old.transaction_id);

  if split_total <> txn_total then
    raise exception 'Splits (%) must equal transaction total (%)',
      split_total, txn_total;
  end if;
  return null;
end;
$$ language plpgsql;

create constraint trigger split_sum_check
  after insert or update or delete on transaction_splits
  deferrable initially deferred
  for each row execute function check_split_sum();
```

Deferred, so a multi-split insert inside a transaction validates at commit rather than after each row.

### RLS

Applied identically to every user-data table:

```sql
alter table transactions enable row level security;
create policy owner on transactions
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

---

## Files

```
packages/core/src/
├── money/
│   ├── minor.ts           # Minor type, toMinor, format
│   └── arithmetic.ts      # safe add/subtract/percentage
├── db/
│   ├── client.ts
│   ├── types.ts           # generated from schema
│   └── repositories/
│       ├── transactions.ts
│       └── profiles.ts
supabase/migrations/
├── 0001_extensions.sql
├── 0002_profiles.sql
├── 0003_transactions.sql
└── 0004_rls.sql
```

---

## Acceptance criteria

- No floating-point arithmetic exists in any money code path, verified by lint rule banning `/` and `*` on `Minor` outside `arithmetic.ts`
- Splits that don't sum to the transaction total are rejected at commit
- A multi-split transaction inserts successfully in one database transaction
- Soft-deleted rows are excluded from all default queries
- RLS blocks cross-user reads, verified by test with two users
- `occurred_at` drives report bucketing, `updated_at` drives sync
- Currency formatting produces `$1,234.56` for CAD

---

## Out of scope

- Sync logic (28)
- Encryption at rest beyond Supabase defaults (29)
- Multi-user households — schema permits, no UI
