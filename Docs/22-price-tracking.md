# 22 — Price & Unit-Price Tracking

**Priority:** P3
**Depends on:** 09, 16

---

## Problem

Bank-feed apps know you spent $84 at a supermarket. This app knows you bought 2 kg of rice at $3.40/kg, that the same rice was $2.95/kg two months ago, and that your basket has inflated 8% since January.

That granularity is the entire wedge. This feature is where it pays off.

---

## Behaviour

Any product shows its price history across every store that sold it. Unit price normalises across pack sizes, so a 500 g bag and a 2 kg bag compare directly.

A basket inflation index tracks what the user's own recurring purchases cost over time — personal inflation, not a national statistic.

---

## Mechanism

### Unit normalisation

Convert to a canonical unit per dimension: mass to grams, volume to millilitres, count to pieces. `normalized_unit_price_minor` is price per canonical unit, which is what makes cross-pack comparison possible.

Pack size comes from the AI enrichment (14) where the parser cannot infer it — `1G` meaning one gallon is exactly the kind of thing rules miss.

### Price observations

Every line item writes an observation. This is append-only history, never updated, so a re-parse cannot rewrite the past.

### Basket index

Take products purchased in at least 3 distinct months. Weight by typical quantity. Index to the first month at 100. The result is the user's own inflation rate on their own basket.

Requires roughly 6 months of data before it means anything; the UI says so rather than showing a noisy line.

---

## Data

```sql
create table price_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references products(id),
  merchant_id uuid references merchants(id),
  line_item_id uuid references line_items(id) on delete cascade,
  observed_at timestamptz not null,
  quantity numeric(12,3) not null,
  unit text,
  pack_size numeric(12,3),
  amount_minor bigint not null,
  unit_price_minor bigint,
  normalized_unit_price_minor bigint,
  currency_code char(3) not null default 'CAD'
);
create index on price_observations (user_id, product_id, observed_at desc);
create index on price_observations (user_id, merchant_id, observed_at desc);

create table basket_index_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  index_value numeric(8,2) not null,
  product_count int not null,
  unique (user_id, period_start)
);
