# 30 — HST Tracking

**Priority:** P3
**Depends on:** 13, 05

---

## Problem

**Rideshare drivers must register for GST/HST from the first dollar.** The $30,000 small-supplier exemption does not apply to taxi and ride-share services — it is a carve-out in the Excise Tax Act.

This is a **separate obligation from income tax**, with its own filing periods and its own deadlines. Treating it as part of the income tax reserve would understate both.

Nova Scotia HST is 15%.

---

## Behaviour

A distinct section showing, per filing period: HST collected on fares, input tax credits from business expenses, and net remittance owing.

Its own reserve bucket, separate from the income tax reserve, because the deadlines differ.

---

## Mechanism

### Collected

From platform summaries (11) where reported, or entered manually. **Verify how Uber Canada currently handles collection and reporting** — this has changed and may change again.

### Input tax credits

HST paid on business expenses, apportioned by business use:

```
itc = Σ (split.hst_paid_minor × split.business_use_percent / 100)
```

### Net remittance

```
net = collected − itcs
```

Positive means owing. Negative means a refund.

### Filing periods

Annual, quarterly, or monthly depending on revenue. User-set, defaulting to annual. Due dates derive from the period end.

---

## Data

Uses `hst_periods` from the income addendum:

```sql
create table hst_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  filing_frequency text not null default 'annual',
  collected_minor bigint not null default 0,
  input_tax_credits_minor bigint not null default 0,
  net_remittance_minor bigint not null default 0,
  due_date date,
  filed_on date,
  paid_on date,
  unique (user_id, period_start)
);
```

---

## Acceptance criteria

- HST tracked entirely separately from income tax
- ITCs apportioned by business-use percentage
- Net remittance = collected − ITCs, correctly signed
- Filing frequency user-set with derived due dates
- Its own reserve bucket, distinct from the income tax reserve
- Registration requirement surfaced when self-employment income first appears

---

## Open question

Uber Canada's current HST handling — what it collects, what it reports, what it remits. This determines whether `collected_minor` is imported or entered.
