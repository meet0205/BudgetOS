# PRD Addendum — Income Documents, Canadian Tax, Business Expenses, Filters

**Supersedes:** F9 (Salary & Allocation), F12 (Reports), F21 (Dashboard)
**Adds:** F25 (Income Document Capture), F26 (Canadian Tax Estimation), F27 (Business Expenses), F28 (Item-Level Filtering), F29 (Interactive Dashboard)
**Region correction:** Canada / Nova Scotia — replaces India assumptions in base PRD
**Version:** 1.2
**Date:** July 2026

---

## B0. Region Correction

The base PRD assumed India throughout — ₹, paise, PF, TDS, HCES references, Indian seed categories. Replace:

| Base PRD | Correction |
|---|---|
| Base currency ₹ INR | **CAD** |
| Minor unit paise | **cents** |
| PF / TDS / ESI deductions | **CPP, EI, federal tax, provincial tax, RPP, union dues** |
| Indian seed categories | **Canadian seed categories** |
| GST/CGST/SGST | **GST / HST / PST by province** — Nova Scotia is 15% HST |
| Financial year Apr–Mar | **Calendar year Jan–Dec** (CRA tax year) |

`profiles.province` (char(2), default `'NS'`) is a user setting. All tax computation resolves brackets by `(province, tax_year)` where `tax_year` is the year the income was **earned**, never the current year. Moving provinces mid-year leaves prior entries under their original jurisdiction.

---

## B1. F25 — Income Document Capture & Parsing

### Intake

Reuses F2's capture surface unchanged: camera, gallery, PDF, screenshot, file import. Plus **manual entry as a first-class path** — every field below is directly enterable without any document, and manual values are marked `is_user_entered` and never overwritten by a later parse.

Manual entry is not a fallback for failed OCR. It is a co-equal path, expected to be used routinely.

### Document types

Detected at parse time, user-correctable:

| Type | Contents | Reconciliation rule |
|---|---|---|
| `payslip` | Period pay stub | gross − deductions = net (**exact**) |
| `t4` | Annual employment slip | box 14 vs sum of stubs |
| `t4a` | Self-employment / other | no deductions expected |
| `t5` | Investment income | no deductions expected |
| `invoice` | Self-employment billing | gross only; HST separate line |
| `uber_summary` | Platform annual/monthly summary | gross fares, fees, HST collected |
| `manual` | User-entered | user asserts values |

### Three parsers

Shared intake and OCR (Tier 1), shared AI layer (A1), divergent at parse.

```
packages/core/src/parser/income/
├── index.ts              # type detection → route
├── payslip.ts            # stub parser
├── taxslip.ts            # T4/T4A/T5 box-number parser
├── invoice.ts            # self-employment invoice
├── uber.ts               # platform summary
├── columns.ts            # YTD vs current disambiguation
├── deductions.ts         # controlled deduction vocabulary
└── reconcile.ts          # per-type balance checks
```

### The YTD column problem

**This is the highest-risk parse error in the feature.** Every pay stub shows current-period and year-to-date figures side by side for each line. Reading the YTD column as current-period overstates income by however many pay periods have elapsed — silently, plausibly, and it corrupts every tax number downstream.

`columns.ts` must:

1. Identify column headers (`Current`, `This Period`, `YTD`, `Year to Date`, `Cumulative`) by text and by x-position clustering
2. Verify the assignment: YTD values must be ≥ current values on every matched line
3. Cross-check against the previous stub: this stub's YTD gross should equal prior stub's YTD gross + this stub's current gross
4. **Refuse to auto-accept if columns cannot be confidently assigned** — route to manual review with both columns shown side by side and the user picks

No stub is persisted with ambiguous column assignment. This check is not confidence-weighted; it is a hard gate.

### Deduction vocabulary

Controlled, not free-text — the tax calculator consumes these by type:

```ts
type DeductionKind =
  | 'federal_tax' | 'provincial_tax'
  | 'cpp' | 'cpp2' | 'ei' | 'qpp' | 'qpip'
  | 'rpp' | 'rrsp' | 'union_dues'
  | 'group_benefits' | 'life_insurance' | 'ltd'
  | 'garnishment' | 'other';
```

Unrecognised labels map to `other` with the raw label preserved, and are surfaced in review for the user to classify. Once classified, the label→kind mapping is remembered per employer (same learning loop as F5).

**CPP and EI annual maximums matter.** Both stop once the yearly maximum is reached, which changes net pay mid-year with no change in gross. The calculator must track YTD contributions against the maximum rather than extrapolating a constant rate.

