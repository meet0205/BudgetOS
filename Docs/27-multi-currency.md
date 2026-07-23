# 27 — Multi-Currency

**Priority:** P3
**Depends on:** 03

---

## Problem

Travel, cross-border shopping, and USD subscriptions. A transaction in another currency must report correctly in CAD without rewriting history when rates move.

---

## Behaviour

Enter an amount in any currency. The app converts using the rate at the transaction date and stores both.

Reports show base currency. The original is always visible on the transaction.

Travel mode: set a trip with dates and a currency, and transactions in that window default to it.

---

## Mechanism

### Rates pinned at transaction time

**The rate is captured when the transaction is created and never changes.** Retroactive rate updates would rewrite last year's reports every time the dollar moved.

`fx_rate` and `base_total_minor` are stored on the transaction. Reports read `base_total_minor` and never recompute.

### Rate source

Daily rates fetched and cached. On failure, the most recent cached rate is used and the transaction is flagged as using a stale rate, editable later.

---

## Data

```sql
create table currencies (
  code char(3) primary key,
  name text not null,
  symbol text,
  minor_unit_digits smallint not null default 2
);

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_code char(3) not null,
  quote_code char(3) not null,
  rate numeric(18,8) not null,
  as_of date not null,
  source text,
  unique (base_code, quote_code, as_of)
);
create index on fx_rates (base_code, quote_code, as_of desc);

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  currency_code char(3) not null,
  starts_on date not null,
  ends_on date not null
);
