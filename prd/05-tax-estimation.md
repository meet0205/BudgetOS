# 05 — Canadian Tax Estimation

**Priority:** P0
**Depends on:** 04
**Blocks:** 06, 13, 30

---

## Scope limit, stated first

This produces a **planning estimate**. It is not tax preparation and not a filing.

Bracket arithmetic does not capture credits, deductions, carry-forwards, spousal transfers, RRSP room, or the full interaction of CPP enhancement rules. The estimate will differ from the real return, sometimes materially.

Every figure this feature displays is labelled an estimate. **The app never states what the user owes CRA.** It states what it estimates, shows how it got there, and reserves slightly more than the estimate to absorb error.

---

## Problem

Employment income arrives with tax already withheld. Self-employment income arrives with nothing withheld. Combine both and the user has no way to know their position until filing, by which time the money may be spent.

Two specific traps:

**Marginal rate.** Self-employment income is taxed *on top of* employment income, at whatever bracket the combined total reaches. Computing it in isolation understates the liability, sometimes by half.

**CPP doubled.** Self-employed pay both the employee and employer halves. This is a large, surprising number and must be visible as its own line rather than folded into a total.

---

## Behaviour

### The monthly view

What to set aside this month. One number, with the reasoning one tap away.

Below it: reserved to date, withheld to date, and current position — ahead or behind.

### The annual view

Projected income by kind, estimated federal tax, estimated provincial tax, CPP (split into employment and self-employment portions), EI, total withheld, and projected balance at filing.

Every line expands to show which bracket set and which rules produced it, with the `verified_on` date of the source data visible. When that date is stale — more than a year old, or from a prior tax year — the app prompts to re-check CRA.

### Instalment warning

When projected net owing crosses the CRA instalment threshold, the app surfaces this with the quarterly due dates and tracks payments against them. Missing instalments accrues interest, so this is an active notification rather than a passive display.

---

## Mechanism

### Brackets are data

Rates change annually and are indexed to inflation. Nova Scotia went years without indexing and began recently. **Values are populated from CRA sources, never hardcoded**, and each set records its provenance.

Resolution is always by the year income was *earned*, not the current year. A 2025 entry uses 2025 brackets permanently — the same principle as pinning FX rates at transaction time.

### The calculation

Recomputed from scratch on every income or expense change. Never incrementally patched, because patching accumulates drift.

```
1. YTD income by kind
     employment_gross     = Σ income_documents where kind='employment'
     self_employment_net  = Σ gross − platform_fees − business_expenses (13)
     other_income         = Σ investment + rental

2. Projected annual
     each kind annualised by elapsed periods, OR user override

3. Combined taxable income
     employment + self_employment_net + other
     ── self-employment is NEVER computed in isolation

4. Income tax
     federal:    brackets(year, country='CA', province=null)
     provincial: brackets(year, province)
     less basic personal amounts (both levels)
     less NS low-income reduction where applicable

5. Contributions
     CPP employment:      from stubs, capped at annual max
     CPP self-employment: (net − exemption) × rate × 2.0, capped
     EI:                  employment only, capped
     ── CPP2 applies above the first ceiling; separate rule row

6. Already paid
     Σ deductions where kind in ('federal_tax','provincial_tax')
   + Σ tax_instalments where paid_on is not null

7. Shortfall = (4 + 5) − 6
8. Reserve target = max(0, shortfall) × reserve_multiplier
```

### Progressive bracket application

```ts
function taxOn(income: Minor, brackets: Bracket[]): Minor {
  let tax = 0, prev = 0;
  for (const b of brackets) {
    const ceiling = b.upto_minor ?? Infinity;
    if (income <= prev) break;
    const inBand = Math.min(income, ceiling) - prev;
    tax += Math.round(inBand * b.rate);
    prev = ceiling;
  }
  return tax as Minor;
}
```

`Math.round` at each band, not at the end — matches how CRA computes and avoids a cent of drift per band.

### Reserve behaviour

**Auto-reserve on the net gap.** Net of overall position, not gross per transaction.

- Employment income arrives → withholding recorded as already paid → reserves nothing
- Self-employment income arrives → nothing withheld → marginal-rate estimate on the net amount is reserved
- Employment over-withholding **offsets** the self-employment reserve rather than sitting idle

**Multiplier defaults to 1.10.** The failure modes are asymmetric: over-reserving yields a surplus in April, under-reserving means finding cash already spent. User-adjustable, defaults high.