### Reconciliation

Payslips must balance exactly: `gross − Σ deductions = net`. Currency is integer cents, so there is no rounding tolerance. Any stub that fails goes to manual review — no exceptions, no confidence override.

Cross-stub YTD continuity is checked on every save. A break means either a missing stub or a misparse; the app reports which stub period appears absent rather than a generic warning.

### AI enrichment for income documents

Same three-tier structure as A1, different prompt template. Stubs are easier than grocery receipts — no abbreviation resolution, employers printed in full — but layout varies sharply across payroll providers (ADP, Ceridian, Payworks, QuickBooks, Wagepoint), which is where a rules parser would need a template per provider and the model does not.

**Merge rule from A1 holds and matters more here:** AI for structure and labelling, local OCR for digits. A transposed digit in gross income propagates into every tax figure.

### Schema

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
  source_file_id uuid references receipts(id),   -- reuses capture storage
  employer_name text,
  employer_id text,                              -- payroll/business number
  period_start date,
  period_end date,
  pay_date date,
  tax_year int not null,
  province char(2) not null,
  gross_minor bigint not null,
  net_minor bigint,
  ytd_gross_minor bigint,
  ytd_net_minor bigint,
  currency_code char(3) not null default 'CAD',
  is_user_entered boolean not null default false,
  reconciles boolean not null default false,
  parser_version text,
  ai_enrichment_id uuid references ai_enrichments(id),
  ocr_raw jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on income_documents (user_id, tax_year, pay_date desc);
create index on income_documents (user_id, income_kind, tax_year);

create table income_deductions (
  id uuid primary key default gen_random_uuid(),
  income_document_id uuid not null references income_documents(id) on delete cascade,
  kind text not null,                -- DeductionKind
  raw_label text,
  amount_minor bigint not null,
  ytd_amount_minor bigint,
  is_user_entered boolean not null default false
);
create index on income_deductions (income_document_id);
```

### Acceptance criteria

- Manual entry produces a complete, valid income record with no document
- YTD/current columns correctly assigned on ≥95% of stubs; ambiguous cases always route to review, never auto-accept
- Payslip reconciliation is exact; failures cannot be dismissed
- Cross-stub YTD breaks are detected and name the missing period
- CPP/EI maximums tracked against YTD, not extrapolated
- User-entered fields survive re-parse unchanged
- Employer label→deduction-kind mappings persist and apply to subsequent stubs

---

## B2. F26 — Canadian Tax Estimation

### Explicit scope limit

This produces a **planning estimate**, not a tax filing. Bracket arithmetic does not capture credits, deductions, carry-forwards, spousal transfers, or the full CPP self-employment interaction. Every figure this feature displays is labelled an estimate. The app never states what the user owes CRA — that is a filing determination.

### Brackets are data, not code

Rates change annually and are indexed. Nova Scotia began indexing only recently, after years of unindexed brackets. **Values must be populated from CRA sources, not hardcoded from memory**, and each bracket set records where it came from and when it was checked.

```sql
create table tax_jurisdictions (
  id uuid primary key default gen_random_uuid(),
  country char(2) not null default 'CA',
  province char(2),                    -- null = federal
  tax_year int not null,
  brackets jsonb not null,             -- [{ upto_minor, rate }] ascending, last upto_minor null
  basic_personal_amount_minor bigint not null,
  low_income_reduction jsonb,          -- NS-specific, nullable
  source_url text,
  verified_on date,
  unique (country, province, tax_year)
);

create table contribution_rules (
  id uuid primary key default gen_random_uuid(),
  tax_year int not null,
  kind text not null,                  -- 'cpp','cpp2','ei','qpp'
  rate numeric(6,5) not null,
  max_pensionable_minor bigint,
  exemption_minor bigint,
  self_employed_multiplier numeric(3,1) not null default 1.0,
  source_url text,
  verified_on date,
  unique (tax_year, kind)
);
```

`self_employed_multiplier` is **2.0 for CPP** — self-employed pay both the employee and employer halves. This single field accounts for much of why self-employment tax feels disproportionate, and the estimate breakdown must show it as its own line rather than folding it into a total.

A settings screen lists each jurisdiction with its `verified_on` date and prompts the user to re-check when a new tax year begins.

### The running calculation

Recomputed from scratch on every income or expense change — never incrementally patched.

```
1. YTD income by kind
     employment gross      (Σ payslips)
     self-employment net   (Σ invoices/platform − deductible expenses, F27)
     other                 (investment, rental)

