# 23 — Insights Engine

**Priority:** P3
**Depends on:** 17

---

## Problem

Data does not change behaviour; noticing does. Insights surface what the user would have seen if they studied their own reports, which they will not do.

---

## Behaviour

One insight at a time on the dashboard, ranked. Each has one action.

Insights compare the user against **their own history**. Never against other users, never against survey data, never with moralising. "Dining is 34% above your 6-month average" is useful. "You should cook more" is not.

---

## Mechanism

### Detector types

| Detector | Fires when |
|---|---|
| `category_spike` | Category above its own trailing average by a threshold |
| `new_recurring` | A repeating charge appears |
| `bill_creep` | A recurring bill's amount rises |
| `price_increase` | A tracked product's unit price rises |
| `subscription_unused` | A subscription with no related activity |
| `budget_pace` | Spending ahead of pace mid-period |
| `goal_at_risk` | Contribution rate won't meet the date |
| `tax_reserve_short` | Reserve below estimated liability |
| `duplicate_charge` | Same merchant, same amount, close dates |
| `warranty_expiring` | Return or warranty deadline approaching |
| `savings_opportunity` | Same product cheaper at another store |
| `income_gap` | Expected income period with no entry |

### Ranking

```
score = magnitude × recency × actionability
```

Only the top insight shows by default. A full list is available but not pushed.

### Suppression

A dismissed insight of the same kind for the same entity does not resurface for a cooldown period. Repeating an ignored insight is how notification fatigue starts.

---

## Data

```sql
create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  entity_type text,
  entity_id uuid,
  period_start date,
  title text not null,
  body text not null,
  magnitude numeric(10,2),
  score numeric(10,4) not null,
  action_type text,
  action_payload jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index on insights (user_id, kind, entity_id, period_start)
  where period_start is not null;
create index on insights (user_id, score desc) where dismissed_at is null;
