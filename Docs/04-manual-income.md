# 04 — Manual Income Entry

**Priority:** P0
**Depends on:** 01
**Blocks:** 05, 06, 11

---

## Problem

Tax estimation needs income. Income arrives in two shapes with opposite properties:

- **Employment (T4)** — arrives net. CPP, EI, and tax already withheld and printed on the stub. The question is whether withholding was accurate.
- **Self-employment (Uber)** — arrives gross. Nothing withheld. The full liability is deferred to filing, and the money looks spendable in the meantime.

The second is why this feature is P0 rather than a convenience. Money that belongs to CRA sitting in a chequing account is the specific failure this product prevents.

This feature is manual entry only. Document parsing is 11 and comes later — the calculator is testable with typed-in numbers, and building it first means a working tax position months before any OCR work.

---

## Behaviour

### Adding employment income

A form matching the shape of a pay stub:

- Employer (remembered, autocompletes on subsequent entries)
- Pay date, period start, period end
- Gross for the period
- Deductions — a repeating row of kind + amount
- Net for the period
- Optionally: YTD gross, YTD net, YTD per deduction

Live reconciliation as the user types: gross minus the sum of deductions must equal net. When it doesn't, the difference is shown, not a generic error. `Off by $12.40` tells the user what to look for.

The form cannot be saved while unbalanced. There is no override — a stub that doesn't balance has a typo, and accepting it corrupts the tax estimate silently.

### Adding self-employment income

Simpler, because there are no deductions:

- Source (Uber, or free text, remembered)
- Date or period
- Gross amount
- Optionally: platform fees, HST collected

No reconciliation to perform. The value is passed to 05, which computes the reserve after 13's business expenses come off.

### Recurring income

Employment income is usually the same shape every period. After two entries with matching employer and similar gross, the app offers to prefill subsequent entries with the previous values, editable. This is a convenience, not automation — nothing is created without confirmation.

### Editing and history

A list of all income entries by tax year, filterable by kind and employer. Editing recomputes the tax estimate immediately. Deleting warns if it breaks YTD continuity.

---

## Mechanism

### Deduction vocabulary

Controlled, because 05 consumes these by type:

```ts
type DeductionKind =
  | 'federal_tax' | 'provincial_tax'
  | 'cpp' | 'cpp2' | 'ei' | 'qpp' | 'qpip'
  | 'rpp' | 'rrsp' | 'union_dues'
  | 'group_benefits' | 'life_insurance' | 'ltd'
  | 'garnishment' | 'other';
```

`federal_tax` and `provincial_tax` feed the "already withheld" side of the tax calculation. `cpp` and `ei` feed contribution tracking against annual maximums. Everything else is recorded but doesn't affect the estimate.

The form presents these as a dropdown with plain-language labels. `other` accepts a free-text label, preserved for the user's reference.

### YTD continuity

Optional to enter, valuable when present. If the user records YTD figures on consecutive stubs, the app checks:

```
stub[n].ytd_gross == stub[n-1].ytd_gross + stub[n].gross
```

A break means a missing stub or a typo. The app reports which period appears absent — `Expected a stub between Jun 15 and Jul 15` — rather than a generic warning.

When YTD is absent, the app sums entered stubs instead. Less reliable, since it can't detect a stub that was never entered, so the UI notes this.

### CPP and EI maximums

Both stop once the annual maximum is reached, which changes net pay mid-year with no change in gross. The calculator (05) tracks YTD contributions against `contribution_rules.max_pensionable_minor` rather than extrapolating a constant rate.

This entry form doesn't enforce the maximum — a stub is what it is — but 05 flags when entered CPP exceeds the annual maximum, which indicates either a typo or a second employer.

### Annualisation

For a partial year, projected annual income is:

```
projected = ytd_gross × (pay_periods_per_year / periods_elapsed)
```

The user can override with a known figure — useful when income is seasonal or a job change is planned. The override is stored on the tax estimate, not the income entry.

---

## Data

Uses `income_documents` and `income_deductions` from the income addendum, with `doc_type = 'manual'` and `is_user_entered = true`.

```sql
create type income_doc_type as enum
  ('payslip','t4','t4a','t5','invoice','uber_summary','manual');

create type income_kind as enum
  ('employment','self_employment','investment','rental','other');

create table income_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type income_doc_type not null,
  income_kind income_kind not null,
  source_file_id uuid,
  employer_name text,
  employer_id text,
  period_start date,
  period_end date,
  pay_date date not null,
  tax_year int not null,
  province char(2) not null,
  gross_minor bigint not null,
  net_minor bigint,
  ytd_gross_minor bigint,
  ytd_net_minor bigint,
  platform_fees_minor bigint not null default 0,
  hst_collected_minor bigint not null default 0,
  currency_code char(3) not null default 'CAD',
  is_user_entered boolean not null default true,
  reconciles boolean not null default false,
  parser_version text,
  ocr_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on income_documents (user_id, tax_year, pay_date desc)
  where deleted_at is null;
create index on income_documents (user_id, income_kind, tax_year)
  where deleted_at is null;

create table income_deductions (
  id uuid primary key default gen_random_uuid(),
  income_document_id uuid not null
    references income_documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  raw_label text,
  amount_minor bigint not null,
  ytd_amount_minor bigint,
  is_user_entered boolean not null default true
);
create index on income_deductions (income_document_id);

create table income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  income_kind income_kind not null,
  employer_id text,
  typical_gross_minor bigint,
  pay_frequency text,
  last_used_at timestamptz,
  unique (user_id, name)
);
```

`income_sources` powers autocomplete and prefill. `typical_gross_minor` updates on each entry, so prefill reflects recent reality rather than the first entry ever made.

### Reconciliation constraint

Enforced in application code rather than a trigger, because the check differs by `income_kind`:

```ts
function reconciles(doc: IncomeDocument, deductions: Deduction[]): boolean {
  if (doc.income_kind !== 'employment') return true;
  if (doc.net_minor == null) return false;
  const total = deductions.reduce((s, d) => s + d.amount_minor, 0);
  return doc.gross_minor - total === doc.net_minor;
}
```

`reconciles` is persisted so 05 can exclude unbalanced records, and so a later schema audit can find them.

---

## Files

```
packages/core/src/income/
├── index.ts
├── reconcile.ts        # the balance check above
├── continuity.ts       # YTD gap detection
├── annualise.ts        # projection
└── deductions.ts       # DeductionKind, labels, which feed tax

apps/*/routes|screens/Income/
├── IncomeListScreen.tsx
├── AddEmploymentIncome.tsx
├── AddSelfEmploymentIncome.tsx
├── DeductionRows.tsx
└── ReconciliationBar.tsx
```

---

## Acceptance criteria

- Employment income cannot be saved while gross − deductions ≠ net
- The imbalance is shown as a signed amount, not a generic error
- Self-employment income saves with no deductions and no reconciliation
- Employer autocompletes from prior entries
- Prefill offers previous values after two matching entries, never auto-creates
- YTD continuity gaps are detected and name the missing period
- Entering CPP above the annual maximum raises a flag
- Editing an entry recomputes the tax estimate within one second
- Deleting an entry that breaks YTD continuity warns before proceeding
- All amounts are integer cents throughout

---

## Out of scope

- Document parsing (11)
- Business expense deduction (13)
- The tax calculation itself (05)
- Multiple concurrent employers — supported by schema, no special UI
- Spousal income
