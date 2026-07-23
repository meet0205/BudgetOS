# 19 — Recurring Bills

**Priority:** P2
**Depends on:** 03
**Blocks:** 26

---

## Problem

Rent, hydro, phone, insurance. Predictable, unavoidable, and the reason safe-to-spend must account for money that hasn't left yet. A safe-to-spend figure that ignores rent due in three days is lying.

---

## Behaviour

A bill has a name, an amount, a schedule, and a category. The app generates upcoming instances and shows the next 14 days on the dashboard.

When a transaction matching a bill instance appears, the app offers to link them. Linked instances mark paid; unlinked ones near their due date raise a reminder.

Amounts drift — hydro varies by season, subscriptions raise prices. The app tracks actual versus expected and flags meaningful increases.

---

## Mechanism

### Schedule

`rrule`-style: frequency, interval, day-of-month or day-of-week, optional end. Instance generation runs 90 days ahead.

Month-end handling: a bill due on the 31st falls on the last day in shorter months, not the 1st of the next.

### Payment matching

A transaction matches a bill instance when merchant is similar, amount is within tolerance (default 10%), and date is within a window (default ±5 days). Matches are offered, not applied — silent linking produces bills that appear paid when they aren't.

### Bill creep

Comparing paid amounts across instances surfaces increases. A 5% rise in one bill is noise; a 40% rise or a pattern of increases is worth surfacing. Fed to insights (23).

---

## Data

```sql
create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant_id uuid references merchants(id),
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  expected_minor bigint not null,
  currency_code char(3) not null default 'CAD',
  frequency text not null,
  interval int not null default 1,
  day_of_month smallint,
  day_of_week smallint,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  amount_tolerance_percent numeric(5,2) not null default 10,
  date_tolerance_days int not null default 5,
  created_at timestamptz not null default now()
);

create type bill_state as enum
  ('upcoming','due','paid','skipped','overdue');

create table bill_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  due_date date not null,
  expected_minor bigint not null,
  state bill_state not null default 'upcoming',
  transaction_id uuid references transactions(id),
  paid_minor bigint,
  paid_on date,
  unique (bill_id, due_date)
);
create index on bill_instances (user_id, due_date) where state in ('upcoming','due','overdue');
