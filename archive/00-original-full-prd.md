# Product Requirements Document
## Personal Budget Planner & Money Management Application

**Version:** 1.0
**Date:** July 2026
**Status:** Draft for build

---

## 0. Document Purpose

This PRD specifies a personal finance application built for a single primary user (extensible to household members later). It is a *personal tool*, not a regulated financial product. It does not give investment advice, does not connect to banks, and does not benchmark the user against external populations. Everything it knows, it learns from receipts, bills, and manually entered salary.

Every feature section below follows the same structure:

- **What it does** — the user-facing behaviour
- **How it works** — the mechanism
- **Data** — tables and fields touched
- **Files** — where the code lives
- **Acceptance criteria** — how we know it's done

---

## 1. Product Summary

### 1.1 The core loop

1. User enters their monthly pay.
2. User allocates that pay into buckets: savings, investment, emergency fund, debt, and fixed bills.
3. Whatever remains is **safe-to-spend**, expressed per month and per day.
4. User photographs every receipt and bill. On-device OCR reads it. A local parser turns text into line items.
5. Each line item is categorised individually, so a single grocery trip splits across produce, snacks, household, alcohol.
6. Spending draws down safe-to-spend in real time.
7. Reports show where money went by month, year-to-date, and year-over-year.
8. Insights compare the user against *their own history* and model trade-offs: cut this category by 20%, reach the goal this many months sooner.

### 1.2 What makes it different

Bank-feed apps know you spent ₹3,400 at a supermarket. This app knows you bought 2kg of rice at ₹68/kg, that the same rice was ₹61/kg two months ago, and that snacks are 22% of your grocery spend and rising.

That line-item granularity is the entire wedge. Every distinctive feature — price-per-unit tracking, brand-switch suggestions, basket inflation, warranty tracking — falls out of it.

### 1.3 Non-goals for v1

- Bank / UPI / card connectivity
- Investment product recommendations of any kind
- Comparison against other users or public survey data
- Multi-user households (schema is ready; UI is not)
- Tax filing

---

## 2. Platform & Technology

### 2.1 Confirmed stack

| Layer | Technology |
|---|---|
| Web app | React 18 + Vite + TypeScript |
| Desktop | Electron (wraps the Vite build) |
| Mobile | Expo (React Native) — Android + iOS |
| Backend / DB / Auth / Storage | Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime) |
| OCR | On-device only — Apple Vision (iOS), ML Kit (Android), Tesseract.js (web/desktop) |
| Shared logic | TypeScript workspace package consumed by all three clients |
| State | TanStack Query + Zustand |
| Local cache | WatermelonDB (mobile), IndexedDB via Dexie (web/desktop) |
| Charts | Recharts (web/desktop), Victory Native (mobile) |

### 2.2 Why this shape

Expo React Native was chosen over Capacitor because receipt capture is the core loop and it deserves a native camera with live edge detection. The cost is a second UI layer. That cost is contained by pushing everything that isn't a screen — parsing, categorisation, budget maths, insight generation — into a shared package that both UI layers import.

Electron wraps the same Vite bundle the web app uses, so desktop is nearly free. Desktop's job is bulk work: importing a folder of PDF bills, correcting a month of miscategorised items, reading reports on a big screen.

### 2.3 Monorepo structure

```
budget-app/
├── package.json                  # pnpm workspaces root
├── pnpm-workspace.yaml
├── turbo.json
│
├── packages/
│   ├── core/                     # ALL platform-agnostic logic
│   │   ├── src/
│   │   │   ├── parser/           # receipt text → structured data
│   │   │   │   ├── index.ts
│   │   │   │   ├── normalize.ts        # whitespace, OCR confusions
│   │   │   │   ├── merchant.ts         # merchant identification
│   │   │   │   ├── dates.ts            # multi-format date extraction
│   │   │   │   ├── amounts.ts          # currency & number parsing
│   │   │   │   ├── lineItems.ts        # the core line-item extractor
│   │   │   │   ├── totals.ts           # tax, discount, total
│   │   │   │   ├── reconcile.ts        # sum(items) vs total
│   │   │   │   ├── confidence.ts       # per-field confidence scoring
│   │   │   │   └── templates/          # per-merchant layout hints
│   │   │   ├── categorization/
│   │   │   │   ├── index.ts
│   │   │   │   ├── rules.ts            # user + system rules engine
│   │   │   │   ├── keywords.ts         # seeded keyword→category map
│   │   │   │   ├── merchantMap.ts      # merchant→default category
│   │   │   │   ├── learning.ts         # correction feedback loop
│   │   │   │   └── taxonomy.ts         # the two-layer taxonomy
│   │   │   ├── budget/
│   │   │   │   ├── allocation.ts       # salary → buckets
│   │   │   │   ├── safeToSpend.ts
│   │   │   │   ├── rollover.ts
│   │   │   │   └── forecast.ts         # cash-flow projection
│   │   │   ├── goals/
│   │   │   │   ├── projection.ts
│   │   │   │   └── contribution.ts
│   │   │   ├── insights/
│   │   │   │   ├── engine.ts           # orchestrator
│   │   │   │   ├── detectors/
│   │   │   │   │   ├── categoryDrift.ts
│   │   │   │   │   ├── subscription.ts
│   │   │   │   │   ├── billCreep.ts
│   │   │   │   │   ├── priceIncrease.ts
│   │   │   │   │   ├── anomaly.ts
│   │   │   │   │   └── unusedSubscription.ts
│   │   │   │   └── tradeoff.ts         # compromise modelling
│   │   │   ├── pricing/
│   │   │   │   ├── unitPrice.ts        # normalise to per-kg / per-L
│   │   │   │   ├── productIdentity.ts  # same product across receipts
│   │   │   │   └── basketIndex.ts      # personal inflation
│   │   │   ├── warranty/
│   │   │   │   └── detect.ts
│   │   │   ├── currency/
│   │   │   │   ├── convert.ts
│   │   │   │   └── rates.ts
│   │   │   ├── reports/
│   │   │   │   ├── aggregate.ts
│   │   │   │   ├── compare.ts          # MoM, YoY
│   │   │   │   └── export.ts           # CSV / JSON shaping
│   │   │   ├── sync/
│   │   │   │   ├── queue.ts
│   │   │   │   ├── conflict.ts
│   │   │   │   └── hash.ts             # dedupe hashing
│   │   │   ├── db/
│   │   │   │   ├── client.ts           # Supabase client factory
│   │   │   │   ├── queries/            # one file per entity
│   │   │   │   └── types.ts            # generated from Supabase
│   │   │   ├── models/                 # domain types
│   │   │   └── utils/
│   │   └── package.json
│   │
│   ├── ui/                       # shared design tokens & primitives
│   │   ├── src/
│   │   │   ├── tokens.ts               # colours, spacing, type scale
│   │   │   ├── icons/
│   │   │   └── formatters.ts           # currency, date, percent
│   │   └── package.json
│   │
│   └── ocr/                      # OCR abstraction layer
│       ├── src/
│       │   ├── types.ts                # OcrResult, TextBlock, BoundingBox
│       │   ├── index.ts                # platform dispatch
│       │   ├── preprocess.ts           # deskew, contrast, crop
│       │   └── adapters/
│       │       ├── vision.native.ts     # Apple Vision via Expo module
│       │       ├── mlkit.native.ts      # ML Kit via Expo module
│       │       └── tesseract.web.ts     # Tesseract.js worker
│       └── package.json
│
├── apps/
│   ├── web/                      # React + Vite
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── src/
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── routes/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── receipts/
│   │   │   │   ├── transactions/
│   │   │   │   ├── bills/
│   │   │   │   ├── budget/
│   │   │   │   ├── goals/
│   │   │   │   ├── reports/
│   │   │   │   ├── insights/
│   │   │   │   ├── prices/
│   │   │   │   ├── warranties/
│   │   │   │   ├── subscriptions/
│   │   │   │   └── settings/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   ├── desktop/                  # Electron
│   │   ├── electron/
│   │   │   ├── main.ts
│   │   │   ├── preload.ts
│   │   │   ├── ipc/
│   │   │   │   ├── fileImport.ts       # bulk folder import
│   │   │   │   ├── pdfExtract.ts
│   │   │   │   └── export.ts
│   │   │   └── menu.ts
│   │   ├── electron-builder.yml
│   │   └── package.json
│   │
│   └── mobile/                   # Expo
│       ├── app.json
│       ├── App.tsx
│       ├── src/
│       │   ├── navigation/
│       │   ├── screens/
│       │   │   ├── Capture/            # the camera screen
│       │   │   ├── Review/             # parsed-receipt correction
│       │   │   ├── Dashboard/
│       │   │   ├── Transactions/
│       │   │   ├── Bills/
│       │   │   ├── Budget/
│       │   │   ├── Goals/
│       │   │   ├── Reports/
│       │   │   ├── Insights/
│       │   │   └── Settings/
│       │   ├── components/
│       │   ├── db/                     # WatermelonDB schema & models
│       │   └── native/
│       │       ├── VisionOcr.ts        # native module bridge
│       │       └── MlKitOcr.ts
│       ├── modules/                    # Expo native modules
│       │   ├── expo-vision-ocr/
│       │   └── expo-mlkit-ocr/
│       └── package.json
│
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 0001_extensions.sql
    │   ├── 0002_profiles.sql
    │   ├── 0003_accounts.sql
    │   ├── 0004_categories.sql
    │   ├── 0005_merchants.sql
    │   ├── 0006_receipts.sql
    │   ├── 0007_transactions.sql
    │   ├── 0008_line_items.sql
    │   ├── 0009_products.sql
    │   ├── 0010_price_observations.sql
    │   ├── 0011_income.sql
    │   ├── 0012_buckets.sql
    │   ├── 0013_budgets.sql
    │   ├── 0014_goals.sql
    │   ├── 0015_recurring.sql
    │   ├── 0016_subscriptions.sql
    │   ├── 0017_warranties.sql
    │   ├── 0018_currencies.sql
    │   ├── 0019_rules.sql
    │   ├── 0020_insights.sql
    │   ├── 0021_aggregates.sql
    │   ├── 0022_rls_policies.sql
    │   └── 0023_functions.sql
    ├── functions/                      # Edge Functions (Deno)
    │   ├── refresh-aggregates/
    │   ├── generate-insights/
    │   ├── fx-rates/
    │   ├── bill-reminders/
    │   └── export-data/
    └── seed.sql
```

