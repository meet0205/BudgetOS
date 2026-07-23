# PRD Addendum — AI Enrichment Layer

**Supersedes:** F3 (On-Device OCR), parts of F4 (Parser), F20 (Security & Privacy)
**Adds:** F22 (AI Enrichment), F23 (Provider Accounts & Auth), F24 (AI Settings & Cost Control)
**Version:** 1.1
**Date:** July 2026

---

## A0. Why this exists

The original spec assumed on-device OCR plus a local rules parser. That works for clean receipts from merchants the user visits repeatedly. It fails on the case that matters most.

A Walmart receipt line reads:

```
GV WHL MLK 1G          3.48
MM CHNK LT TUNA        1.24
GDVL SHRP CHDR 8Z      2.97
```

No keyword dictionary resolves `GV WHL MLK 1G` to *Great Value Whole Milk, 1 Gallon → Dairy & Eggs*. It requires knowing that GV is Walmart's house brand, that MLK is milk, that 1G is a gallon. Costco uses different abbreviations. Target uses different ones again. Indian retailers abbreviate in yet other ways, sometimes transliterating.

This is exactly what a language model does well, and exactly what a rules engine cannot. So the AI tier is not a nice-to-have — it is what makes line-item categorisation work outside of a handful of memorised merchants.

**The design principle:** AI is an *enhancement layer over* on-device OCR, never a replacement for it. Capture and text extraction always work offline and free. AI adds understanding on top, when the user has enabled it and chosen to spend on it.

---

## A1. Revised OCR Architecture (replaces F3)

### Three tiers

```
┌─ Tier 1 ─────────────────────────────────────┐
│ On-device OCR          always, free, offline │
│ Apple Vision / ML Kit / Tesseract.js         │
│ Output: raw text + bounding boxes            │
└──────────────────────────────────────────────┘
                     ↓
┌─ Tier 2 ─────────────────────────────────────┐
│ Local parser           always, free, offline │
│ packages/core/src/parser (7 stages)          │
│ Output: structured receipt + confidence      │
└──────────────────────────────────────────────┘
                     ↓  (conditional — see A4)
┌─ Tier 3 ─────────────────────────────────────┐
│ AI enrichment          optional, metered     │
│ Claude / Gemini / GPT, via proxy or BYO key  │
│ Input: OCR text (or image, if user enables)  │
│ Output: resolved names, categories, structure│
└──────────────────────────────────────────────┘
```

Tier 1 and 2 are unchanged from the base PRD and remain the offline path. Tier 3 is new.

### What Tier 3 receives

By default, **text only** — the flattened OCR output plus detected merchant name. This is deliberate:

- Roughly 1–3 KB per receipt instead of 200–800 KB for an image
- Order-of-magnitude cheaper than vision tokens
- Materially better privacy posture
- Faster round-trip

Image sending is a separate, user-controlled setting (A4), used when OCR itself has failed — glare, crumpling, handwriting — and there is no useful text to enrich.

### What Tier 3 returns

A strict JSON contract. The model is instructed to return only JSON, and the response is schema-validated before use. Malformed output falls back to Tier 2's result rather than failing the receipt.

```ts
interface AiEnrichmentResult {
  merchant: {
    name: string;              // resolved, e.g. "Walmart"
    confidence: number;
  };
  purchasedAt: string | null;  // ISO 8601
  currency: string | null;     // ISO 4217
  lineItems: Array<{
    rawText: string;           // exactly as it appeared
    description: string;       // expanded, e.g. "Great Value Whole Milk"
    brand: string | null;      // e.g. "Great Value"
    quantity: number;
    unit: string | null;       // 'kg','g','l','ml','pc','pack'
    packSize: number | null;   // e.g. 3.78 for 1 gallon in litres
    packUnit: string | null;
    unitPrice: number | null;
    amount: number;
    categorySlug: string;      // MUST be from our product taxonomy
    categoryConfidence: number;
    isRefund: boolean;
  }>;
  subtotal: number | null;
  taxLines: Array<{ label: string; amount: number }>;
  discounts: Array<{ label: string; amount: number }>;
  total: number | null;
  warrantyTerms: string | null;   // feeds F16
  returnWindowDays: number | null;
  notes: string | null;
  reconciles: boolean;            // model's own check
}
```

