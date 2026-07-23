# 26 — Subscription Management

**Priority:** P3
**Depends on:** 19

---

## Problem

Subscriptions are the spending people most underestimate, because each one is small and none is a decision — they were decisions once, and then they were nothing.

---

## Behaviour

The app detects repeating charges and proposes them as subscriptions. Each shows its **annual** cost, because $14.99 is invisible and $180/year is not.

Price increases are flagged. Long-dormant subscriptions prompt a review.

---

## Mechanism

### Detection

Three or more charges from the same merchant, similar amounts, at a regular interval. Proposed, never auto-created — a monthly grocery run is not a subscription.

### State machine

`detected → confirmed → active → cancelled`, or `detected → dismissed`.

### Price change

Comparing charge amounts across instances. A rise from $14.99 to $17.99 fires an insight (23), with the annual difference stated.

---

## Data

```sql
create type subscription_state as enum
  ('detected','confirmed','active','cancelled','dismissed');

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid references merchants(id),
  name text not null,
  state subscription_state not null default 'detected',
  amount_minor bigint not null,
  currency_code char(3) not null default 'CAD',
  frequency text not null,
  first_seen_on date not null,
  last_charged_on date,
  next_expected_on date,
  annual_cost_minor bigint,
  bill_id uuid references recurring_bills(id),
  cancelled_on date,
  created_at timestamptz not null default now()
);