2. Projected annual income
     YTD annualised by elapsed periods, OR user override

3. Combined taxable income
     ── self-employment is taxed ON TOP of employment income,
        at the marginal rate that combined total reaches.
        Never computed in isolation.

4. Estimated tax
     federal brackets  (tax_year, country='CA', province=null)
   + provincial brackets (tax_year, province)
   − basic personal amounts
   − NS low-income reduction if applicable

5. Contributions
     CPP/EI employment portion   (from stubs, capped at annual max)
   + CPP self-employment          (× 2.0 multiplier, capped)

6. Already paid
     Σ federal_tax + provincial_tax withheld across all stubs
   + Σ instalments recorded

7. Shortfall = (4 + 5) − 6
```

### Reserve behaviour

**Auto-reserve on the net gap.** Not gross per transaction — net of overall position.

- Employment income arrives: withholding is recorded as *already paid*. Reserves nothing.
- Self-employment income arrives: nothing withheld. The marginal-rate estimate on the net amount is reserved.
- If employment withholding runs **ahead** of total liability, the surplus offsets the self-employment reserve rather than sitting idle.

**Reserve multiplier defaults to 1.10.** The failure modes are asymmetric: over-reserving yields a surplus in April, under-reserving means finding cash already spent. User-adjustable, defaults high.

The reserve is a **system allocation bucket** (F9) — deducted from safe-to-spend before it is calculated, same semantics as a savings goal. Spending from it requires an explicit override and a warning, because that override is precisely the failure this feature prevents.

### Instalment threshold

CRA requires quarterly instalments when net tax owing exceeds **$3,000** in the current year and in either of the two prior years. Verify the current threshold and due dates against CRA — these change.

The app flags when projected net owing crosses the threshold, shows the four quarterly due dates, and tracks instalments paid. Missing instalments accrue interest, so this is a notification, not a passive display.

### GST/HST for rideshare

**Rideshare drivers must register for GST/HST from the first dollar.** The $30,000 small-supplier exemption does not apply to taxi and ride-share services. Nova Scotia HST is 15%.

This is a **separate obligation from income tax**, tracked separately:

- HST collected on fares (platform summaries typically report this)
- Input tax credits on business expenses (F27)
- Net remittance = collected − ITCs

Verify how Uber Canada currently handles collection and reporting — this has changed and may have changed again.

### Display

**Monthly:** amount to set aside this month, YTD reserved, YTD paid, current position.
**Annual:** projected income by kind, estimated total tax, estimated CPP/EI, already withheld, projected balance at filing, instalment status.

Every figure carries an estimate label. The breakdown is always expandable to show which brackets and rules produced it, with `verified_on` dates visible.

### Schema

```sql
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
  kind text not null default 'income_tax'   -- or 'hst'
);

create table hst_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  collected_minor bigint not null default 0,
  input_tax_credits_minor bigint not null default 0,
  net_remittance_minor bigint not null default 0,
  filed_on date,
  paid_on date
);
```

### Acceptance criteria

- Self-employment tax always computed on combined income at marginal rate, never in isolation
- CPP self-employment multiplier applied and shown as a distinct line
- CPP/EI capped at annual maximums
- Reserve is net of overall position; employment over-withholding offsets self-employment reserve
- Reserve bucket deducts from safe-to-spend; spending requires explicit override
- Instalment threshold detection triggers notification with due dates
- HST tracked separately from income tax
- Brackets resolve by earned-year, not current year
- Every displayed figure labelled as estimate; breakdown always expandable
- Missing or stale `verified_on` surfaces a prompt to re-check CRA

---

## B3. F27 — Business Expenses & Vehicle Deduction

### Why it exists

**Self-employment income is taxed on net, not gross.** Reserving on gross Uber fares would over-reserve substantially. Deductible expenses reduce the taxable amount, so the reserve must recompute as expenses land through the month.

### Business-use flag

Not a new table — a flag on `transaction_splits`:

```sql
alter table transaction_splits
  add column business_use_percent numeric(5,2) not null default 0,
  add column business_expense_kind text,
  add column hst_paid_minor bigint not null default 0;