`categorySlug` is constrained: the prompt includes the exact product-layer taxonomy from `categories` and the model is told to choose only from that list. Any slug not in the taxonomy is discarded and the item falls back to local categorisation. This prevents taxonomy drift, which would otherwise quietly corrupt every report.

### Prompt construction

Assembled in `packages/core/src/ai/prompt.ts`, provider-agnostic:

1. **System role** — receipt parsing task, strict JSON output, no prose
2. **Taxonomy** — the full product-layer category list with slugs
3. **Merchant hint** — if the merchant is known, its name and prior alias mappings for this user, which sharply improves abbreviation resolution on repeat visits
4. **User's product history** — up to 40 previously confirmed product names for this merchant, so `GV WHL MLK 1G` resolves consistently to the same product record every time
5. **The OCR text**
6. **Output schema** — the interface above, with an explicit instruction to return nothing else

Item 4 is what makes this compound. The more the user scans, the better the enrichment gets, because the model receives their actual vocabulary as context.

### Merging AI output with local parse

AI does not blindly overwrite. `packages/core/src/ai/merge.ts` applies precedence:

| Field | Winner |
|---|---|
| Any field where `is_user_corrected` is true | **Local, always** |
| Total, subtotal, tax | **Local**, if it reconciles arithmetically |
| Total, subtotal, tax | AI, if local failed to reconcile |
| Date | Higher confidence |
| Merchant | AI, if local confidence < 0.75 |
| Line item description | **AI** — this is its core value |
| Line item amount | **Local** — OCR reads digits reliably; models can transpose |
| Category | AI, unless a user rule matches |
| Pack size, brand | **AI** |

The rule underneath: **trust OCR for numbers, trust the model for meaning.** Digit transposition by a language model is the failure mode that would silently corrupt financial data, so amounts stay with the deterministic path wherever the deterministic path is arithmetically self-consistent.

### Files

```
packages/core/src/ai/
├── index.ts              # orchestrator, tier-3 entry point
├── prompt.ts             # prompt assembly
├── schema.ts             # zod schema for AiEnrichmentResult
├── merge.ts              # precedence rules above
├── redact.ts             # strip card digits, phone, address pre-send
├── cost.ts               # token estimation, spend tracking
├── cache.ts              # content-hash → result, avoids repeat spend
└── providers/
    ├── types.ts          # AiProvider interface
    ├── proxy.ts          # our backend (default path)
    ├── anthropic.ts      # BYO key
    ├── google.ts         # BYO key
    └── openai.ts         # BYO key
```

### Acceptance criteria

- Enrichment resolves ≥85% of abbreviated grocery line items to correct full product names on major-retailer receipts
- Returned `categorySlug` values outside the taxonomy are rejected, never persisted
- Amounts from AI never override a locally reconciled total
- User-corrected fields survive enrichment unchanged
- Malformed model output degrades to the Tier 2 result without user-visible failure
- Redaction removes card digits and phone numbers before any network call
- Identical receipt content is never enriched twice (cache hit)

---

## A2. F23 — Provider Accounts & Authentication

### The constraint, stated plainly

Claude Pro, ChatGPT Plus, and Gemini Advanced are consumer chat subscriptions. **None of them exposes an OAuth flow that grants a third-party application programmatic model access.** There is no token a user can grant us that lets us call the model on their behalf using their chat subscription. This is true of all three vendors and is a product boundary, not a gap awaiting a fix.

Building "Sign in with Claude Pro" would produce a button that fails at token exchange. So the subscription experience the user wants is delivered by **our own subscription**, with BYO API key as the secondary path.

### Two connection modes

**Mode 1 — App Subscription (default)**

The user subscribes to our app. Our backend holds provider API keys and proxies enrichment requests. This gives exactly the surface described: a login button, profile display, plan and usage, profile switching, and disconnect.

