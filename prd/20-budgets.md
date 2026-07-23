# 20 — Budgets

**Priority:** P2
**Depends on:** 06, 17

---

## Problem

Allocation buckets (06) divide income. Budgets cap spending per category. Different questions: "how much goes to savings" versus "am I overspending on dining."

---

## Behaviour

Four methods, user-chosen:

| Method | Shape |
|---|---|
| `simple` | A cap per category |
| `50_30_20` | Needs / wants / savings, categories mapped to each |
| `zero_based` | Every dollar assigned; remainder must reach zero |
| `envelope` | Unspent rolls forward, overspend borrows from next period |

Each category shows spent, remaining, and a pace indicator — whether spending is ahead of or behind where it should be at this point in the period.

Overspend is reported, not blocked. The app is a mirror, not a gate.

---

## Mechanism

### Pace

```
expected_by_now = budget × (days_elapsed / days_in_period)
pace = spent / expected_by_now
```

Above 1.0 is ahead of pace. Shown as a bar with a marker at the expected position — more legible than a percentage.

### Rollover

Envelope method only. Unspent rolls to the next period, capped at a multiple of the budget (default 2×) so an unused category doesn't accumulate indefinitely.

---

## Data

```sql
create type budget_method as enum
  ('simple','50_30_20','zero_based','envelope');

create table budget_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  method budget_method not null,
  period_start date not null,
  period_end date not null,
  rollover_cap_multiple numeric(4,2) not null default 2,
  unique (user_id, period_start)
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_period_id uuid not null references budget_periods(id) on delete cascade,
  category_id uuid not null references categories(id),
  budget_minor bigint not null,
  rolled_over_minor bigint not null default 0,
  spent_minor bigint not null default 0,
  unique (budget_period_id, category_id)
);
