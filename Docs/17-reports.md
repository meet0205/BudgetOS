# 17 — Reports

**Priority:** P2
**Depends on:** 03, 12
**Blocks:** 18, 20, 23

---

## Problem

Where did the money go. Answered at several time scales, fast enough to be worth opening.

---

## Behaviour

Monthly summary, year-to-date, year-over-year comparison, category breakdown, merchant breakdown, and a spend heatmap by day.

Every view exports to CSV. Monthly summary also exports to PDF.

---

## Mechanism

### Pre-aggregation

Reading three years of splits on every report open is slow. Two aggregate tables maintained by trigger:

- `monthly_category_totals` — one row per user, month, category
- `monthly_summaries` — one row per user, month

Reports read aggregates; drill-downs read splits directly. Aggregates rebuild on demand if a backfill or category merge invalidates them.

### Exclusions

Transfers are excluded from spend — moving money between own accounts is not spending. Refunds reduce the original category rather than appearing as income. Reimbursables show gross with a net toggle.

Getting these wrong is what makes most budget apps' numbers untrustworthy.

### Period handling

Respects `month_start_day` via the same `period.ts` used by 06. Nothing computes month boundaries inline.

---

## Data

```sql
create table monthly_category_totals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  category_id uuid not null references categories(id),
  layer category_layer not null,
  total_minor bigint not null default 0,
  transaction_count int not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_start, category_id, layer)
);

create table monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  income_minor bigint not null default 0,
  spend_minor bigint not null default 0,
  allocated_minor bigint not null default 0,
  tax_reserved_minor bigint not null default 0,
  net_minor bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);
```

---

## Acceptance criteria

- Monthly report opens in under 1 s with 3 years of data
- Transfers excluded from all spend figures
- Refunds reduce the original category
- Year-over-year aligns periods correctly across a leap year
- Aggregates rebuild correctly after a category merge
- CSV export matches on-screen figures exactly
- Period boundaries respect `month_start_day`