```

A gas receipt is simultaneously a personal expense and a business deduction at the user's business-use percentage. One transaction, one split, two readings.

`business_expense_kind` uses CRA expense categories: `fuel`, `insurance`, `maintenance`, `licence_registration`, `interest`, `leasing`, `cca`, `phone`, `supplies`, `parking`, `tolls`, `platform_fees`, `other`.

### Business-use percentage — manual

**User sets this in settings. The app does not infer it and does not track driving.**

CRA expects the percentage to be supported by a mileage log (business km ÷ total km). The app provides optional manual odometer entry — start and end readings per period — but does not require it and does not track location.

A note in settings states that CRA expects a log, that this deduction is among the most likely to be reviewed, and that reconstructing it after the fact is difficult. Informational, not enforced.

### Vehicle capital cost allowance

CCA is the largest and most complex vehicle deduction — depreciation on the vehicle apportioned by business use, with class-specific rates, a first-year half-rate rule, and a cost ceiling for passenger vehicles.

**Manual entry only.** The app records the CCA amount the user enters and applies it to the net calculation. It does not compute CCA, because doing so correctly requires prior-year UCC balances and disposal history that belong in tax software.

### Net self-employment income

```
gross fares (or invoiced amount)
− platform fees
− fuel × business_use%
− insurance × business_use%
− maintenance × business_use%
− other vehicle costs × business_use%
− phone × business_use%
− CCA (user-entered)
− other business expenses
= net self-employment income  → feeds F26 step 1
```

Recomputed on every relevant transaction change; the reserve target moves with it.

### Input tax credits

HST paid on business expenses is recoverable against HST collected. `hst_paid_minor` × `business_use_percent` accumulates into `hst_periods.input_tax_credits_minor`.

### Acceptance criteria

- Business-use percentage is user-set, never inferred
- No location tracking of any kind
- Expenses reduce net self-employment income and lower the reserve target in the same recomputation
- One transaction serves as both personal expense and business deduction without duplication
- CCA is user-entered and never computed
- Optional odometer entry is genuinely optional
- ITCs accumulate from business-use-apportioned HST paid

---

## B4. F28 — Item-Level Filtering

### The requirement

Filter across the entire history by what was bought, independent of where. Buy a t-shirt at Gap and another at Aéropostale — select "t-shirt" and see both, with store, price, and date, filterable by month or year.

This reads `line_items` and `products`, not `transactions`. The base PRD's F12 reports aggregate by category and merchant; this is orthogonal to both.

### Filter dimensions

Composable, any combination:

| Dimension | Source | Example |
|---|---|---|
| Product | `products.id` | "Great Value Whole Milk" |
| Product type | `products.type_slug` | "t-shirt" — spans brands and stores |
| Brand | `line_items.brand` | "Gap" |
| Merchant | `merchants.id` | "Gap Halifax" |
| Merchant chain | `merchants.chain_id` | all Gap locations |
| Category | product-layer `categories` | "Clothing" |
| Period | month, quarter, year, custom | — |
| Price range | `line_items.amount` | — |
| Unit price range | `normalized_unit_price` | cross-size comparison |
| Business use | `business_use_percent > 0` | deductible only |
| Payment account | `transactions.account_id` | — |

### Product type — the layer that makes it work

`products` currently holds specific items. Item-level filtering needs a **type** above the specific product: *t-shirt* is a type; *Gap Essential Crew Tee Navy M* is a product.

```sql
create table product_types (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  category_id uuid references categories(id),
  parent_type_id uuid references product_types(id),
  is_system boolean not null default true
);

alter table products
  add column product_type_id uuid references product_types(id);
```

Types are hierarchical: `clothing > tops > t-shirt`. Filtering on `tops` includes t-shirts, and filtering on `t-shirt` does not include jeans.

Type assignment comes from the AI enrichment layer (A1) — `categorySlug` extends to also return `productTypeSlug`, constrained to the seeded type list the same way. User correction overrides and persists to the product record.

### Saved filters

```sql
create table saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  filter_json jsonb not null,
  pinned_to_dashboard boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