### 2.4 The shared-logic rule

If a piece of code contains a `<View>`, a `<div>`, or a platform import, it lives in `apps/`. Everything else lives in `packages/core`. This is non-negotiable — it is the only thing that makes three clients maintainable by a small team.

---

## 3. Data Architecture

### 3.1 Design principles

**Split-based ledger.** Every transaction owns one or more splits. A simple purchase has one split. A grocery receipt has one split per line item. Transfers between accounts produce two splits that cancel. This means category totals are always sums over splits, never over transactions, and transfers never pollute expense reports.

**Receipts are evidence, transactions are truth.** A receipt is an immutable record of a scan. The transaction it produces is editable. Re-parsing a receipt with an improved parser creates a new proposed transaction the user can accept, without destroying corrections they already made.

**Raw OCR is never thrown away.** The full text output and block geometry are stored as JSONB. When the parser improves, historical receipts can be reprocessed offline.

**Amounts are integers.** All money is stored in minor units (paise, cents) as `bigint`. No floats anywhere in the money path.

**Soft deletes.** `deleted_at` on user-facing tables. Nothing is hard-deleted except on explicit account deletion.

### 3.2 Conventions

- Every user-owned table has `user_id uuid not null references auth.users(id)`
- Every table has `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()`
- `updated_at` maintained by a shared trigger
- All tables have Row Level Security enabled with `user_id = auth.uid()`
- Primary keys are `uuid default gen_random_uuid()`
- Money: `amount_minor bigint` + `currency_code char(3)`

### 3.3 Schema

#### profiles

Extends `auth.users` with app-specific settings.

```sql
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency char(3) not null default 'INR',
  locale text not null default 'en-IN',
  timezone text not null default 'Asia/Kolkata',
  month_start_day smallint not null default 1
    check (month_start_day between 1 and 28),
  week_start_day smallint not null default 1,
  onboarding_completed boolean not null default false,
  ocr_review_threshold numeric(3,2) not null default 0.80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`month_start_day` matters more than it looks. Users paid on the 25th think in pay-cycle months, not calendar months. Every report and budget period respects this.

#### accounts

Where money sits or comes from. Manual balances only in v1.

```sql
create type account_type as enum (
  'cash', 'bank', 'credit_card', 'wallet', 'savings', 'investment', 'loan'
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type account_type not null,
  currency_code char(3) not null,
  opening_balance_minor bigint not null default 0,
  current_balance_minor bigint not null default 0,
  is_active boolean not null default true,
  include_in_net_worth boolean not null default true,
  sort_order int not null default 0,
  icon text,
  color text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on accounts (user_id) where deleted_at is null;
```

#### categories

The two-layer taxonomy. `layer` distinguishes merchant-level from product-level.

```sql
create type category_layer as enum ('transaction', 'product');
create type category_kind  as enum ('expense', 'income', 'transfer');

create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = system
  parent_id uuid references categories(id) on delete cascade,
  name text not null,
  slug text not null,
  layer category_layer not null default 'transaction',
  kind category_kind not null default 'expense',
  icon text,
  color text,
  is_essential boolean not null default false,
  is_system boolean not null default false,
  sort_order int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug, layer)
);
create index on categories (user_id, layer) where deleted_at is null;
create index on categories (parent_id);
```

`is_essential` drives the needs-vs-wants split used by 50/30/20 and by trade-off modelling — the engine only ever suggests cutting non-essential categories.

**Seeded transaction-layer taxonomy** (parent → children):

- **Housing** — Rent, Mortgage, Property Tax, Maintenance, Furnishings
- **Utilities** — Electricity, Water, Gas, Internet/WiFi, Mobile, Cable/DTH, Waste
- **Groceries** — Supermarket, Local Market, Online Grocery
- **Dining** — Restaurant, Takeout/Delivery, Cafe, Bar
- **Transport** — Fuel/Petrol, Public Transit, Ride-hailing, Parking, Tolls, Vehicle Maintenance, Vehicle Insurance
- **Health** — Doctor, Pharmacy, Hospital, Dental, Vision, Health Insurance, Gym/Fitness
- **Personal Care** — Salon, Cosmetics, Toiletries
- **Clothing** — Apparel, Footwear, Accessories, Laundry/Tailoring
- **Entertainment** — Streaming, Movies/Events, Games, Books, Hobbies
- **Subscriptions** — Software, Media, Memberships
- **Shopping** — Electronics, Home Goods, Kitchen, Sports Equipment
- **Education** — Tuition, Courses, Books/Supplies
- **Kids** — Childcare, School Fees, Kids Clothing, Toys
- **Pets** — Pet Food, Vet, Pet Supplies
- **Travel** — Flights, Accommodation, Local Transport, Travel Food
- **Financial** — Bank Fees, Interest Paid, Taxes, Late Fees
- **Insurance** — Life, Home, Other
- **Gifts & Donations** — Gifts, Charity
- **Income** — Salary, Bonus, Freelance, Interest Earned, Refunds, Other Income
- **Transfers** — Between Accounts, To Savings, To Investment, Debt Payment
- **Miscellaneous**

**Seeded product-layer taxonomy** (for line items inside receipts):

Produce, Fruit, Vegetables, Dairy & Eggs, Meat, Seafood, Bakery, Rice & Grains, Pulses & Lentils, Cooking Oil, Spices & Condiments, Pantry/Dry Goods, Frozen Foods, Ready Meals, Snacks, Confectionery, Beverages, Tea & Coffee, Alcohol, Tobacco, Cleaning Supplies, Laundry, Paper Goods, Kitchen Supplies, Toiletries, Cosmetics, Baby Products, Pet Products, Medicine, Stationery, Electronics/Accessories, Clothing Items, Home Goods, Other.

#### merchants

```sql
create table merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = system seed
  canonical_name text not null,
  display_name text not null,
  default_category_id uuid references categories(id),
  logo_url text,
  is_grocery boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on merchants (user_id);
create index on merchants using gin (canonical_name gin_trgm_ops);

