# 13 — Business Expenses & Vehicle Deduction

**Priority:** P1
**Depends on:** 03, 05
**Blocks:** 30

---

## Problem

Self-employment income is taxed on **net**, not gross. Reserving tax on gross Uber fares over-reserves substantially — fuel, insurance, maintenance, and depreciation come off first.

Without this feature the reserve is wrong in the direction that makes the app annoying rather than dangerous, but wrong nonetheless.

---

## Behaviour

### Marking an expense as business

A toggle on any transaction split. Turning it on reveals a percentage field, defaulting to the value set in settings.

One gas receipt is simultaneously a personal expense and a business deduction at that percentage. One transaction, one split, two readings — no duplicate entry.

### Business-use percentage

**The user sets this. The app does not infer it and does not track driving.**

Set once in settings, applied as the default to new business-flagged splits, overridable per split.

A note in settings states that CRA expects the percentage to be supported by a mileage log, that this deduction is among the most likely to be reviewed, and that reconstructing a log after the fact is difficult. Informational — not enforced, not nagged.

### Optional odometer log

Manual entry of start and end readings per period, with business kilometres. Produces the business-use percentage as a calculation if the user wants it. Entirely optional and entirely manual — no location access, no automatic trip detection.

### Capital cost allowance

Manual entry only. The app records the CCA amount the user enters and applies it to net income.

It does not compute CCA. Doing so correctly requires prior-year undepreciated capital cost balances, class rules, the half-year convention, and passenger vehicle ceilings — inputs that live in tax software, not here. Computing it wrong would be worse than not computing it.

---

## Mechanism

### Net self-employment income

```
gross fares / invoiced amount
− platform fees
− Σ (expense × business_use_percent) for each vehicle expense
− Σ (other business expenses × business_use_percent)
− CCA (user-entered)
= net self-employment income   → feeds 05 step 1
```

Recomputed on every relevant transaction change. The reserve target moves with it, so a month with heavy maintenance spending visibly reduces what needs setting aside.

### Expense kinds

CRA categories: `fuel`, `insurance`, `maintenance`, `licence_registration`, `interest`, `leasing`, `cca`, `phone`, `supplies`, `parking`, `tolls`, `platform_fees`, `other`.

These map to product-layer categories from 02, so a fuel purchase categorises once.

### Input tax credits

HST paid on business expenses is recoverable against HST collected. `hst_paid_minor × business_use_percent` accumulates toward 30.

---

## Data

Uses `transaction_splits` columns from 01. Adds:

```sql
create table odometer_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  start_reading numeric(10,1),
  end_reading numeric(10,1),
  business_km numeric(10,1),
  total_km numeric(10,1),
  note text,
  created_at timestamptz not null default now()
);

create table cca_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year int not null,
  asset_description text not null,
  cca_class text,
  amount_minor bigint not null,
  business_use_percent numeric(5,2) not null,
  note text,
  created_at timestamptz not null default now()
);

alter table profiles
  add column default_business_use_percent numeric(5,2) not null default 0;
```

---

## Acceptance criteria

- Business-use percentage is user-set, never inferred
- **No location tracking of any kind**
- One transaction serves as both personal expense and business deduction without duplication
- Expenses reduce net self-employment income in the same recompute that updates the reserve
- CCA is user-entered; the app never computes it
- Odometer entry is optional and manual
- Default business-use percentage is 0, requiring explicit opt-in
- ITCs accumulate from business-use-apportioned HST paid