- Auth: Supabase Auth session, already present from app login
- Entitlement: `subscriptions_app` row with plan, quota, and period
- Requests: client → our Edge Function → provider → back
- The client never holds a provider key
- Model selection is ours; users pick a *quality tier*, not a specific model, so we can substitute models without breaking anyone

**Mode 2 — Bring Your Own Key (secondary)**

The user supplies their own Anthropic, Google, or OpenAI API key.

- Key stored in device secure storage — iOS Keychain, Android EncryptedSharedPreferences, Electron safeStorage
- **The key is never sent to our servers and never stored in Postgres.** Only a non-reversible fingerprint (last 4 characters plus a salted hash) is synced, so the user can see which key is configured on which device
- Requests go directly from device to provider — our infrastructure sees nothing
- Users choose specific models
- Cost is theirs, tracked locally and displayed

Mode 2 is the privacy-maximal path and the answer for anyone who doesn't want a second subscription.

### Toggle semantics

**One mode active at a time.** `ai_settings.active_mode` is an enum, not a set of booleans. Switching modes does not delete the other mode's configuration — a user can hold both an app subscription and a personal key and flip between them, but exactly one is in effect for any given receipt, and every enrichment records which mode produced it.

Within BYO mode, **one provider active at a time** — `ai_settings.active_provider`. Keys for all three can be stored simultaneously; only the selected one is used.

### UI surface

**Settings → AI Enhancement → Account**

*When on App Subscription, connected:*
- Plan name and price
- Enrichments used this period, quota remaining, reset date
- **Switch profile** — for users with multiple app accounts; signs out and returns to the account picker
- **Manage subscription** — deep link to the platform store's subscription management
- **Disconnect** — reverts to local-only parsing, retains the subscription

*When on App Subscription, not connected:*
- Plan comparison
- **Subscribe** button → platform IAP (StoreKit / Play Billing) on mobile, Stripe on web and desktop
- **Restore purchases**

*When on BYO Key:*
- Provider selector: Claude, Gemini, ChatGPT
- Per provider: key field (masked, paste-only, never displayed after save), **Test connection**, **Remove key**
- Model picker for the selected provider
- Connection status with last successful call time
- Estimated spend this month, computed locally from token counts

*Mode switch* is a segmented control at the top: `App Subscription | My Own Key`. Changing it takes effect on the next receipt, with a confirmation showing what will change.

### Files

```
apps/*/routes|screens/Settings/AI/
├── AccountScreen.tsx
├── ProviderKeys.tsx
├── ModelPicker.tsx
├── UsageMeter.tsx
└── ConnectionTest.tsx

packages/core/src/ai/providers/
apps/mobile/src/lib/secureStore.ts
apps/desktop/electron/ipc/secureStore.ts
supabase/functions/ai-proxy/index.ts
supabase/functions/ai-entitlement/index.ts
```

### Acceptance criteria

- Exactly one mode is active; switching is explicit and confirmed
- BYO keys never appear in any network request to our infrastructure, verified by traffic inspection
- Test connection gives a specific error — invalid key, no quota, network, rate limit — never a generic failure
- Removing a key clears it from secure storage on that device immediately
- Subscription state survives reinstall via restore purchases
- Disconnecting leaves the app fully functional on tiers 1 and 2
- Switch profile signs out cleanly without orphaning local data

---

## A3. F24 — AI Settings & Cost Control

### Trigger mode

`ai_settings.trigger_mode`, user-selected:

| Mode | Behaviour | Best for |
|---|---|---|
| `always` | Every receipt is enriched | Maximum accuracy, highest cost |
| `low_confidence` | Only when local parse confidence < threshold | **Default.** Most cost-effective |
| `manual` | Never automatic; an "Enhance with AI" button appears on each receipt | Full control |
| `off` | Disabled entirely | Local-only, zero cost |

`low_confidence` is the default because the local parser handles familiar merchants well after a few visits. Enrichment then concentrates spend on genuinely hard receipts, which is where the value is.