create table merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  alias text not null,
  source text not null default 'user',  -- 'user' | 'ocr' | 'seed'
  created_at timestamptz not null default now(),
  unique (merchant_id, alias)
);
create index on merchant_aliases using gin (alias gin_trgm_ops);
```

Trigram indexes power fuzzy matching of OCR-garbled merchant names against known aliases.

#### receipts

```sql
create type receipt_source as enum ('camera', 'gallery', 'pdf', 'screenshot', 'manual');
create type receipt_status as enum (
  'uploaded', 'ocr_running', 'ocr_failed', 'parsed',
  'needs_review', 'confirmed', 'discarded'
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source receipt_source not null,
  status receipt_status not null default 'uploaded',

  storage_path text,               -- Supabase Storage object path
  thumbnail_path text,
  file_mime text,
  file_size_bytes bigint,
  page_count int not null default 1,

  content_hash text,               -- sha256 of file bytes
  perceptual_hash text,            -- pHash for near-duplicate images

  ocr_engine text,                 -- 'apple_vision' | 'mlkit' | 'tesseract'
  ocr_raw jsonb,                   -- full text + block geometry
  ocr_text text,                   -- flattened plain text
  ocr_completed_at timestamptz,

  parsed jsonb,                    -- structured parser output
  parse_confidence numeric(3,2),
  parser_version text,

  captured_at timestamptz,         -- when the purchase happened
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on receipts (user_id, status);
create index on receipts (user_id, captured_at desc);
create unique index on receipts (user_id, content_hash)
  where content_hash is not null and deleted_at is null;
```

The unique index on `(user_id, content_hash)` makes duplicate uploads impossible at the database level, not just the UI level.

#### transactions

```sql
create type txn_type as enum ('expense', 'income', 'transfer', 'refund', 'adjustment');
create type txn_source as enum ('receipt', 'manual', 'recurring', 'import');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  transfer_account_id uuid references accounts(id) on delete set null,
  receipt_id uuid references receipts(id) on delete set null,
  merchant_id uuid references merchants(id) on delete set null,

  type txn_type not null default 'expense',
  source txn_source not null default 'manual',

  occurred_at timestamptz not null,
  posted_date date not null,       -- generated in user's timezone

  amount_minor bigint not null,    -- always positive; sign comes from type
  currency_code char(3) not null,
  base_amount_minor bigint not null,   -- converted to profile.base_currency
  fx_rate numeric(18,8) not null default 1,
  fx_rate_date date,

  tax_minor bigint not null default 0,
  tip_minor bigint not null default 0,
  discount_minor bigint not null default 0,

  description text,
  notes text,
  payment_method text,
  is_reimbursable boolean not null default false,
  reimbursed_at timestamptz,
  is_reviewed boolean not null default false,

  refund_of_id uuid references transactions(id),

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on transactions (user_id, posted_date desc) where deleted_at is null;
create index on transactions (user_id, merchant_id);
create index on transactions (account_id);
create index on transactions (receipt_id);
```

#### transaction_splits

The real ledger. All reporting reads from here.

```sql
create table transaction_splits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  amount_minor bigint not null,
  base_amount_minor bigint not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on transaction_splits (transaction_id);
create index on transaction_splits (user_id, category_id);
```

A constraint trigger enforces `sum(splits.amount_minor) = transactions.amount_minor` on commit.

#### line_items

Individual products from a receipt. Links to a split so category totals stay consistent.

```sql
create table line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  split_id uuid references transaction_splits(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  category_id uuid references categories(id),   -- product-layer category

  line_index int not null,
  raw_text text not null,          -- exactly as OCR read it
  description text not null,       -- cleaned

  quantity numeric(12,3) not null default 1,
  unit text,                       -- 'kg','g','l','ml','pc','pack'
  unit_price_minor bigint,
  amount_minor bigint not null,
  base_amount_minor bigint not null,

  discount_minor bigint not null default 0,
  tax_minor bigint not null default 0,

  normalized_quantity numeric(12,4), -- converted to kg or L
  normalized_unit text,              -- 'kg' | 'l' | 'pc'
  normalized_unit_price_minor bigint,

  parse_confidence numeric(3,2),
  category_confidence numeric(3,2),
  is_user_corrected boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on line_items (transaction_id, line_index);
create index on line_items (user_id, product_id);
create index on line_items (user_id, category_id);
```

#### products

The user's personal product catalogue, built up automatically as receipts arrive.

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_name text not null,
  brand text,
  category_id uuid references categories(id),
  default_unit text,
  pack_size numeric(12,3),
  pack_unit text,
  barcode text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  purchase_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on products (user_id);
create index on products using gin (canonical_name gin_trgm_ops);

create table product_aliases (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  alias text not null,
  unique (product_id, alias)
);
create index on product_aliases using gin (alias gin_trgm_ops);
```

Product identity is the hardest matching problem in the app. "AMUL TAAZA MILK 1L", "Amul Taaza 1 L", and "AMUL TAAZA MLK1L" are one product. Handled by trigram similarity plus token-set scoring, with a user merge/split UI as the escape hatch.

#### price_observations

Every time a product is bought, its price is recorded. This is the price-tracking substrate.

```sql
create table price_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  line_item_id uuid references line_items(id) on delete set null,
  merchant_id uuid references merchants(id) on delete set null,
  observed_on date not null,
  unit_price_minor bigint not null,
  normalized_unit_price_minor bigint,
  normalized_unit text,
  currency_code char(3) not null,
  created_at timestamptz not null default now()
);
create index on price_observations (user_id, product_id, observed_on desc);
create index on price_observations (user_id, merchant_id, product_id);
```

#### income_sources & income_entries

```sql
create type income_frequency as enum (
  'monthly','semi_monthly','biweekly','weekly','annual','irregular'
);

create table income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  employer text,
  frequency income_frequency not null default 'monthly',
  gross_amount_minor bigint,
  net_amount_minor bigint not null,
  currency_code char(3) not null,
  pay_day smallint,                -- day of month
  account_id uuid references accounts(id),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid references income_sources(id) on delete set null,
  transaction_id uuid references transactions(id) on delete set null,
  received_on date not null,
  gross_minor bigint,
  net_minor bigint not null,
  deductions jsonb,                -- [{label, amount_minor}]
  currency_code char(3) not null,
  created_at timestamptz not null default now()
);
create index on income_entries (user_id, received_on desc);
```

`deductions` as JSONB handles the long tail — PF, professional tax, TDS, health premium — without a rigid schema.

#### allocation_buckets

This is the "investment" feature as the user actually meant it: money removed from spendable income before anything else.

```sql
create type bucket_kind as enum (
  'savings','investment','emergency_fund','debt_payment','sinking_fund','custom'
);
create type allocation_mode as enum ('fixed','percent_of_income','remainder');

create table allocation_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind bucket_kind not null,
  mode allocation_mode not null default 'fixed',
  amount_minor bigint,             -- when mode = 'fixed'
  percent numeric(5,2),            -- when mode = 'percent_of_income'
  currency_code char(3) not null,
  target_account_id uuid references accounts(id),
  linked_goal_id uuid references goals(id) on delete set null,
  priority int not null default 0, -- lower funds first
  is_active boolean not null default true,
  auto_create_transfer boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on allocation_buckets (user_id, priority);

create table bucket_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id uuid not null references allocation_buckets(id) on delete cascade,
  period_start date not null,
  planned_minor bigint not null,
  actual_minor bigint not null default 0,
  transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket_id, period_start)
);
```

#### budget_periods & budget_lines

```sql
create type budget_method as enum ('fifty_thirty_twenty','zero_based','envelope','simple');

create table budget_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  method budget_method not null default 'fifty_thirty_twenty',
  expected_income_minor bigint not null default 0,
  actual_income_minor bigint not null default 0,
  total_allocated_minor bigint not null default 0,
  currency_code char(3) not null,
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, period_start)
);

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_id uuid not null references budget_periods(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  planned_minor bigint not null default 0,
  rollover_in_minor bigint not null default 0,
  spent_minor bigint not null default 0,
  rollover_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, category_id)
);
create index on budget_lines (user_id, period_id);
```

#### goals

```sql
create type goal_status as enum ('active','paused','achieved','abandoned');

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  target_amount_minor bigint not null,
  current_amount_minor bigint not null default 0,
  currency_code char(3) not null,
  target_date date,
  monthly_contribution_minor bigint,
  priority int not null default 0,
  status goal_status not null default 'active',
  account_id uuid references accounts(id),
  icon text,
  color text,
  achieved_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  amount_minor bigint not null,
  contributed_on date not null,
  created_at timestamptz not null default now()
);
create index on goal_contributions (goal_id, contributed_on desc);
```

#### recurring_bills

```sql
create type bill_frequency as enum (
  'weekly','biweekly','monthly','bimonthly','quarterly','semiannual','annual','custom'
);
create type bill_status as enum ('active','paused','ended');

create table recurring_bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  merchant_id uuid references merchants(id),
  category_id uuid not null references categories(id),
  account_id uuid references accounts(id),

  frequency bill_frequency not null default 'monthly',
  interval_count int not null default 1,
  due_day smallint,                -- day of month
  next_due_date date not null,
  end_date date,

  expected_amount_minor bigint not null,
  amount_varies boolean not null default false,
  currency_code char(3) not null,

  is_autopay boolean not null default false,
  reminder_days_before int not null default 3,
  status bill_status not null default 'active',
  notes text,

  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on recurring_bills (user_id, next_due_date) where status = 'active';

create table bill_instances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bill_id uuid not null references recurring_bills(id) on delete cascade,
  due_date date not null,
  expected_amount_minor bigint not null,
  actual_amount_minor bigint,
  paid_on date,
  transaction_id uuid references transactions(id) on delete set null,
  is_paid boolean not null default false,
  is_skipped boolean not null default false,
  created_at timestamptz not null default now(),
  unique (bill_id, due_date)
);
create index on bill_instances (user_id, due_date) where is_paid = false;
```

#### subscriptions

Detected, not manually entered. Confirmed by the user.

```sql
create type subscription_state as enum (
  'detected','confirmed','cancelled','ignored'
);

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid references merchants(id),
  name text not null,
  category_id uuid references categories(id),
  state subscription_state not null default 'detected',

  typical_amount_minor bigint not null,
  currency_code char(3) not null,
  frequency bill_frequency not null default 'monthly',

  first_charge_on date,
  last_charge_on date,
  next_expected_on date,
  charge_count int not null default 0,

  detection_confidence numeric(3,2),
  months_since_use int,            -- user-declared usage signal
  annual_cost_minor bigint,        -- computed
  cancelled_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions (user_id, state);
```

#### warranties

```sql
create table warranties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  line_item_id uuid references line_items(id) on delete set null,
  receipt_id uuid references receipts(id) on delete set null,
  product_name text not null,
  merchant_id uuid references merchants(id),
  purchase_date date not null,
  amount_minor bigint,
  return_window_days int,
  return_deadline date,
  warranty_months int,
  warranty_expires_on date,
  serial_number text,
  notes text,
  is_dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on warranties (user_id, return_deadline) where is_dismissed = false;
create index on warranties (user_id, warranty_expires_on) where is_dismissed = false;
```

#### currencies & fx_rates

```sql
create table currencies (
  code char(3) primary key,
  name text not null,
  symbol text not null,
  minor_unit smallint not null default 2
);

create table fx_rates (
  id uuid primary key default gen_random_uuid(),
  base_code char(3) not null,
  quote_code char(3) not null,
  rate numeric(18,8) not null,
  rate_date date not null,
  source text not null default 'exchangerate-api',
  created_at timestamptz not null default now(),
  unique (base_code, quote_code, rate_date)
);
create index on fx_rates (base_code, quote_code, rate_date desc);
```

Historical rates are stored, and every transaction pins the rate used. A transaction's base-currency value never silently changes because today's rate moved.

#### rules

The categorisation rules engine, user-editable.

```sql
create type rule_field as enum (
  'merchant_name','item_text','amount','payment_method','account','notes'
);
create type rule_operator as enum (
  'contains','equals','starts_with','ends_with','regex','gt','lt','between'
);

create table rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  priority int not null default 100,
  is_active boolean not null default true,
  applies_to category_layer not null default 'transaction',
  conditions jsonb not null,       -- [{field, operator, value}]
  match_all boolean not null default true,
  set_category_id uuid references categories(id),
  set_merchant_id uuid references merchants(id),
  set_is_essential boolean,
  add_tags text[],
  hit_count int not null default 0,
  last_hit_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on rules (user_id, priority) where is_active = true;
```

#### insights

```sql
create type insight_kind as enum (
  'category_drift','subscription_detected','unused_subscription','bill_creep',
  'price_increase','cheaper_elsewhere','anomaly','goal_at_risk','goal_ahead',
  'budget_overrun','savings_opportunity','warranty_expiring','return_window',
  'basket_inflation','duplicate_subscription'
);
create type insight_severity as enum ('info','suggestion','warning');

create table insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind insight_kind not null,
  severity insight_severity not null default 'info',
  title text not null,
  body text not null,
  potential_saving_minor bigint,
  currency_code char(3),
  entity_type text,                -- 'category','merchant','product','goal'...
  entity_id uuid,
  payload jsonb,                   -- chart data, comparison figures
  period_start date,
  period_end date,
  score numeric(5,2) not null default 0,  -- ranking
  is_read boolean not null default false,
  is_dismissed boolean not null default false,
  acted_on_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index on insights (user_id, is_dismissed, score desc);
create unique index on insights (user_id, kind, entity_id, period_start)
  where is_dismissed = false;
```

The unique index prevents the same insight being generated repeatedly for the same period.

#### Aggregate tables

Reports must be fast on years of data. Pre-aggregate.

```sql
create table monthly_category_totals (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  category_id uuid not null references categories(id) on delete cascade,
  layer category_layer not null,
  total_minor bigint not null default 0,
  txn_count int not null default 0,
  currency_code char(3) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start, category_id, layer)
);

create table monthly_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  income_minor bigint not null default 0,
  expense_minor bigint not null default 0,
  allocated_minor bigint not null default 0,
  net_minor bigint not null default 0,
  essential_minor bigint not null default 0,
  discretionary_minor bigint not null default 0,
  txn_count int not null default 0,
  currency_code char(3) not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);
```

Maintained by triggers on `transaction_splits` for freshness, with a nightly Edge Function full-rebuild as a safety net against drift.

#### sync_queue (client-side only)

Not in Postgres — lives in WatermelonDB / IndexedDB.

```
sync_queue: id, entity_type, entity_id, operation, payload,
            attempts, last_error, created_at
```

### 3.4 Row Level Security

Every table follows the same pattern:

```sql
alter table transactions enable row level security;

create policy "own rows" on transactions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

System-seeded rows in `categories` and `merchants` (where `user_id is null`) get an additional read-only policy:

```sql
create policy "read system rows" on categories
  for select using (user_id is null or user_id = auth.uid());
```

### 3.5 Storage buckets

| Bucket | Public | Contents | Path pattern |
|---|---|---|---|
| `receipts` | No | Original captures | `{user_id}/{yyyy}/{mm}/{receipt_id}.{ext}` |
| `thumbnails` | No | 400px previews | `{user_id}/{receipt_id}_thumb.webp` |
| `exports` | No | Generated CSV/PDF | `{user_id}/exports/{export_id}.{ext}` |
| `avatars` | Yes | Profile images | `{user_id}.{ext}` |

Storage RLS restricts every object to `(storage.foldername(name))[1] = auth.uid()::text`. Access is always via short-lived signed URLs.

---

## 4. Features

---

### F1 — Onboarding & Salary Setup

**What it does.** First run collects the minimum needed to make the app useful: base currency, pay-cycle start day, monthly net pay, and a first pass at allocation buckets. Under two minutes.

**How it works.** A five-step flow:

1. **Currency & region** — base currency, locale, timezone. Defaults inferred from device.
2. **Pay** — net monthly amount, pay frequency, pay day. Gross and deductions optional; if entered, they're stored in `income_entries.deductions` for later reporting.
3. **Fixed commitments** — rent, mobile, wifi, water, and similar. Each becomes a `recurring_bills` row. A quick-add grid of common bill types speeds this up.
4. **Allocation** — the app proposes a 50/30/20 split, showing needs (from step 3), wants (the remainder), and savings. The user drags to adjust, or switches to explicit amounts. Investment is offered as a bucket here, framed as "money you set aside to invest," with no product involvement.
5. **First capture** — camera opens, user scans one receipt, sees it parsed. This step matters disproportionately; it's the moment the product's value becomes concrete.

Onboarding is resumable. `profiles.onboarding_completed` gates the main app; partial progress lives in local storage keyed by step.

**Data.** `profiles`, `income_sources`, `income_entries`, `accounts` (creates a default Cash and Bank account), `recurring_bills`, `allocation_buckets`, `budget_periods` for the current month.

**Files.**
- `apps/mobile/src/screens/Onboarding/` — five step components plus a controller
- `apps/web/src/routes/onboarding/`
- `packages/core/src/budget/allocation.ts` — the 50/30/20 proposal
- `supabase/migrations/0002_profiles.sql`, `0011_income.sql`, `0012_buckets.sql`

**Acceptance criteria.**
- A new user reaches the dashboard with a funded budget in under two minutes
- Closing the app mid-onboarding resumes at the same step
- Skipping steps 3–5 still produces a valid budget from pay alone
- The 50/30/20 proposal never allocates more than net income

---

### F2 — Receipt & Bill Capture

**What it does.** The user gets a receipt into the app from any of five paths: live camera, photo library, PDF file, screenshot, or manual entry with no image at all.

**How it works.**

*Camera (mobile).* Full-screen camera with live document-edge detection. The frame highlights when a rectangle is found. Auto-capture fires when the rectangle is stable for 800ms, or the user taps. Multi-page mode lets long receipts be captured in overlapping segments that are stitched.

*Post-capture pre-processing*, on-device, before anything else:
1. Perspective correction from the four detected corners
2. Deskew via dominant-text-angle estimation
3. Greyscale conversion
4. CLAHE contrast enhancement — this is what rescues faded thermal paper
5. Adaptive thresholding (Sauvola) for binarisation
6. Upscale to a minimum 300 DPI equivalent if the source is small

*Gallery import.* Multi-select, each image queued independently.

*PDF.* Text-layer PDFs (most e-bills) are read directly — no OCR needed, and accuracy is perfect. Scanned PDFs are rasterised at 300 DPI per page and sent through the image path. Desktop supports dragging a whole folder in.

*Screenshot.* Detected by aspect ratio and absent EXIF camera data. Screenshots skip perspective correction and thresholding — they're already clean, and binarising them destroys anti-aliased text.

*Deduplication.* SHA-256 of file bytes catches exact duplicates. A perceptual hash catches re-photographs of the same receipt. Both are checked before upload; a duplicate surfaces the existing receipt instead of creating a new one.

*Upload.* Original goes to the `receipts` bucket. A 400px WebP thumbnail is generated on-device and uploaded to `thumbnails`. On a metered or offline connection, the file stays local and the sync queue uploads it later — OCR still runs immediately, so the user is never blocked.

**Data.** `receipts` (all fields), Storage buckets `receipts` and `thumbnails`.

**Files.**
- `apps/mobile/src/screens/Capture/` — `CameraScreen.tsx`, `EdgeOverlay.tsx`, `MultiPageStrip.tsx`
- `packages/ocr/src/preprocess.ts` — the six-step pipeline
- `packages/core/src/sync/hash.ts` — content and perceptual hashing
- `apps/desktop/electron/ipc/fileImport.ts` — folder import
- `apps/desktop/electron/ipc/pdfExtract.ts` — PDF text layer extraction

**Acceptance criteria.**
- Camera to captured image in under 3 seconds
- Edge detection succeeds on a receipt against a contrasting surface in normal indoor light
- A text-layer PDF bill is read without OCR
- Uploading the same file twice surfaces the original, doesn't duplicate
- Capture works fully offline; upload resumes on reconnect
- A 10-page folder import on desktop processes without blocking the UI

---

### F3 — On-Device OCR

**What it does.** Converts the pre-processed image into text with position data, entirely on the device. No image ever needs to leave the phone for OCR.

**How it works.** A single interface, three implementations:

```ts
interface OcrResult {
  engine: 'apple_vision' | 'mlkit' | 'tesseract';
  fullText: string;
  blocks: TextBlock[];
  processingMs: number;
  imageWidth: number;
  imageHeight: number;
}

interface TextBlock {
  text: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number }; // normalised 0–1
  lineIndex: number;
}
```

*iOS* — Apple Vision `VNRecognizeTextRequest` with `.accurate` level, language correction off. Language correction is deliberately disabled: it "helpfully" turns product codes and abbreviations into English words, which is actively harmful on receipts. Typical 200–500ms.

*Android* — ML Kit Text Recognition v2, bundled model so it works offline from first launch. Devanagari and Latin script models included; others downloadable.

*Web & Desktop* — Tesseract.js in a Web Worker, `eng` plus the user's language. Slower — 2–5 seconds — but desktop imports are batch operations where that's tolerable. A progress bar reports per-page status.

Both native engines are wrapped as Expo modules under `apps/mobile/modules/`, so the JS side calls one function regardless of platform.

*Failure handling.* If OCR yields fewer than 5 text blocks or mean confidence is below 0.3, the receipt is marked `ocr_failed` and the user is shown a recapture prompt with specific advice — flatten the receipt, improve lighting, avoid glare.

**Data.** `receipts.ocr_engine`, `ocr_raw` (full JSON), `ocr_text`, `ocr_completed_at`, `status`.

**Files.**
- `packages/ocr/src/index.ts` — platform dispatch
- `packages/ocr/src/adapters/vision.native.ts`
- `packages/ocr/src/adapters/mlkit.native.ts`
- `packages/ocr/src/adapters/tesseract.web.ts`
- `apps/mobile/modules/expo-vision-ocr/` — Swift native module
- `apps/mobile/modules/expo-mlkit-ocr/` — Kotlin native module

**Acceptance criteria.**
- OCR completes in under 1 second on mid-range hardware for a standard receipt
- Runs with the device in airplane mode
- Bounding boxes are normalised identically across all three engines
- Raw output is persisted so receipts can be re-parsed later without rescanning
- Low-quality captures produce an actionable recapture prompt, not a silent failure

---

### F4 — Receipt Parser

**What it does.** Turns unstructured OCR text into a structured receipt: merchant, date, line items with quantities and prices, tax, discounts, total. This is the most technically demanding component in the product, and since OCR is on-device only, it is entirely our code.

**How it works.** Seven stages, each producing a confidence score.

**Stage 1 — Normalise.** Collapse whitespace, strip decorative characters, and correct systematic OCR confusions in numeric contexts only: `O→0`, `l/I→1`, `S→5`, `B→8`, `Z→2`. Context matters — applying these to product names would be destructive.

**Stage 2 — Reconstruct layout.** OCR returns blocks; receipts are lines. Group blocks into lines by vertical overlap of their bounding boxes, then sort each line left-to-right. Detect column structure by clustering the x-coordinates of numeric tokens: receipts nearly always right-align prices, and finding that column is what makes line-item extraction tractable.

**Stage 3 — Segment.** Classify each line into a zone:
- *Header* — merchant name, address, phone, tax ID (first ~20% of lines)
- *Body* — line items (between header and the first total-like line)
- *Totals* — subtotal, tax, discount, total, tender
- *Footer* — thank-you text, return policy, barcodes

Zone boundaries are found by anchor keywords (`SUBTOTAL`, `TOTAL`, `GST`, `VAT`, `CASH`, `CHANGE`, `BALANCE DUE`) in multiple languages, plus positional priors.

**Stage 4 — Merchant identification.** Take the first 3–5 header lines. Score each against known `merchant_aliases` using trigram similarity. Above 0.75 similarity, match. Below, treat the longest all-caps or largest-font line as a new merchant name and create a merchant record on confirmation. A per-merchant template in `packages/core/src/parser/templates/` can override generic heuristics once a merchant is seen a few times — this is how accuracy improves for the handful of shops any given user visits weekly.

**Stage 5 — Date extraction.** Scan for date patterns across formats: `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `DD-MMM-YY`, `DD.MM.YYYY`. Ambiguous `03/04/2026` is resolved by the user's locale, then sanity-checked: a date in the future or more than 3 years past is rejected in favour of the next candidate. Time is captured when present. If no date is found, fall back to the image EXIF timestamp, then to capture time — and lower confidence accordingly.

**Stage 6 — Line-item extraction.** The core algorithm:

For each line in the body zone:
1. Find the rightmost numeric token matching a currency-amount pattern → candidate price
2. Text left of the price → candidate description
3. Look for a quantity pattern within the description: leading `2 x`, trailing `x2`, or a weight expression `0.850 kg`, `500g`, `1.5L`
4. If a unit price is also present (common in the pattern `2 x 45.00  90.00`), validate `qty × unit_price ≈ amount`
5. Reject lines where the description is empty, purely numeric, or matches a known noise pattern (barcodes, transaction IDs, loyalty numbers)
6. Handle continuation lines — long product names wrap, and a line with a description but no price followed by a line with a price and no description is a single item

Multi-buy discounts (`BUY 2 GET 1`, `MULTIBUY SAVING -30.00`) attach to the preceding item as `discount_minor`.

**Stage 7 — Totals and reconciliation.** Extract subtotal, tax lines (GST/CGST/SGST/VAT/sales tax, possibly multiple rates), discounts, and the grand total. Then reconcile:

```
sum(line_items) - discounts + tax  ≈  total   (tolerance: 1 minor unit per item)
```

If it reconciles, confidence is high and the receipt can auto-confirm. If not, the parser identifies the most likely culprit — a missed item, a misread digit — and flags exactly those lines for review rather than dumping the whole receipt on the user.

**Confidence model.** Per-field confidence combines OCR block confidence, pattern-match strength, and reconciliation result. Overall confidence is the weighted minimum, weighted toward total and date since those matter most. Receipts scoring above `profiles.ocr_review_threshold` (default 0.80) go straight to `parsed`; below, to `needs_review`.

**Versioning.** `receipts.parser_version` records which parser produced the output. When the parser improves, a background job can re-run parsing on low-confidence historical receipts and offer improved results without touching user-corrected data.

**Data.** `receipts.parsed` (JSONB), `parse_confidence`, `parser_version`, `status`.

**Files.** All of `packages/core/src/parser/` — see structure in §2.3.

**Acceptance criteria.**
- Merchant, date, and total extracted correctly from ≥90% of clean supermarket receipts
- Line items extracted at ≥80% precision and recall on clean receipts
- Reconciliation correctly flags receipts where items don't sum to the total
- Parser runs in under 200ms on-device for a 30-item receipt
- Zero crashes on malformed input; always returns a partial result
- Re-parsing never overwrites a user-corrected field

---

### F5 — Review & Correction

**What it does.** Shows the parsed receipt beside the image, lets the user fix anything wrong in seconds, and learns from every correction.

**How it works.** A split view — image on one side (pinch-zoom, tap-to-highlight), parsed fields on the other. Tapping a field highlights its source region on the image; tapping the image jumps to the corresponding field. That bidirectional link is what makes correction fast instead of tedious.

Fields below confidence threshold are visually marked. The correction path is ordered by impact: total first, then date, then merchant, then individual line items.

Line items are editable inline: description, quantity, unit, price, category. Swipe deletes a spurious line. A plus button adds a missed one. A running "items sum vs stated total" indicator turns green when they reconcile, which gives the user a clear completion signal.

*Learning.* Every correction writes back:
- Merchant corrections create a `merchant_aliases` row mapping the OCR text to the correct merchant
- Category corrections create or strengthen a `rules` row
- Item description corrections create `product_aliases` entries
- Repeated corrections of the same pattern prompt: "Always categorise items containing 'AMUL' as Dairy & Eggs?"

Correction time drops sharply after the first few visits to a given shop. That trajectory should be visible to the user — a small "getting smarter" signal builds patience through the rough early weeks.

*Bulk review.* Desktop and web offer a queue view: all `needs_review` receipts in a list, keyboard-navigable, so a backlog can be cleared efficiently.

**Data.** `receipts.status` → `confirmed`; creates `transactions`, `transaction_splits`, `line_items`; updates `merchant_aliases`, `product_aliases`, `rules`; sets `line_items.is_user_corrected`.

**Files.**
- `apps/mobile/src/screens/Review/ReviewScreen.tsx`, `ImagePane.tsx`, `FieldList.tsx`, `LineItemEditor.tsx`
- `apps/web/src/routes/receipts/review/`
- `packages/core/src/categorization/learning.ts`

**Acceptance criteria.**
- A well-parsed receipt is confirmed in a single tap
- A receipt with three errors is corrected in under 30 seconds
- Tapping a field highlights the correct image region
- Corrections measurably improve parsing of the next receipt from the same merchant
- Reconciliation indicator updates live as items are edited

---

### F6 — Categorisation Engine

**What it does.** Assigns categories at two levels — the whole transaction, and each line item — with confidence scores and a learning loop.

**How it works.** A cascade, highest-precedence first:

1. **User rules** (`rules` table, by priority) — explicit and always win
2. **Merchant default** — `merchants.default_category_id` for the transaction layer
3. **Product memory** — if this exact product was categorised before, reuse it
4. **Keyword matching** — a seeded dictionary mapping tokens to product categories, with locale-aware term lists (`ATTA`, `DAL`, `PANEER`, `GHEE` for India; different sets elsewhere)
5. **Fuzzy product match** — trigram-match against the user's existing products above 0.8 similarity
6. **Fallback** — `Miscellaneous` at low confidence

Each stage emits a confidence. Above 0.85, apply silently. Between 0.5 and 0.85, apply but mark for optional review. Below 0.5, mark `needs_review`.

*Grocery splitting.* When a receipt from a merchant flagged `is_grocery` is confirmed, the transaction gets one split per distinct product category present, each summing its line items. So a ₹3,400 supermarket trip becomes six splits — produce ₹640, dairy ₹380, snacks ₹520, and so on — and every report reflects that granularity.

*Rules builder.* Users create rules from a form or, more usefully, straight from a transaction: "Always categorise like this" opens a pre-filled rule. Rules support conditions on merchant name, item text, amount ranges, and payment method, combined with AND/OR.

*Bulk recategorisation.* Select many transactions or items, apply a category, optionally generate a rule from the selection.

**Data.** `categories`, `rules`, `merchants`, `products`, `transaction_splits.category_id`, `line_items.category_id`, `category_confidence`.

**Files.** All of `packages/core/src/categorization/`.

**Acceptance criteria.**
- ≥85% of line items correctly categorised after 50 receipts of learning
- User rules always take precedence over inference
- A grocery receipt produces splits matching its product categories
- Creating a rule from a transaction offers to apply it retroactively
- Bulk recategorisation of 100 items completes in under 2 seconds

---

### F7 — Transactions

**What it does.** The complete ledger — everything the app knows about money moving, browsable, searchable, editable.

**How it works.** An infinite list grouped by date, showing merchant, category, amount, and a receipt-thumbnail indicator. Filters: date range, category, merchant, account, amount range, has-receipt, reviewed state, tags. Full-text search across description, merchant, notes, and item text — so searching "paneer" finds every receipt containing it.

*Detail view.* Full transaction with all splits and line items, the linked receipt image, notes, tags, and an edit history.

*Manual entry.* A fast-add sheet: amount, category, date, optional merchant and note. Recent categories surface first. This path matters — cash purchases and receipts the user didn't keep still need to be recorded, and if manual entry is slow the ledger becomes incomplete and every downstream number is wrong.

*Splits.* Any transaction can be split across categories manually — a ₹5,000 department store trip divided into clothing and home goods.

*Transfers.* Moving money between accounts creates a transfer-type transaction with a `transfer_account_id`. Transfers are excluded from all expense and income reporting. This is what stops "moved ₹20,000 to savings" from appearing as spending.

*Refunds.* A refund links to the original via `refund_of_id` and creates negative splits against the same categories, so a refunded purchase nets to zero in reports rather than appearing as income.

*Reimbursables.* Flagged transactions are tracked separately and can be marked reimbursed, with a running total of outstanding amounts.

**Data.** `transactions`, `transaction_splits`, `line_items`, `accounts`, `merchants`.

**Files.**
- `apps/*/routes|screens/Transactions/` — list, detail, edit, quick-add
- `packages/core/src/db/queries/transactions.ts`

**Acceptance criteria.**
- List scrolls smoothly at 10,000+ transactions
- Search returns results in under 300ms
- Manual entry completes in under 10 seconds
- Transfers never appear in expense reports
- A refund correctly nets against the original transaction's categories
- Split amounts must equal the transaction total; the UI prevents saving otherwise

---

### F8 — Recurring Bills

**What it does.** Tracks fixed and variable recurring obligations — rent, mobile, water, wifi, electricity, petrol allowance, insurance premiums — with due dates, reminders, and payment matching.

**How it works.** A bill defines a schedule and an expected amount. The system generates `bill_instances` for the next 12 months on a rolling basis.

*Reminders.* A daily Edge Function finds instances due within `reminder_days_before` and sends a push notification. Overdue unpaid instances escalate.

*Payment matching.* When a receipt or manual transaction is confirmed, the system looks for an unpaid bill instance matching on merchant or category, amount within tolerance, and date within a window. A match prompts: "Mark September electricity bill as paid?" One tap links them.

*Variable bills.* Utilities vary month to month. `amount_varies` bills track actual amounts and show a trend chart. When an actual comes in significantly above the trailing average, it feeds the bill-creep detector (F13).

*Calendar view.* A month grid showing due dates and amounts, with a running projection of cash needed for the rest of the month.

*Bill from receipt.* Scanning a utility bill PDF offers to create a recurring bill from it, pre-filled — merchant, amount, due date, and account number if detected.

**Data.** `recurring_bills`, `bill_instances`, links to `transactions`.

**Files.**
- `apps/*/routes|screens/Bills/` — list, calendar, editor
- `packages/core/src/db/queries/bills.ts`
- `supabase/functions/bill-reminders/index.ts`

**Acceptance criteria.**
- Reminders fire the configured number of days before the due date
- A payment transaction correctly matches its bill instance
- Variable bill amounts are tracked with a visible trend
- The calendar shows a correct month-ahead cash requirement
- Skipping an instance doesn't break the schedule

---

### F9 — Salary, Allocation Buckets & Safe-to-Spend

**What it does.** This is the feature the user described as "investment": pay comes in, defined amounts are removed for savings, investment, emergency fund, and debt, fixed bills are reserved, and the remainder is what's genuinely available to spend.

**How it works.**

*Income.* One or more `income_sources` with net amount, frequency, and pay day. Actual receipts of pay are recorded as `income_entries`, so planned and actual can diverge and be reconciled — important for variable or freelance income.

*Buckets.* Each `allocation_bucket` has a mode:
- **Fixed** — ₹15,000 to investment every month
- **Percent of income** — 20% of net pay to savings, which scales automatically with a raise or a variable-income month
- **Remainder** — absorbs whatever is left after everything else, useful for a catch-all savings bucket

Buckets fund in `priority` order. If income falls short, low-priority buckets underfund and the user is told exactly which and by how much, rather than the budget silently breaking.

*The calculation:*

```
net_income
  − Σ(bucket allocations)
  − Σ(unpaid bill instances due this period)
  = discretionary_pool

safe_to_spend        = discretionary_pool − discretionary_spent_so_far
daily_safe_to_spend  = safe_to_spend ÷ days_remaining_in_period
```

`days_remaining` respects `profiles.month_start_day`, so someone paid on the 25th sees a period running the 25th to the 24th.

*Auto-transfers.* A bucket with `auto_create_transfer` generates a transfer transaction on pay day, moving money to the linked account. This keeps the account balances honest without the user doing bookkeeping.

*Dashboard presentation.* A single prominent number — what's safe to spend today — with a secondary monthly figure and a breakdown showing where the rest of the pay went. The daily number is the behaviourally effective one: "₹740 today" changes decisions in a way "₹22,000 this month" does not.

*Multiple income sources* sum. Irregular income uses a trailing three-month average as the planning figure, clearly labelled as an estimate.

**Data.** `income_sources`, `income_entries`, `allocation_buckets`, `bucket_contributions`, `budget_periods`, `transactions` (auto-transfers).

**Files.**
- `packages/core/src/budget/allocation.ts` — bucket funding in priority order
- `packages/core/src/budget/safeToSpend.ts`
- `apps/*/routes|screens/Budget/`
- `apps/*/components/SafeToSpendCard`

**Acceptance criteria.**
- Percent-mode buckets recalculate when income changes
- Insufficient income underfunds by priority and reports which buckets were affected
- Safe-to-spend updates immediately on every new transaction
- Daily figure correctly accounts for a custom pay-cycle start day
- Auto-transfers create correct transfer transactions and don't count as expenses

---

### F10 — Budgets

**What it does.** Per-category spending limits with progress tracking, supporting four methods.

**How it works.**

*Methods:*
- **Simple** — limits on the categories the user cares about; the rest is untracked
- **50/30/20** — categories auto-grouped into needs (`is_essential`), wants, and savings; three top-level limits derived from income
- **Zero-based** — every unit of income assigned to a category or bucket; a prominent "unassigned" figure must reach zero
- **Envelope** — like zero-based, with rollover on by default, so unspent grocery money accumulates

*Period generation.* A new `budget_period` is created at each pay-cycle start, copying the prior period's lines. Rollover-enabled lines carry unspent (or overspent) amounts forward via `rollover_in_minor`.

*Progress.* Each line shows spent, planned, and remaining, with a bar that shifts colour approaching and exceeding the limit. Crucially, it also shows *pace*: 60% spent on day 10 of 30 is a problem worth flagging even though the limit hasn't been breached.

*Overspend handling.* Exceeding a category prompts a choice: accept it, move money from another category (which keeps zero-based budgets balanced), or adjust the limit. Moving money between categories is a first-class action, not a workaround.

*Suggestions.* After three months of history, the app can propose limits based on the user's own trailing median per category — a realistic starting point rather than an aspirational one, since unrealistic budgets are abandoned.

**Data.** `budget_periods`, `budget_lines`, `monthly_category_totals`.

**Files.**
- `packages/core/src/budget/rollover.ts`
- `apps/*/routes|screens/Budget/`

**Acceptance criteria.**
- All four methods produce a coherent budget
- Rollover carries the correct amount into the next period
- Zero-based mode shows an accurate unassigned figure that can reach exactly zero
- Pace indication distinguishes on-track from ahead-of-pace spending
- Moving money between categories preserves the total

---

### F11 — Savings Goals

**What it does.** Named targets with amounts and dates, showing required contributions and projected completion.

**How it works.**

*Creation.* Name, target amount, optional target date, optional linked account. If a date is given, required monthly contribution is `(target − current) ÷ months_remaining`. If a monthly contribution is given instead, the projected completion date is computed. Both directions work, and changing one updates the other live.

*Funding.* Three paths: link an `allocation_bucket` so a slice of every pay flows in automatically; make manual contributions; or route a specific transaction to the goal.

*Progress.* A ring or bar with amount saved, remaining, and projected date. When the projection slips past the target, the goal is flagged at risk and the trade-off engine (F14) computes what spending change would recover it.

*Prioritisation.* Goals have a priority order. When available money is insufficient for all of them, higher-priority goals fund first and the user sees the impact on the rest.

*Achievement.* Reaching the target marks the goal achieved, celebrates it, and offers to redirect its bucket contribution to the next goal — the moment where a good app converts one success into the next habit.

**Data.** `goals`, `goal_contributions`, `allocation_buckets.linked_goal_id`.

**Files.**
- `packages/core/src/goals/projection.ts`
- `packages/core/src/goals/contribution.ts`
- `apps/*/routes|screens/Goals/`

**Acceptance criteria.**
- Required monthly contribution is correct for any target date
- Projected date updates as contributions land
- A goal falling behind is flagged with a concrete recovery suggestion
- Linked buckets contribute automatically each period
- Achievement offers redirection of the freed contribution

---

### F12 — Reports & Analytics

**What it does.** Answers "where did my money go" at every timescale the user asked for: by month, month-to-year, and year-over-year.

**How it works.**

*Report types:*

**Monthly summary** — income, expenses, allocated to buckets, net. Category breakdown as a ranked bar list (not a pie chart — pies are unreadable past six slices). Comparison against the prior month and the trailing three-month average.

**Category detail** — drill into any category to see subcategories, then merchants, then individual transactions, then line items. Four levels deep, and the fourth level is what no bank-feed app can offer: not just "Groceries ₹12,400" but "Snacks ₹2,180, up 34%."

**Trend** — line chart of any category over up to 24 months, with a trailing average overlay.

**Year-to-date** — cumulative income, expense, and savings from the start of the year, with a projection to year end based on the current run rate.

**Year-over-year** — this year against last, by month and by category, showing absolute and percentage change. Requires 13+ months of data; before that, the view explains why and shows what's available.

**Cash-flow (Sankey)** — income flowing into buckets and categories. The single most illuminating view for a new user, because it makes proportions immediately obvious in a way tables don't.

**Calendar heatmap** — daily spending intensity across a month or year, exposing weekly patterns and spending spikes.

**Net worth** — sum of account balances over time, split into assets and liabilities.

**Line-item report** — spend by *product* category across all merchants, plus top products by total spend and by frequency. Unique to this app.

*Performance.* All reports read from `monthly_category_totals` and `monthly_summaries`, so they render in constant time regardless of transaction volume. Drill-downs beyond the aggregate level query detail tables with the period already bounded.

*Export.* CSV (transactions, line items, or aggregates), JSON (full data), and PDF (formatted monthly or annual report). Generated by an Edge Function into the `exports` bucket, delivered as a signed URL.

**Data.** `monthly_category_totals`, `monthly_summaries`, with drill-down to `transaction_splits` and `line_items`.

**Files.**
- `packages/core/src/reports/aggregate.ts`, `compare.ts`, `export.ts`
- `apps/*/routes|screens/Reports/`
- `supabase/functions/export-data/index.ts`
- `supabase/migrations/0021_aggregates.sql`

**Acceptance criteria.**
- Any report for any period renders in under 500ms at 5 years of data
- Category drill-down reaches individual line items
- Year-over-year handles partial years without misleading comparisons
- Sankey correctly represents income → buckets → categories with no leakage
- CSV export opens cleanly in Excel and Google Sheets
- All figures respect the custom pay-cycle month

---

### F13 — Insights Engine

**What it does.** Proactively surfaces where money is leaking, comparing the user only against their own history.

**How it works.** Detectors run after each receipt confirmation (locally, for immediacy) and nightly (server-side, for the heavier ones). Each produces zero or more `insights` rows with a severity and a ranking score.

**Detectors:**

*Category drift* — a category's current-month spend exceeds its trailing three-month average by more than 25% and ₹500 (or currency equivalent). Reports the delta and the top contributing merchants or products.

*Subscription detection* — groups transactions by merchant, looks for three or more charges at a consistent interval (±3 days) with amounts within 5%. Above 0.7 confidence, creates a `subscriptions` row in `detected` state and an insight asking the user to confirm.

*Unused subscription* — a confirmed subscription with no related activity, prompting a periodic "still using this?" check. Cancelling shows the annual saving, which is nearly always larger than the user expects.

*Duplicate subscription* — two active subscriptions in the same category (two music services, three cloud storage plans).

*Bill creep* — a recurring bill's actual amount exceeds its trailing average by more than 10% for two consecutive periods. Common with internet, insurance, and mobile plans, where introductory pricing lapses quietly.

*Price increase* — a product's unit price rose more than 10% versus its trailing average across the last five observations. Uses `price_observations`, so it works at the individual product level.

*Cheaper elsewhere* — the same product observed at a materially lower unit price at a different merchant within the last 90 days. Reports the per-unit difference and the annualised saving at the user's purchase frequency.

*Anomaly* — a transaction more than three standard deviations above the category's historical distribution, with a minimum absolute floor to avoid flagging trivial amounts.

*Budget overrun* — a category exceeding its limit, or on pace to.

*Goal at risk* — a goal's projected date falling past its target, paired with a trade-off suggestion.

*Basket inflation* — the user's personal grocery basket cost, holding the basket constant, over time. Their actual lived inflation rate on the things they actually buy.

*Warranty and return windows* — surfaced from F16.

*Ranking.* Insights are scored by potential saving amount, recency, severity, and whether similar insights were dismissed before. Only the top few surface at once — a wall of notifications gets ignored, and dismissing an insight type reduces the score of that type going forward.

*Presentation.* Each insight is one clear sentence, a supporting figure or mini-chart, and one action: adjust a budget, create a rule, view the transactions, dismiss. Framing is neutral and specific — "Dining is ₹2,400 above your usual" — never moralising. Guilt-heavy copy causes app abandonment.

**Data.** `insights`, reading from `monthly_category_totals`, `price_observations`, `subscriptions`, `recurring_bills`, `transactions`.

**Files.**
- `packages/core/src/insights/engine.ts`
- `packages/core/src/insights/detectors/*.ts`
- `supabase/functions/generate-insights/index.ts`
- `apps/*/routes|screens/Insights/`

**Acceptance criteria.**
- Subscription detection identifies real recurring charges at ≥85% precision
- No insight is generated twice for the same entity and period
- Every insight has a concrete, tappable action
- Dismissing a type reduces its future frequency
- Potential savings figures are arithmetically correct and conservatively stated

---

### F14 — Trade-off & Compromise Modelling

**What it does.** Answers the question the user asked directly: where can I save by compromising on something, and what does that compromise actually buy me?

**How it works.**

*Simulation.* The user picks a category and a reduction — 10%, 20%, or a custom amount. The engine computes:
- Monthly and annual saving
- The effect on every active goal's projected completion date
- The effect on safe-to-spend
- What the reduction means concretely, derived from actual history: "20% less dining out ≈ 4 fewer takeaways a month, based on your average order of ₹620"

That last translation is what makes it actionable. "Reduce dining by ₹2,480" is abstract; "four fewer takeaways" is a decision someone can actually make.

*Automatic suggestions.* Ranked by feasibility, not just size. Feasibility is estimated from category volatility (highly variable categories are easier to cut than stable ones), essential-vs-discretionary status, and how far current spending sits above the user's own historical median. Suggesting a rent cut is useless; suggesting a return to last quarter's normal snack spending is not.

*Goal-driven mode.* Working backwards: "To reach this goal by December, you need ₹4,000 more each month." The engine proposes a combination of category reductions summing to that figure, drawn only from discretionary categories, and shows the combined impact.

*Scenario saving.* A user can save a scenario and track adherence against it in following months, converting a hypothetical into a plan.

**Data.** Reads `monthly_category_totals`, `goals`, `allocation_buckets`, `line_items`; writes optional saved scenarios.

**Files.**
- `packages/core/src/insights/tradeoff.ts`
- `apps/*/routes|screens/Insights/TradeoffSimulator`

**Acceptance criteria.**
- Simulated changes produce correct goal-date shifts
- Suggestions never propose cutting categories marked essential
- Concrete translations use the user's real average transaction sizes
- Goal-driven mode produces a combination that actually reaches the target
- Results render instantly, with no server round-trip

---

### F15 — Price & Unit-Price Tracking

**What it does.** Tracks what individual products cost over time and across shops. Only possible because of line-item extraction.

**How it works.**

*Product identity.* Every line item is matched to a product using: exact alias match, then trigram similarity above 0.85, then token-set overlap. Unmatched items create new products. A merge UI lets users combine products the matcher split incorrectly, and merging updates aliases so future receipts match correctly.

*Unit normalisation.* Pack sizes are parsed from descriptions (`1L`, `500g`, `2 x 250ml`, `1kg`) and prices normalised to a common basis — per kg, per litre, or per piece. This is what makes comparison honest: ₹120 for 900ml versus ₹115 for 750ml is not the saving it appears to be.

*Price history.* Each purchase writes a `price_observation`. Per product, the app shows a price chart over time, the lowest and highest observed prices with dates and merchants, the current versus average price, and per-merchant comparison.

*Basket inflation.* Taking the user's most frequently purchased products as a fixed basket, the app computes what that same basket costs each month. Their personal inflation rate — genuinely more meaningful to them than a national index, because it's their actual basket.

*Shopping list intelligence* (natural extension). Building a list from frequently bought products shows the estimated total based on recent prices and flags where each item has historically been cheapest.

**Data.** `products`, `product_aliases`, `price_observations`, `line_items.normalized_*`.

**Files.**
- `packages/core/src/pricing/unitPrice.ts`
- `packages/core/src/pricing/productIdentity.ts`
- `packages/core/src/pricing/basketIndex.ts`
- `apps/*/routes|screens/Prices/`

**Acceptance criteria.**
- The same product across different receipts matches to one product record ≥85% of the time
- Pack sizes parse correctly for common formats
- Unit prices are comparable across differing pack sizes
- Price history charts correctly per product
- Basket inflation is computed on a genuinely fixed basket

---

### F16 — Warranty & Return-Window Tracking

**What it does.** Turns receipts into a warranty and returns database automatically, so the receipt is findable at the moment it's actually needed.

**How it works.**

*Detection.* On confirming a receipt, candidates for warranty tracking are identified by: line items above a value threshold (default ₹2,000), product categories associated with durables (electronics, appliances, furniture, tools), and explicit warranty text in the receipt footer ("1 year warranty", "30 day returns").

*Term extraction.* Return-policy and warranty text is parsed for durations. Where no explicit term is found, a merchant-level default applies if known, or the user is prompted once — and that answer becomes the merchant default.

*Tracking.* Each warranty stores the purchase date, computed return deadline, and warranty expiry, linked to the receipt image. Notifications fire three days before a return window closes and one month before a warranty expires.

*Retrieval.* A searchable list of everything under warranty, with the receipt image one tap away. This is the feature users don't ask for and then rely on heavily — the receipt for a failed appliance is exactly the document that's never findable when needed.

**Data.** `warranties`, linking `transactions`, `line_items`, `receipts`.

**Files.**
- `packages/core/src/warranty/detect.ts`
- `apps/*/routes|screens/Warranties/`
- Reminder generation in `supabase/functions/bill-reminders/`

**Acceptance criteria.**
- Purchases above the threshold are offered for warranty tracking
- Explicit warranty and return terms are extracted when present
- Reminders fire before deadlines
- The original receipt image is retrievable from any warranty record
- The threshold is user-configurable

---

### F17 — Subscription Management

**What it does.** Finds recurring charges automatically, shows their true annual cost, and helps the user decide what to keep.

**How it works.** Detection is described in F13. Once confirmed, a subscription shows:

- Monthly and annualised cost — annual is the number that changes minds; ₹199/month reads as trivial, ₹2,388/year does not
- Total paid since first detected
- Charge history with any price changes highlighted
- Next expected charge date

*The dashboard* lists all subscriptions ranked by annual cost, with a total. Grouped by category so duplicates are obvious.

*Usage prompts.* Periodically asks whether each subscription is still being used. A "no" surfaces the annual saving from cancelling and offers a cancellation checklist, plus a reminder to confirm the cancellation actually went through — subscriptions frequently survive a cancellation attempt.

*Price-change alerts.* A subscription charging more than previously triggers an insight, because these increases are usually silent.

**Data.** `subscriptions`, derived from `transactions`.

**Files.**
- `packages/core/src/insights/detectors/subscription.ts`
- `packages/core/src/insights/detectors/unusedSubscription.ts`
- `apps/*/routes|screens/Subscriptions/`

**Acceptance criteria.**
- Detection needs no manual entry
- Annual cost is displayed at least as prominently as monthly
- Duplicates within a category are flagged
- Cancellation is followed up for confirmation
- Confirmed subscriptions link to their originating transactions

---

### F18 — Multi-Currency

**What it does.** Handles spending in more than one currency correctly, for travel or for income and expenses in different currencies.

**How it works.**

*Detection.* The parser identifies currency from symbols (₹, $, €, £, ¥), ISO codes in the text, and merchant country hints. Ambiguous symbols ($ could be USD, CAD, AUD, SGD) are resolved by the user's recent travel pattern or an explicit prompt.

*Storage.* Every monetary row stores the original amount and currency plus a base-currency conversion and the exact rate used. The rate is pinned at transaction time, so historical figures never shift.

*Rates.* A daily Edge Function fetches rates into `fx_rates`. Offline transactions use the most recent cached rate and are flagged for optional revaluation once a same-day rate is available.

*Reporting.* All reports are in base currency by default, with a per-currency toggle. Accounts in foreign currencies show both their native balance and base equivalent.

*Travel mode.* Detecting sustained spending in a foreign currency offers a travel period, which groups those transactions, provides a trip total, and can hold them outside normal monthly budget comparisons so a two-week holiday doesn't make every category look broken.

**Data.** `currencies`, `fx_rates`, `currency_code` and `fx_rate` fields throughout.

**Files.**
- `packages/core/src/currency/convert.ts`, `rates.ts`
- `supabase/functions/fx-rates/index.ts`
- `supabase/migrations/0018_currencies.sql`

**Acceptance criteria.**
- Currency is detected correctly from receipts where a symbol or code is present
- Historical base amounts never change after the fact
- Reports total correctly across mixed-currency transactions
- Offline transactions convert with a cached rate and are flagged
- Travel grouping works without distorting regular budgets

---

### F19 — Offline & Sync

**What it does.** The app is fully usable with no connection. Capture, OCR, parsing, categorisation, and all reporting work offline; changes sync when connectivity returns.

**How it works.**

*Local-first.* Mobile uses WatermelonDB; web and desktop use IndexedDB via Dexie. All reads hit local storage. All writes go to local storage and enqueue a sync operation.

*Sync queue.* Each mutation is queued with entity type, ID, operation, and payload. On reconnection the queue drains in order, with exponential backoff on failure and a cap on retries before surfacing an error to the user.

*Conflict resolution.* Last-write-wins by `updated_at` for most fields, with two exceptions that matter: user-corrected fields (`is_user_corrected`) always beat automated values regardless of timestamp, and deletions beat updates. Genuine conflicts on the same field are rare in a single-user app but are logged and surfaced rather than silently resolved.

*Image upload.* Receipt images are the heaviest payload. They upload separately from metadata, on WiFi by default, with the transaction fully usable before its image finishes uploading.

*Realtime.* Supabase Realtime subscriptions keep multiple devices in step. A receipt scanned on the phone appears on the desktop within seconds.

*Status.* A persistent, unobtrusive indicator shows pending item count and last sync time. Failures are actionable, never silent.

**Data.** Local `sync_queue`; all Supabase tables.

**Files.**
- `packages/core/src/sync/queue.ts`, `conflict.ts`
- `apps/mobile/src/db/` — WatermelonDB schema and models
- `apps/web/src/lib/localDb.ts`

**Acceptance criteria.**
- Full capture-to-categorised-transaction works in airplane mode
- Queued changes sync correctly on reconnection
- User corrections survive conflict resolution
- No duplicate records result from interrupted syncs
- Sync state is always visible and never silently stuck

---

### F20 — Security & Privacy

**What it does.** Protects financial data, and keeps the privacy promise that on-device OCR makes possible.

**How it works.**

*Authentication.* Supabase Auth with email/password and OAuth. Sessions refresh via secure token storage — Keychain on iOS, EncryptedSharedPreferences on Android, safeStorage on Electron.

*App lock.* Optional biometric or PIN lock on launch and on resume after a configurable timeout. Screenshots blurred in the app switcher.

*Data isolation.* Row Level Security on every table. Storage policies scope every object to its owner's folder. There is no code path by which one user's query returns another's data.

*Encryption.* TLS in transit. Postgres encryption at rest. Storage objects encrypted server-side. Local databases encrypted with a device-keystore-held key.

*Privacy posture.* OCR never leaves the device, which means receipt images need never be processed by a third party. Images upload to the user's own storage bucket purely for backup and cross-device access, and can be disabled entirely — in local-only mode, images stay on the device and only extracted data syncs.

*User rights.* Full data export in JSON and CSV. Account deletion removes all rows and storage objects within 30 days, with the option of immediate hard deletion. No analytics on financial content; product analytics, if any, are opt-in and never include amounts, merchants, or item text.

*No data monetisation.* Spending data is never sold, shared, or used for advertising. This is stated plainly in the app, not buried in a policy document.

**Data.** All tables, via RLS; `profiles` for security preferences.

**Files.**
- `supabase/migrations/0022_rls_policies.sql`
- `packages/core/src/db/client.ts`
- `apps/mobile/src/lib/appLock.ts`
- `apps/desktop/electron/main.ts` — safeStorage integration

**Acceptance criteria.**
- RLS verified by attempting cross-user access on every table
- App lock engages on resume after the configured timeout
- Local-only mode keeps images off the server entirely
- Export produces complete, re-importable data
- Deletion removes all rows and storage objects

---

### F21 — Dashboard

**What it does.** The home screen. Answers "am I okay?" in under three seconds.

**How it works.** Ordered by what actually drives decisions:

1. **Safe to spend today** — one large number, with the monthly figure secondary
2. **This month at a glance** — income, spent, saved, as a compact bar
3. **Top insight** — the single highest-scoring unread insight, with its action
4. **Upcoming bills** — the next three due, with dates and amounts
5. **Goals** — progress rings for active goals
6. **Recent transactions** — the last five, with a shortcut to review anything pending
7. **Category pace** — the three categories furthest ahead of pace

A persistent capture button is the most prominent interactive element on every screen. Everything else is secondary to getting receipts in.

*Pending review badge.* Receipts needing attention are surfaced but not nagged about — a count, not a modal.

**Data.** Reads `monthly_summaries`, `insights`, `bill_instances`, `goals`, `transactions`, `budget_lines`.

**Files.**
- `apps/*/routes|screens/Dashboard/`
- `apps/*/components/` — the individual cards

**Acceptance criteria.**
- Loads in under 1 second from local data
- Safe-to-spend is correct and immediately reflects new transactions
- Capture is reachable in one tap from anywhere
- Cards can be reordered or hidden
- Degrades gracefully in the first month when history is thin

---

## 5. Cross-Cutting Concerns

### 5.1 Performance targets

| Operation | Target |
|---|---|
| App cold start to dashboard | < 2s |
| Camera ready | < 1s |
| OCR (native) | < 1s |
| Parse | < 200ms |
| Transaction list scroll | 60fps at 10k rows |
| Report render | < 500ms at 5y data |
| Search | < 300ms |
| Sync of 100 queued items | < 10s |

### 5.2 Accessibility

Screen-reader labels on every interactive element and on chart data. Dynamic type support up to the largest accessibility sizes. Minimum 4.5:1 contrast. Full keyboard navigation on web and desktop. Colour never the sole carrier of meaning — over-budget is indicated by an icon and text, not just red. Haptic confirmation on capture.

### 5.3 Error handling

Every failure mode gets a specific, actionable message. "OCR found no text — try flattening the receipt and avoiding shadows" rather than "Processing failed." Errors are logged locally with a user-initiated report option that includes no financial content.

### 5.4 Localisation

Strings externalised from day one, even if only English ships in v1. Currency, date, and number formatting driven by `profiles.locale`. Category names and keyword dictionaries are locale-specific — the seeded grocery keyword list for India is materially different from the one for the US.

### 5.5 Testing

- **Unit** — parser, categorisation, budget maths, and currency conversion carry the highest coverage requirements; these are where silent errors do real damage
- **Parser corpus** — a fixture set of real receipt OCR outputs with hand-verified expected results, run on every parser change. This is the single most valuable test asset in the project
- **Integration** — Supabase queries against a local instance, including RLS verification
- **E2E** — Detox on mobile, Playwright on web, covering capture → review → confirm → report
- **Manual** — a monthly pass on real receipts from real shops, since synthetic receipts don't reproduce the failure modes that matter

---

## 6. Build Sequence

**Phase 1 — Foundation.** Monorepo, Supabase project, schema and RLS, auth, shared packages, basic navigation on all three clients.

**Phase 2 — Capture and OCR.** Camera, pre-processing, native OCR modules, Tesseract for web, receipt storage.

**Phase 3 — Parser.** The seven-stage pipeline, confidence model, test corpus. Expect this phase to take longer than estimated; it is the hardest part.

**Phase 4 — Review and correction.** Split view, inline editing, learning feedback loop.

**Phase 5 — Ledger.** Transactions, splits, line items, manual entry, categorisation engine, rules.

**Phase 6 — Money planning.** Income, buckets, safe-to-spend, budgets, goals.

**Phase 7 — Bills.** Recurring bills, instances, reminders, payment matching.

**Phase 8 — Reports.** Aggregates, all report types, export.

**Phase 9 — Intelligence.** Insights detectors, trade-off modelling, price tracking, subscriptions, warranties.

**Phase 10 — Polish.** Offline sync hardening, multi-currency, accessibility, performance, Electron packaging, store submission.

The dependency that matters: nothing downstream of Phase 3 works well if the parser is weak. Build the test corpus early and treat parser accuracy as the project's primary quality metric.

---

## 7. Future Extensions

Deliberately out of scope for v1, listed so the schema doesn't preclude them:

- **Household sharing** — the schema already supports it via `user_id`; adding a household table and shared-entity permissions is additive
- **Bank and UPI connectivity** — `accounts` and `transactions` are shaped to accept imported transactions and match them against receipts
- **SMS and email bill parsing** — the parser can accept text input from sources other than OCR with no structural change
- **Barcode scanning** — `products.barcode` exists; scanning would improve product identity matching dramatically
- **Bank statement import** — CSV/OFX/QIF import into the same transaction model
- **Nutrition insight** — line-item data plus a food database would yield dietary tracking as a side-effect of grocery scanning
- **Natural-language query over one's own data** — "how much did I spend on coffee last year"
- **Cloud OCR as an opt-in fallback** — the `packages/ocr` adapter interface accommodates a cloud engine without touching calling code, should on-device accuracy prove insufficient for some receipt types
- **Tax export** — a `is_tax_deductible` flag on splits plus a year-end report

---

## 8. Open Questions

1. **Primary region** — determines seeded categories, keyword dictionaries, default currency, and date-format priority. India assumed throughout; confirm.
2. **Parser accuracy floor** — if on-device OCR plus local parsing lands below roughly 70% line-item accuracy on real receipts, the review burden may exceed what users tolerate. Recommend building the test corpus in Phase 1 and measuring before committing fully to on-device-only.
3. **Desktop distribution** — signed installers require an Apple Developer account and a Windows code-signing certificate. Worth deciding early since it affects the release timeline.
4. **Push notifications** — Expo's push service is simplest; confirm it's acceptable given that notification payloads should contain no financial detail.
