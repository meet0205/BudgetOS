# 02 — Accounts & Categories

**Priority:** P0
**Depends on:** 01
**Blocks:** 03, 12

---

## Problem

Every transaction needs somewhere it came from and something it was for. Get the category taxonomy wrong and every report built on it is wrong, with no cheap way to fix it later — recategorising two years of line items by hand is not something a user will do.

---

## Behaviour

### Accounts

The user creates accounts matching their real ones: chequing, savings, a credit card, cash in a wallet. Each has a type, a currency, and an optional opening balance.

Accounts are for tracking where money moved, not for reconciling against a bank. There is no bank connection and no statement matching.

### Categories

Two layers, because a grocery trip is one transaction but many products.

- **Transaction layer** — what the spend was, at the receipt level. Groceries, Vehicle, Dining.
- **Product layer** — what the item was, at the line level. Dairy, Produce, Snacks, Fuel.

A single Walmart transaction sits in Groceries at the transaction layer and splits across Dairy, Produce, and Household at the product layer.

System categories ship seeded and cannot be deleted, only hidden. User categories can be created, renamed, merged, and deleted. Deleting a user category reassigns its transactions to the parent or to Uncategorised, with the count shown before confirming.

---

## Mechanism

### Seed taxonomy — Canadian

Transaction layer, roughly 20 top-level entries: Groceries, Dining, Vehicle, Transit, Housing, Utilities, Telecom, Insurance, Health, Personal care, Clothing, Household, Entertainment, Subscriptions, Education, Gifts, Travel, Fees, Business, Other.

Product layer nests under these, two levels deep where useful. Vehicle contains Fuel, Maintenance, Parking, Tolls, Registration, Insurance.

The product layer must include the CRA business expense kinds used by 13, so a fuel purchase categorises once and serves both personal reporting and business deduction.

### Hierarchy

Self-referencing `parent_id`, maximum depth 3. Reports roll up to whatever level is selected.

### Merging

Merging category A into B reassigns all splits and line items, then soft-deletes A. Recorded in a `category_merges` table so the operation can be explained if a report changes shape.

---

## Data

```sql
create type account_kind as enum
  ('cash','bank','credit_card','wallet','savings','investment','loan');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind account_kind not null,
  currency_code char(3) not null default 'CAD',
  opening_balance_minor bigint not null default 0,
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create type category_layer as enum ('transaction','product');

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  layer category_layer not null,
  slug text not null,
  display_name text not null,
  parent_id uuid references categories(id),
  icon text,
  color text,
  is_system boolean not null default false,
  is_hidden boolean not null default false,
  business_expense_kind text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index on categories (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), layer, slug);
create index on categories (user_id, layer, parent_id);

create table category_merges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_category_id uuid not null,
  into_category_id uuid not null,
  rows_moved int not null,
  merged_at timestamptz not null default now()
);
```

System rows have `user_id is null` and are visible to everyone. The unique index coalesces null so system and user slugs don't collide.

---

## Files

```
packages/core/src/categories/
├── index.ts
├── tree.ts             # hierarchy building, rollup
├── merge.ts
└── seed-ca.ts          # Canadian seed data

apps/*/routes|screens/Settings/
├── AccountsScreen.tsx
├── CategoriesScreen.tsx
└── CategoryMergeDialog.tsx

supabase/migrations/
├── 0005_accounts.sql
├── 0006_categories.sql
└── 0007_seed_categories_ca.sql
```

---

## Acceptance criteria

- Seed categories load on first run and cover both layers
- System categories cannot be deleted, only hidden
- Category depth is capped at 3
- Merging reassigns all splits and line items, then soft-deletes the source
- Merge shows the affected row count before confirming
- Deleting a user category with transactions requires choosing a destination
- Product-layer categories carrying `business_expense_kind` are usable by 13
- Archived accounts are hidden from pickers but remain in historical reports

---

## Out of scope

- Bank connectivity or statement import
- Balance reconciliation against real accounts
- Shared or household accounts
