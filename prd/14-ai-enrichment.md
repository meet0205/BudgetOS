# 14 — AI Enrichment

**Priority:** P2
**Depends on:** 09, 11
**Blocks:** 15

---

## Problem

A Walmart receipt reads:

```
GV WHL MLK 1G          3.48
MM CHNK LT TUNA        1.24
GDVL SHRP CHDR 8Z      2.97
```

No keyword dictionary resolves `GV WHL MLK 1G` to *Great Value Whole Milk, 1 gallon → Dairy*. It requires knowing GV is Walmart's house brand, MLK is milk, 1G is a gallon. Costco abbreviates differently. Sobeys differently again.

This is what a language model does well and a rules engine cannot. Without it, line-item categorisation works only for products the user has already corrected by hand.

---

## Behaviour

Invisible when it works. Products arrive with full names and correct categories instead of abbreviations.

When 15 sets `manual` mode, an "Enhance with AI" button appears on each receipt.

---

## Mechanism

### Position in the pipeline

Tier 3, after on-device OCR (08) and the local parser (09). Never a replacement for either — capture and extraction always work offline and free.

### What is sent

**Text only by default.** Flattened OCR output plus detected merchant name — roughly 1–3 KB versus 200–800 KB for an image. Cheaper, faster, and materially better for privacy.

Image sending is separately controlled in 15 and defaults off.

### Prompt construction

Assembled provider-agnostically:

1. System role — receipt parsing, strict JSON, no prose
2. The product-layer taxonomy with slugs
3. Merchant hint — name plus prior alias mappings for this user
4. **Up to 40 previously confirmed product names for this merchant**
5. The OCR text
6. Output schema

Item 4 is what makes this compound. The model receives the user's actual vocabulary, so `GV WHL MLK 1G` resolves to the same product record every visit — which is what makes price tracking (22) work across months instead of fragmenting into near-duplicates.

### Output contract

Strict JSON, schema-validated before use. Malformed output falls back to the tier-2 result rather than failing the receipt.

`categorySlug` and `productTypeSlug` are constrained to the seeded lists. Any value outside them is discarded and the item falls back to local categorisation. This prevents taxonomy drift, which would quietly corrupt every report.

### Merge precedence

| Field | Winner |
|---|---|
| Anything `is_user_corrected` | **Local, always** |
| Total, subtotal, tax — if local reconciles | **Local** |
| Total, subtotal, tax — if local failed | AI |
| Line item amount | **Local** |
| Line item description | **AI** |
| Brand, pack size | **AI** |
| Category | AI, unless a rule matches |
| Merchant | AI if local confidence < 0.75 |

**Trust OCR for numbers, trust the model for meaning.** A language model transposing a digit is the failure that would silently corrupt financial data, so amounts stay with the deterministic path wherever it is arithmetically self-consistent.

### Redaction

Before any network call, unconditionally: card number fragments, phone numbers, email addresses, header-zone street addresses, loyalty numbers.

Not optional, not user-configurable. There is no enrichment reason to send a partial card number to a model.

### Caching

Keyed on `sha256(ocr_text + taxonomy_version + prompt_version)`. Re-parsing an unchanged receipt costs nothing. Cache syncs, so re-enriching on a second device is also free.

---

## Data

```sql
create type enrichment_status as enum
  ('success','failed','cached','skipped','budget_blocked');

create table ai_enrichments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  mode text not null,
  provider text,
  model text,
  status enrichment_status not null,
  included_image boolean not null default false,
  input_tokens int,
  output_tokens int,
  estimated_cost_minor bigint,
  currency_code char(3) default 'USD',
  latency_ms int,
  content_hash text,
  prompt_version text,
  error_code text,
  created_at timestamptz not null default now()
);
create index on ai_enrichments (user_id, created_at desc);
create index on ai_enrichments (content_hash);
```

---

## Files

```
packages/core/src/ai/
├── index.ts
├── prompt.ts           # assembly, including product history
├── schema.ts           # zod validation
├── merge.ts            # precedence table above
├── redact.ts
├── cost.ts
├── cache.ts
└── providers/
    ├── types.ts
    ├── proxy.ts
    ├── anthropic.ts
    ├── google.ts
    └── openai.ts
```

---

## Acceptance criteria

- Resolves ≥85% of abbreviated grocery line items to correct full names
- Category and product-type slugs outside the taxonomy are rejected, never persisted
- Amounts never override a locally reconciled total
- User-corrected fields survive enrichment unchanged
- Malformed output degrades to the tier-2 result with no user-visible failure
- Redaction removes all listed PII classes before transmission
- Identical content is never enriched twice
- Works with BYO key before any billing infrastructure exists

---

## Out of scope

- Provider settings UI (15)
- Subscription billing (15)