The threshold is user-adjustable, defaulting to 0.80 and shared with `profiles.ocr_review_threshold`.

### Image sending

`ai_settings.image_mode`, user-selected:

| Mode | Behaviour |
|---|---|
| `never` | **Default.** Text only, always |
| `ocr_failed` | Image sent only when OCR produced fewer than 5 blocks or mean confidence < 0.3 |
| `always` | Image sent with every enrichment — highest accuracy, highest cost |

The settings screen states the consequence in plain language next to each option, including approximate cost multiple (vision is roughly 10–30× text-only per receipt, verify against current provider pricing) and what leaves the device.

### Redaction

Before any network call, regardless of mode, `packages/core/src/ai/redact.ts` strips:

- Card number fragments (any 4+ consecutive digits adjacent to `XXXX`, `****`, or card-brand keywords)
- Phone numbers
- Email addresses
- Street addresses in the header zone
- Loyalty and membership numbers

Redaction is not optional and not user-configurable. There is no legitimate enrichment reason to send a partial card number to a model, and its presence in a prompt log would be a real problem.

### Cost visibility

For both modes, the app tracks and displays:

- Enrichments this period
- Estimated tokens in and out
- Estimated cost (BYO) or quota consumed (subscription)
- A per-receipt cost line in receipt detail, so the relationship between behaviour and spend is legible

**Guards:**
- `monthly_budget_minor` — an optional user-set ceiling. On reach, enrichment pauses and the user is notified; local parsing continues uninterrupted
- `warn_at_percent` — default 80%, triggers a notification
- Batch operations (bulk desktop import) show a pre-flight estimate and require confirmation above a configurable receipt count

### Caching

`packages/core/src/ai/cache.ts` keys on `sha256(ocr_text + taxonomy_version + prompt_version)`. A re-parse of an unchanged receipt costs nothing. Cache is local-first and syncs, so re-enriching on a second device is also free.

### Files

```
packages/core/src/ai/cost.ts
packages/core/src/ai/cache.ts
packages/core/src/ai/redact.ts
apps/*/routes|screens/Settings/AI/
├── TriggerModeSetting.tsx
├── ImageModeSetting.tsx
├── BudgetGuard.tsx
└── UsageHistory.tsx
```

### Acceptance criteria

- Each trigger mode behaves exactly as specified
- Image is never transmitted under `never`, verified by traffic inspection
- Redaction removes all listed PII classes before transmission
- Budget ceiling halts enrichment without breaking receipt processing
- Cache prevents duplicate charges for identical content
- Cost estimates are within 10% of actual provider billing
- Bulk import warns before incurring significant spend

---

## A4. Schema Additions

Add as `supabase/migrations/0024_ai.sql`.

```sql
create type ai_mode          as enum ('app_subscription','byo_key','off');
create type ai_provider      as enum ('anthropic','google','openai');
create type ai_trigger_mode  as enum ('always','low_confidence','manual','off');
create type ai_image_mode    as enum ('never','ocr_failed','always');

create table ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_mode      ai_mode         not null default 'off',
  active_provider  ai_provider,
  trigger_mode     ai_trigger_mode not null default 'low_confidence',
  image_mode       ai_image_mode   not null default 'never',
  confidence_threshold numeric(3,2) not null default 0.80,
  quality_tier     text            not null default 'balanced',
  byo_model        text,
  monthly_budget_minor bigint,
  warn_at_percent  smallint        not null default 80,
  bulk_confirm_threshold int       not null default 20,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fingerprints only. Never the key itself.
create table ai_key_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider ai_provider not null,
  last_four text not null,
  key_hash text not null,          -- salted sha256, for change detection only
  device_label text,
  last_verified_at timestamptz,
  is_valid boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, provider, device_label)
);

create type app_sub_status as enum ('active','trialing','past_due','cancelled','expired');

create table subscriptions_app (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  status app_sub_status not null,
  platform text not null,          -- 'ios' | 'android' | 'stripe'
  platform_subscription_id text,
  period_start date not null,
  period_end date not null,
  enrichment_quota int not null,
  enrichment_used int not null default 0,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on subscriptions_app (user_id, status);
create unique index on subscriptions_app (platform, platform_subscription_id)
  where platform_subscription_id is not null;

create type enrichment_status as enum ('success','failed','cached','skipped','budget_blocked');

create table ai_enrichments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete cascade,
  mode ai_mode not null,
  provider ai_provider,
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
create index on ai_enrichments (receipt_id);
```