The reserve is a system allocation bucket (06) — deducted from safe-to-spend before it is calculated. Spending from it requires an explicit override with a warning, because that override is exactly the failure this prevents.

### Instalment threshold

CRA requires quarterly instalments when net tax owing exceeds a threshold in the current year and in either of the two prior years. **Verify the current threshold and due dates against CRA** — both change.

The two-prior-years test needs historical data. Either the user enters prior-year net owing manually, or the app only evaluates the current year and notes the test is incomplete. Open question in the index.

---

## Data

```sql
create table tax_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country char(2) not null default 'CA',
  province char(2),
  tax_year int not null,
  brackets jsonb not null,
  basic_personal_amount_minor bigint not null,
  low_income_reduction jsonb,
  source_url text,
  verified_on date,
  unique (country, province, tax_year)
);

create table contribution_rules (
  id uuid primary key default gen_random_uuid(),
  tax_year int not null,
  kind text not null,
  rate numeric(6,5) not null,
  max_pensionable_minor bigint,
  exemption_minor bigint,
  self_employed_multiplier numeric(3,1) not null default 1.0,
  source_url text,
  verified_on date,
  unique (tax_year, kind)
);

create table tax_estimates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year int not null,
  province char(2) not null,
  as_of date not null,
  employment_gross_minor bigint not null default 0,
  self_employment_net_minor bigint not null default 0,
  other_income_minor bigint not null default 0,
  projected_annual_minor bigint not null,
  annual_override_minor bigint,
  est_federal_tax_minor bigint not null,
  est_provincial_tax_minor bigint not null,
  est_cpp_minor bigint not null,
  est_cpp_self_employed_minor bigint not null default 0,
  est_ei_minor bigint not null,
  already_withheld_minor bigint not null default 0,
  instalments_paid_minor bigint not null default 0,
  shortfall_minor bigint not null,
  reserve_multiplier numeric(3,2) not null default 1.10,
  reserve_target_minor bigint not null,
  requires_instalments boolean not null default false,
  computed_at timestamptz not null default now(),
  unique (user_id, tax_year, as_of)
);

create table tax_instalments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year int not null,
  due_date date not null,
  amount_minor bigint not null,
  paid_on date,
  paid_amount_minor bigint,
  kind text not null default 'income_tax'
);
```

`brackets` shape:

```json
[
  { "upto_minor": 5786700, "rate": 0.1479 },
  { "upto_minor": 11573500, "rate": 0.1495 },
  { "upto_minor": null,     "rate": 0.2100 }
]
```

Ascending, last entry `upto_minor: null`. **Values above are structural placeholders, not real NS rates.** Populate from CRA.

---

## Files

```
packages/core/src/tax/
├── index.ts              # orchestration, recompute trigger
├── brackets.ts           # progressive application
├── contributions.ts      # CPP, CPP2, EI with caps and multiplier
├── annualise.ts
├── reserve.ts            # net-of-position reserve
├── instalments.ts        # threshold test, due dates
└── explain.ts            # breakdown for the expandable UI

apps/*/routes|screens/Tax/
├── TaxPositionScreen.tsx
├── AnnualBreakdown.tsx
├── BracketExplainer.tsx
├── InstalmentTracker.tsx
└── JurisdictionFreshness.tsx

supabase/migrations/
├── 0010_tax_jurisdictions.sql
├── 0011_contribution_rules.sql
├── 0012_tax_estimates.sql
└── 0013_seed_ca_ns.sql    # populated from CRA, not from memory
```

---

## Acceptance criteria

- Self-employment tax always computed on combined income at marginal rate
- CPP self-employment multiplier applied and displayed as a distinct line
- CPP, CPP2, and EI capped at annual maximums
- Brackets resolve by earned year, never current year
- Reserve is net of position — employment over-withholding offsets self-employment reserve
- Reserve target = shortfall × multiplier, defaulting to 1.10
- Recompute is full, never incremental
- Every displayed figure carries an estimate label
- Breakdown expands to show bracket set, rule rows, and `verified_on` dates
- Stale or missing `verified_on` surfaces a prompt to re-check CRA
- Instalment threshold crossing triggers a notification with due dates
- Changing province in settings recomputes using the new jurisdiction for the current year only
- Unbalanced income documents (`reconciles = false`) are excluded from the calculation

---

## Out of scope

- Tax filing or form generation
- RRSP contribution optimisation
- Spousal or family credits
- Capital gains
- Foreign income and foreign tax credits
- HST — separate obligation, feature 30
- Prior-year returns
