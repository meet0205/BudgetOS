# 12 — Categorisation Engine

**Priority:** P1
**Depends on:** 02, 09
**Blocks:** 16, 17

---

## Problem

Every line item needs a category, and the user will not assign them by hand. Categorisation must be automatic, correctable, and must learn — a correction made once should not need making twice.

---

## Behaviour

Items arrive categorised. Wrong ones are corrected in review (10), and the correction sticks for that product at that merchant permanently.

Users can write explicit rules: "anything from Petro-Canada is Vehicle > Fuel." Rules take precedence over everything else.

---

## Mechanism

### The cascade

Evaluated in order; first match wins.

| # | Source | Confidence |
|---|---|---|
| 1 | User rule match | 1.00 |
| 2 | Product memory — this product, this merchant, corrected before | 0.98 |
| 3 | Product memory — this product, any merchant | 0.92 |
| 4 | Merchant default category | 0.85 |
| 5 | AI enrichment result (14) | from 14 |
| 6 | Keyword dictionary | 0.70 |
| 7 | Fuzzy match against categorised history | 0.60 |
| 8 | Fallback — Uncategorised | 0.00 |

Product memory outranks merchant default because a specific correction is stronger evidence than a merchant-wide tendency. Milk bought at a hardware store is still Dairy.

AI sits at 5 rather than higher because a user correction and an explicit rule are more authoritative than a model's guess. When AI runs it typically fills what 1–4 could not answer.

### Rules

```ts
interface Rule {
  id: string;
  priority: number;
  conditions: Condition[];   // ALL must match
  categoryId: string;
  appliesTo: 'transaction' | 'line_item' | 'both';
}

type Condition =
  | { field: 'merchant';    op: 'equals' | 'contains'; value: string }
  | { field: 'description'; op: 'contains' | 'regex';  value: string }
  | { field: 'amount';      op: 'gt' | 'lt' | 'between'; value: number[] }
  | { field: 'account';     op: 'equals'; value: string };
```

Stored as JSONB, evaluated in priority order.

### Rule suggestion

After the same correction is made three times for the same merchant or description pattern, the app offers to create a rule. Offers, does not create — silent rule creation produces categorisations the user cannot explain.

---

## Data

```sql
create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  priority int not null default 100,
  conditions jsonb not null,
  category_id uuid not null references categories(id),
  applies_to text not null default 'both',
  is_enabled boolean not null default true,
  match_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on rules (user_id, priority) where is_enabled;

create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,
  normalized_name text not null,
  brand text,
  product_type_id uuid,
  category_id uuid references categories(id),
  default_unit text,
  default_pack_size numeric(12,3),
  purchase_count int not null default 0,
  last_purchased_at timestamptz,
  created_at timestamptz not null default now()
);
create index on products using gin (normalized_name gin_trgm_ops);
create unique index on products (user_id, normalized_name);

create table product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid references merchants(id),
  alias text not null,
  source text not null default 'user'
);
create index on product_aliases using gin (alias gin_trgm_ops);
```

`product_aliases.merchant_id` is what makes `GV WHL MLK 1G` resolve at Walmart specifically — the same string means nothing elsewhere.

---

## Acceptance criteria

- Cascade evaluates in the documented order; first match wins
- A correction made once applies to that product at that merchant thereafter
- Rules take precedence over all inference
- Rule suggestion offers after three identical corrections, never auto-creates
- Categorisation completes in under 50 ms per line item
- Uncategorised is a valid terminal state, never a silent guess
- Every categorisation records which cascade level produced it
