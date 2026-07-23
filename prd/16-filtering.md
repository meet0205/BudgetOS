# 16 — Item-Level Filtering

**Priority:** P2
**Depends on:** 09, 12
**Blocks:** 18, 22

---

## Problem

Buy a t-shirt at Gap and another at Aéropostale. Select "t-shirt" and see both, with store, price, and date, filterable by month or year.

This reads `line_items` and `products`, not `transactions`. Reports (17) aggregate by category and merchant; this is orthogonal to both and is the thing line-item capture was for.

---

## Behaviour

A filter bar with composable chips. Add "t-shirt", add "2026", see nine items across three stores with a total, an average unit price, and a price trend.

Any result set saves as a named filter and pins to the dashboard (18).

---

## Mechanism

### Product type — the missing layer

`products` holds specific items. Filtering needs a **type** above the specific product:

- *t-shirt* is a type
- *Gap Essential Crew Tee Navy M* is a product

Types are hierarchical: `clothing > tops > t-shirt`. Filtering `tops` includes t-shirts; filtering `t-shirt` excludes jeans.

Type assignment comes from AI enrichment (14), constrained to the seeded list the same way categories are. User correction overrides and persists to the product record.

### Filter dimensions

Composable in any combination:

| Dimension | Source |
|---|---|
| Product | `products.id` |
| Product type | `product_types.slug` |
| Brand | `line_items.brand` |
| Merchant | `merchants.id` |
| Merchant chain | `merchants.chain_id` |
| Category | product-layer `categories` |
| Period | month, quarter, year, custom |
| Price range | `line_items.amount_minor` |
| Unit price range | `normalized_unit_price_minor` |
| Business use | `business_use_percent > 0` |
| Account | `transactions.account_id` |

### Results

Total spent, item count, average unit price, price trend, breakdown by store, full line-item list. CSV export.

The price trend is the connection to 22 — filter to "t-shirt", see what you've paid over two years across every store.

---

## Data

```sql
create table product_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  category_id uuid references categories(id),
  parent_type_id uuid references product_types(id),
  is_system boolean not null default true,
  sort_order int not null default 0
);

alter table products
  add column product_type_id uuid references product_types(id);

create table saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filter_json jsonb not null,
  pinned_to_dashboard boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index on line_items (user_id, product_type_id, purchased_at desc);
create index on line_items (user_id, brand, purchased_at desc);
create index on products (user_id, product_type_id);
```

---

## Acceptance criteria

- Filtering by product type returns matches across all merchants and brands
- Filters compose without restriction
- Month and year filtering applies to every dimension
- Results show unit-price comparison across stores
- Filters save, name, and pin
- CSV export includes all visible columns
- A query over 3 years of line items returns in under 500 ms
