# 06 — Allocation Buckets & Safe-to-Spend

**Priority:** P0
**Depends on:** 04, 05
**Blocks:** 20, 21

---

## Problem

Knowing the bank balance is not knowing what can be spent. Rent is coming, savings should happen, and with Uber income a portion of what looks like available cash belongs to CRA.

Safe-to-spend is the single number that answers "can I buy this." Everything else in the app supports producing it honestly.

---

## Behaviour

### The core loop

1. Income arrives (04)
2. Allocation buckets take their share, in priority order
3. The tax reserve takes its share (05)
4. What remains is safe-to-spend, shown per month and per day
5. Spending draws it down in real time

### Buckets

A bucket is a named claim on income. Three funding modes:

| Mode | Behaviour |
|---|---|
| `fixed` | A set amount each period |
| `percent_of_income` | A percentage of income received |
| `remainder` | Whatever is left after higher-priority buckets |

Buckets fund in priority order. A fixed bucket that cannot be fully funded takes what it can and flags the shortfall rather than going negative.

### The tax reserve bucket

A system bucket, created automatically when self-employment income first appears. It cannot be deleted while such income exists. Its target comes from 05 and updates as income and business expenses change.

Spending from it requires an explicit override with a warning. That override is the specific failure this product exists to prevent, so it is deliberately uncomfortable — a confirmation that names the amount and the consequence.

### Daily figure

`safe_to_spend / days_remaining_in_period`. Recalculated on every transaction, so overspending today visibly reduces tomorrow's figure rather than silently deferring the problem to month end.

---

## Mechanism

### Period boundaries

`profiles.month_start_day` handles users paid on a cycle that isn't the calendar month. All period arithmetic goes through one function; nothing computes month boundaries inline.

### Funding order

```
1. Sort buckets by priority ascending
2. For each fixed bucket: allocate min(target, available)
3. For each percent bucket: allocate percent × income_this_period
4. Tax reserve: allocate from 05's reserve_target, net of position
5. Remainder buckets split what is left by their weights
6. safe_to_spend = income − Σ allocations − spent_this_period
```

The tax reserve sits after fixed and percent buckets deliberately. Rent should not go unpaid to fund a tax estimate, but discretionary savings should yield to it.

### Recalculation

Full recompute on every income, expense, or bucket change. The calculation is cheap and incremental patching accumulates drift — the same argument as 05.

---

## Data

```sql
create type allocation_mode as enum
  ('fixed','percent_of_income','remainder');

create table allocation_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  mode allocation_mode not null,
  target_minor bigint,
  percent numeric(5,2),
  weight numeric(5,2) not null default 1,
  priority int not null default 100,
  linked_account_id uuid references accounts(id),
  is_system boolean not null default false,
  system_kind text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index on allocation_buckets (user_id, priority);

create table bucket_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id uuid not null references allocation_buckets(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target_minor bigint not null,
  funded_minor bigint not null default 0,
  spent_minor bigint not null default 0,
  shortfall_minor bigint not null default 0,
  unique (bucket_id, period_start)
);

create table safe_to_spend_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  income_minor bigint not null,
  allocated_minor bigint not null,
  tax_reserved_minor bigint not null,
  spent_minor bigint not null,
  safe_to_spend_minor bigint not null,
  daily_minor bigint not null,
  computed_at timestamptz not null default now()
);
create index on safe_to_spend_snapshots (user_id, period_start desc);
```

`system_kind = 'tax_reserve'` identifies the reserve bucket for 05 to update.

---

## Files

```
packages/core/src/budget/
├── index.ts
├── period.ts           # month_start_day arithmetic, single source
├── allocate.ts         # funding order above
├── safe-to-spend.ts
└── reserve-bucket.ts   # system bucket lifecycle

apps/*/routes|screens/Budget/
├── AllocationScreen.tsx
├── BucketEditor.tsx
├── SafeToSpendCard.tsx
└── ReserveOverrideDialog.tsx
```

---

## Acceptance criteria

- Safe-to-spend recalculates within 200 ms of any transaction
- Daily figure reflects days remaining in the current period
- Buckets fund in priority order; underfunded fixed buckets flag rather than go negative
- The tax reserve bucket is created automatically on first self-employment income
- The reserve bucket cannot be deleted while self-employment income exists
- Spending from the reserve requires explicit confirmation naming the amount
- Period boundaries respect `month_start_day`
- All period arithmetic routes through `period.ts`
- Reserve target updates when 05 recomputes

---

## Out of scope

- Budget methods and rollover (20)
- Goal-linked funding (21)
- Automatic transfers to real accounts
