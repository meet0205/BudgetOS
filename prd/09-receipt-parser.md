# 09 — Receipt Parser

**Priority:** P1
**Depends on:** 08, 02
**Blocks:** 10, 14, 16, 22, 25

---

## Problem

OCR returns text blocks with positions. A receipt is a merchant, a date, line items with quantities and prices, tax, discounts, and a total. Turning the first into the second is the parser's job.

The parser does not need to be excellent. It needs to be competent: extract amounts reliably, get the total right, and produce a usable fallback when AI enrichment (14) is unavailable. Semantic resolution of abbreviated product names moves to 14 — that is not achievable with rules.

---

## Behaviour

Invisible on success. On low confidence, the document routes to review (10) with uncertain fields marked.

---

## Mechanism

### Seven stages

| Stage | Does |
|---|---|
| 1. Normalise | Join blocks into lines by y-position; strip noise |
| 2. Zone | Header / body / footer by position and content signals |
| 3. Merchant | Fuzzy match against `merchants` and `merchant_aliases` |
| 4. Date | Multiple format attempts; prefer near-past dates |
| 5. Line items | Price-anchored extraction, right-to-left |
| 6. Totals | Subtotal, tax, discounts, total from footer zone |
| 7. Reconcile | Σ line items + tax − discounts == total |

### Price-anchored extraction

Prices are the reliable anchor. Find currency-shaped tokens on the right edge, take everything to the left on the same line as the description, then look for quantity and unit patterns within that text.

Working right-to-left is more robust than left-to-right because descriptions vary wildly in length and wrap unpredictably, while prices sit in a consistent column.

### Reconciliation as confidence

If line items plus tax minus discounts equals the total, the parse is almost certainly correct and confidence is high regardless of individual field scores. If it doesn't, something is wrong even if every field looked confident.

Reconciliation is weighted heavily in the confidence model for this reason.

### Confidence model

```
confidence =
    0.30 × reconciliation_result
  + 0.20 × merchant_match_score
  + 0.20 × mean_ocr_confidence
  + 0.15 × date_plausibility
  + 0.15 × line_item_completeness
```

Below `profiles.ocr_review_threshold` routes to review.

### Merchant templates

Once a merchant is seen several times with consistent layout, a template records zone positions and format quirks. Templates improve accuracy for repeat merchants and are learned, never shipped.

---

## Data

```sql
create table receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  transaction_id uuid references transactions(id),
  merchant_id uuid references merchants(id),
  purchased_at timestamptz,
  subtotal_minor bigint,
  tax_minor bigint not null default 0,
  discount_minor bigint not null default 0,
  total_minor bigint,
  currency_code char(3) not null default 'CAD',
  reconciles boolean not null default false,
  confidence numeric(3,2),
  parser_version text,
  template_id uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table line_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null references receipts(id) on delete cascade,
  transaction_split_id uuid references transaction_splits(id),
  line_number int not null,
  raw_text text not null,
  description text,
  ai_expanded_name text,
  brand text,
  product_id uuid,
  product_type_id uuid,
  category_id uuid references categories(id),
  quantity numeric(12,3) not null default 1,
  unit text,
  pack_size numeric(12,3),
  pack_unit text,
  unit_price_minor bigint,
  normalized_unit_price_minor bigint,
  amount_minor bigint not null,
  is_refund boolean not null default false,
  source text not null default 'parser',
  confidence numeric(3,2),
  is_user_corrected boolean not null default false,
  purchased_at timestamptz,
  created_at timestamptz not null default now()
);
create index on line_items (user_id, purchased_at desc);
create index on line_items (receipt_id);
create index on line_items using gin (description gin_trgm_ops);
```

`source` records whether a field came from the parser, AI, or the user. It exists so you can measure how much 14 actually improved on 09 — the number that justifies its cost.

---

## Acceptance criteria

- Total extracted correctly on ≥95% of legible receipts
- Reconciliation detected and reflected in confidence
- Merchant matched to an existing row when one exists
- Line items extracted with amounts on ≥85% of grocery receipts
- Confidence below threshold routes to review
- Templates form after repeated exposure to a merchant
- Parser version recorded for later re-parse
- Runs fully offline
