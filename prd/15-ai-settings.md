# 15 — AI Provider Settings & Accounts

**Priority:** P2
**Depends on:** 14

---

## The constraint, stated plainly

Claude Pro, ChatGPT Plus, and Gemini Advanced are consumer chat subscriptions. **None exposes an OAuth flow granting a third-party app programmatic model access.** There is no token a user can grant that lets this app call the model on their behalf using their chat subscription. True of all three vendors; a product boundary, not a gap awaiting a fix.

A "Sign in with Claude Pro" button would fail at token exchange. So the subscription experience is delivered by **our own subscription**, with BYO key as the secondary path.

---

## Two modes

### Mode 1 — App subscription (default)

The user subscribes to this app. Our backend holds provider keys and proxies enrichment.

- Auth: existing Supabase session
- Entitlement: `subscriptions_app` row with plan, quota, period
- Client never holds a provider key
- Users pick a **quality tier**, not a model name, so models can be swapped without breaking expectations

This gives the login / switch profile / disconnect surface, truthfully, because the account is ours.

### Mode 2 — Bring your own key

- Key in device secure storage: iOS Keychain, Android EncryptedSharedPreferences, Electron safeStorage
- **Never sent to our servers, never stored in Postgres.** Only a fingerprint (last 4 + salted hash) syncs, so the user can see which key is on which device
- Requests go device → provider directly; our infrastructure sees nothing
- User picks specific models
- Cost is theirs, tracked locally

Privacy-maximal, and the answer for anyone who doesn't want a second subscription.

---

## Settings surface

### Mode switch

Segmented control: `App subscription | My own key`. **One active at a time** — `active_mode` is an enum, not booleans. Switching preserves the other mode's config; a user can hold both and flip. Every enrichment records which mode produced it.

Within BYO, one provider active at a time. Keys for all three can be stored; only the selected one is used.

### Trigger mode

| Mode | Behaviour |
|---|---|
| `always` | Every receipt |
| `low_confidence` | **Default.** Only below threshold |
| `manual` | Never automatic; per-receipt button |
| `off` | Disabled |

`low_confidence` is default because the local parser handles familiar merchants well after a few visits. Enrichment then concentrates spend on genuinely hard receipts.

### Image mode

| Mode | Behaviour |
|---|---|
| `never` | **Default.** Text only |
| `ocr_failed` | Only when OCR produced < 5 blocks or confidence < 0.3 |
| `always` | Every enrichment — roughly 10–30× cost |

Each option states its consequence in plain language, including cost multiple and what leaves the device.

### Spending guard

- `monthly_budget_minor` — optional ceiling. On reach, enrichment pauses; local parsing continues uninterrupted
- `warn_at_percent` — default 80
- Bulk operations show a pre-flight estimate and require confirmation above a threshold count

---

## Data

```sql
create type ai_mode         as enum ('app_subscription','byo_key','off');
create type ai_provider     as enum ('anthropic','google','openai');
create type ai_trigger_mode as enum ('always','low_confidence','manual','off');
create type ai_image_mode   as enum ('never','ocr_failed','always');

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
  updated_at timestamptz not null default now()
);

create table ai_key_fingerprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider ai_provider not null,
  last_four text not null,
  key_hash text not null,
  device_label text,
  last_verified_at timestamptz,
  is_valid boolean not null default true,
  unique (user_id, provider, device_label)
);

create type app_sub_status as enum
  ('active','trialing','past_due','cancelled','expired');

create table subscriptions_app (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null,
  status app_sub_status not null,
  platform text not null,
  platform_subscription_id text,
  period_start date not null,
  period_end date not null,
  enrichment_quota int not null,
  enrichment_used int not null default 0,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create unique index on subscriptions_app (platform, platform_subscription_id)
  where platform_subscription_id is not null;
```

---

## Acceptance criteria

- Exactly one mode active; switching is explicit and confirmed
- **BYO keys never appear in any request to our infrastructure**, verified by traffic inspection
- Test connection returns a specific error — invalid key, no quota, rate limit, network — never generic
- Removing a key clears secure storage on that device immediately
- Image never transmitted under `never`, verified by traffic inspection
- Budget ceiling halts enrichment without breaking receipt processing
- Subscription survives reinstall via restore purchases
- Disconnecting leaves the app fully functional on tiers 1 and 2
- One-time disclosure modal on first enable, stating what is sent and to whom

---

## Open questions

1. Quality tier count and what each maps to
2. Quota sizing — measure real per-receipt token cost during 14 before pricing
3. Store billing compliance — Apple and Google require IAP for digital content, 15–30%. Web and desktop can use Stripe
4. Free-tier allowance — 10–20 receipts lets users feel the accuracy difference before subscribing. Recommended, since that difference is the entire argument
