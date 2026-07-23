# 21 — Savings Goals

**Priority:** P2
**Depends on:** 06

---

## Problem

Saving without a target is hard to sustain. A goal turns an abstract virtue into a number with a date.

---

## Behaviour

A goal has a name, a target amount, and either a target date or a monthly contribution — entering one computes the other, bidirectionally.

Goals fund from allocation buckets in priority order. A goal that cannot be fully funded this period takes what it can and shows the revised date.

On achievement the app asks where the freed-up contribution should go: another goal, a bucket, or safe-to-spend. Left alone it silently returns to spending, which is how savings momentum dies.

---

## Mechanism

### Bidirectional solve

```
monthly = (target − current) / months_remaining
months  = ceil((target − current) / monthly)
```

Editing either field recomputes the other and shows the change immediately.

### Priority funding

Goals fund in order. Priority is drag-to-reorder, and reordering shows the effect on every affected date before confirming.

---

## Data

```sql
create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_minor bigint not null,
  current_minor bigint not null default 0,
  target_date date,
  monthly_contribution_minor bigint,
  priority int not null default 100,
  bucket_id uuid references allocation_buckets(id),
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  amount_minor bigint not null,
  occurred_at date not null,
  source text not null default 'allocation'
);