**Additions to existing tables:**

```sql
alter table receipts
  add column ai_enriched boolean not null default false,
  add column ai_enrichment_id uuid references ai_enrichments(id),
  add column ai_result jsonb;

alter table line_items
  add column source text not null default 'parser',  -- 'parser'|'ai'|'user'
  add column ai_expanded_name text,
  add column brand text;
```

`line_items.source` matters for measurement: it lets you compute how much AI actually improved categorisation accuracy against the local parser, which is the number that justifies its cost.

RLS on all four new tables follows the standard `user_id = auth.uid()` pattern.

---

## A5. Revisions to F20 (Security & Privacy)

The base PRD stated images never leave the device. That must be revised to remain accurate.

**Replacement wording for the in-app privacy statement:**

> Receipt scanning happens entirely on your device. Text extraction is local, offline, and free.
>
> If you enable AI Enhancement, extracted receipt **text** is sent to your chosen AI provider to identify products and categories. Card numbers, phone numbers, and addresses are removed first, automatically and always.
>
> Receipt **images** are only sent if you specifically turn that on in Settings. The default is off.
>
> With your own API key, requests go directly from your device to the provider — we never see them. With an app subscription, requests pass through our servers and are not stored after processing.
>
> We never sell your data. We never use it for advertising.

**Additional requirements:**

- A one-time disclosure modal on first enabling AI Enhancement, stating what is sent, to whom, and how to turn it off. Not a checkbox buried in terms
- Provider privacy policies linked directly from the settings screen
- Proxy mode: request and response bodies are not persisted; only the `ai_enrichments` metadata row is retained
- Users can see and delete their enrichment history
- Data export includes `ai_enrichments` metadata; account deletion removes it

---

## A6. Revised Build Sequence

The base PRD's ten phases stand, with one insertion and one change of emphasis.

**Phase 3 (Parser)** — reduced scope. The local parser no longer has to be excellent, only competent. It must extract amounts reliably and produce a usable fallback. Semantic resolution moves to AI. This meaningfully de-risks the hardest phase in the original plan.

**Phase 3.5 (new) — AI Enrichment.** Provider abstraction, prompt construction, schema validation, merge logic, redaction, caching. Build against BYO key first — it needs no billing infrastructure and lets you validate accuracy immediately.

**Phase 6.5 (new) — Subscription & Proxy.** Edge Function proxy, entitlement checks, StoreKit and Play Billing integration, Stripe for web and desktop, quota enforcement, the account UI. Deliberately later, because the value must be proven before the billing infrastructure is worth building.

The sequencing point: **prove enrichment accuracy with your own API key before building any billing.** If the accuracy gain over the local parser is smaller than expected on real receipts, the subscription tier isn't worth constructing.

---

## A7. Open Questions

1. **Quality tiers.** App subscription should expose tiers (fast / balanced / thorough) rather than model names, so models can be swapped without breaking user expectations. Confirm the tier count and what each maps to.
2. **Quota sizing.** Enrichments per month per plan depends on real per-receipt token cost. Measure during Phase 3.5 with actual receipts before setting quota or price.
3. **Store billing compliance.** Apple and Google require in-app purchase for digital content, taking roughly 15–30%. Web and desktop can use Stripe directly. This affects pricing on mobile and should be settled before Phase 6.5.
4. **Free-tier enrichments.** A small monthly allowance — perhaps 10–20 receipts — lets users experience the accuracy difference before subscribing. Recommended, since the difference is the entire sales argument.
5. **Regional model availability.** Provider availability and pricing vary by country. Confirm all three providers are accessible in the primary launch market.