```

Pinned filters appear as dashboard cards (F29).

### Results view

Any filter result shows: total spent, item count, average unit price, price trend over the period, breakdown by store, and the full line-item list with date, merchant, price, and unit price. Exports to CSV.

The price trend is the point of connection with F15 — filter to "t-shirt," see what you've paid over two years across every store.

### Performance

Filtering across years of line items needs indexes on the actual query shape:

```sql
create index on line_items (user_id, product_type_id, purchased_at desc);
create index on line_items (user_id, brand, purchased_at desc);
create index on line_items using gin (description gin_trgm_ops);
create index on products (user_id, product_type_id);
```

Aggregations over long ranges read `monthly_category_totals` where possible; item-level queries hit `line_items` directly with the indexes above.

### Acceptance criteria

- Filtering by product type returns matching items across all merchants and brands
- Filters compose without restriction
- Month and year filtering applies to every dimension
- Results show unit-price comparison across stores
- Filters save, name, and pin to dashboard
- Results export to CSV
- Query over 3 years of line items returns in under 500 ms

---

## B5. F29 — Interactive Dashboard

Replaces F21's static layout.

### Chart types

| Chart | Shows | Interaction |
|---|---|---|
| **Bar** | Spend by category/merchant/month | Tap segment → drill to filtered list |
| **Pie / donut** | Category share of period | Tap slice → drill; centre shows total |
| **Sankey** | Income → allocation → spend flow | Tap flow → drill to that path |
| **Line** | Trend over time, price history | Pinch zoom, tap point for detail |
| **Stacked area** | Category composition over time | Toggle series in legend |
| **Heatmap** | Spend by day of month/week | Tap cell → that day's transactions |

Every chart is a drill-down entry point into F28's filter results. Tapping is not decoration; it applies a filter and navigates.

### Dashboard controls

A control bar above the charts:

- **Period selector** — month / quarter / year / custom, applies to all cards at once
- **Chart type dropdown** — per card, switch between compatible visualisations
- **Dimension dropdown** — per card, switch what is being grouped (category / merchant / product type / account)
- **Comparison toggle** — overlay previous period or same period last year

Card layout is user-arrangeable and persists per device.

```sql
create table dashboard_layout (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text,
  cards jsonb not null,     -- [{ id, type, chart, dimension, filter_id, position, size }]
  updated_at timestamptz not null default now(),
  unique (user_id, device_label)
);
```

### Default cards

1. **Safe-to-spend** — number, with the tax reserve shown as a distinct deduction
2. **Tax position** — YTD reserved vs estimated owing, instalment status if applicable
3. **Spend by category** — donut, current period
4. **Income vs spend flow** — Sankey, current month
5. **Top insight** — F13
6. **Upcoming bills** — next 14 days
7. **Category trend** — stacked area, 6 months

Cards beyond these come from pinned saved filters (F28).

### Library

Recharts on web and desktop, Victory Native on mobile — as base PRD. Sankey on mobile needs verification; if Victory Native lacks it, either a `react-native-svg` custom implementation or a WebView-hosted Recharts instance. Resolve during Phase 8.

### Acceptance criteria

- Every chart segment drills to a filtered list
- Period selector applies across all cards simultaneously
- Chart type and dimension switchable per card without losing filter state
- Layout persists per device
- Pinned filters render as cards
- Comparison overlay works on all time-series charts
- Dashboard renders in under 1 s with 3 years of data

---

## B6. Build Sequence Changes

| Phase | Change |
|---|---|
| **1 — Foundation** | Add `tax_jurisdictions`, `contribution_rules`; seed federal + NS from CRA with `verified_on` |
| **3.5 — AI Enrichment** | Extend prompt to return `productTypeSlug`; add income-document prompt templates |
| **5 — Ledger** | Add `business_use_percent` and `hst_paid_minor` to splits |
| **6 — Money Planning** | **F25 + F26 land here.** Income capture, tax estimation, reserve bucket. Manual entry path first, parsers second |
| **6.6 — Business Expenses (new)** | F27. Depends on F26 |
| **8 — Reports** | **F28 lands here.** `product_types` seed, indexes, filter UI, saved filters |
| **8.5 — Dashboard (new)** | F29. Depends on F28 |

**Sequencing note:** build manual income entry and the tax calculator *before* the income-document parsers. The calculator is the valuable part and is testable with typed-in numbers. Parsers reduce typing; they are not the feature.

---

## B7. Open Questions

1. **CRA figures must be sourced.** Federal and NS brackets, basic personal amounts, CPP/EI rates and maximums, CPP2, the NS low-income reduction, the instalment threshold, and instalment due dates. Populate from CRA before Phase 6. Values in this document are described structurally and deliberately not stated numerically.
2. **Uber HST reporting.** Confirm how Uber Canada currently reports HST collected and whether it remits any portion. This has changed previously.
3. **Business-use percentage default.** Suggest leaving it 0 and requiring the user to set it explicitly, so the deduction is never silently applied.
4. **Prior-year data.** Does the tax estimate need to import prior years for the instalment two-year test, or is that manually entered?
5. **Sankey on mobile.** Verify Victory Native support during Phase 8.
6. **Spousal / household.** Assumed single-filer throughout. Confirm.
