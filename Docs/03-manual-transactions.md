# 03 — Manual Transaction Entry

**Priority:** P0
**Depends on:** 01, 02
**Blocks:** 13, 17, 19, 27

---

## Problem

Not every expense has a receipt worth photographing. Cash to a friend, a parking meter, a transfer between accounts. And before capture exists (07–09), manual entry is the only way anything enters the ledger.

Manual entry is not a fallback. It stays a first-class path permanently, and every field a parser can fill is a field a person can type.

---

## Behaviour

### Adding an expense

Amount, date, merchant, category, account. Amount and date are required; everything else has a sensible default. The form opens with the amount field focused and the numeric keypad up, because that is what the user came to do.

Merchant autocompletes from history. Selecting a known merchant prefills its usual category, which the user can override — and overriding teaches the categorisation engine (12).

### Splitting

A single expense can divide across categories. The split editor shows a running remainder — enter $40 of a $100 total and the next row prefills $60. The form cannot save while the remainder is non-zero, and the remainder is displayed as a signed amount rather than an error message.

### Transfers

Two accounts, one amount. Creates one transaction with two splits, one negative. Transfers are excluded from spend reporting — moving money between your own accounts is not spending, and counting it doubles every month a user moves savings.

### Refunds

A refund links to the original transaction. The link matters: an unlinked refund looks like income, which distorts both reports and the tax estimate. The picker offers recent transactions from the same merchant first.

### Business use

A toggle on any split. When on, a percentage field appears, defaulting to the value in settings (13). This is what makes one gas receipt serve as both personal expense and business deduction.

---

## Mechanism

### The remainder invariant

Enforced client-side for immediate feedback and server-side by the trigger from 01. The client check is UX; the trigger is the guarantee.

### Merchant creation

Typing an unrecognised merchant name creates a merchant row on save, not on keystroke. Prevents a merchant table full of partial strings from abandoned entries.

### Quick entry

A reduced form for the common case: amount, category, done. Date defaults to today, account to the last used, merchant blank. Two taps and a number.

### Duplicate detection

On save, if a transaction with the same amount, merchant, and date already exists, the app asks rather than blocking. Genuine duplicates happen — two coffees at the same shop on the same day — so this is a question, not a rejection.

---

## Data

Uses `transactions` and `transaction_splits` from 01. Adds:

```sql
create table merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  chain_id uuid,
  default_category_id uuid references categories(id),
  transaction_count int not null default 0,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on merchants using gin (normalized_name gin_trgm_ops);
create unique index on merchants (user_id, normalized_name)
  where deleted_at is null;

create table merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references merchants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null,
  source text not null default 'user'
);
create index on merchant_aliases using gin (alias gin_trgm_ops);
```

`normalized_name` is lowercased, punctuation-stripped, whitespace-collapsed. Trigram index supports fuzzy matching for both autocomplete here and OCR merchant resolution in 09.

---

## Files

```
packages/core/src/transactions/
├── index.ts
├── create.ts
├── split.ts            # remainder calculation
├── transfer.ts
├── refund.ts           # linking, sign handling
└── duplicates.ts

packages/core/src/merchants/
├── index.ts
├── normalize.ts
└── match.ts            # trigram similarity, shared with 09

apps/*/routes|screens/Transactions/
├── TransactionListScreen.tsx
├── AddTransactionScreen.tsx
├── QuickEntrySheet.tsx
├── SplitEditor.tsx
├── TransferForm.tsx
└── RefundLinkPicker.tsx
```

---

## Acceptance criteria

- Amount field is focused with numeric keypad on open
- Splits cannot be saved with a non-zero remainder; remainder shows as a signed amount
- Transfers create two splits and are excluded from spend reports
- Refunds link to an original transaction and reduce that merchant's net spend
- An unlinked refund is flagged in review, not silently treated as income
- Merchant autocomplete matches on fuzzy input within 100 ms
- Merchants are created on save, never on keystroke
- Business-use toggle applies the settings default percentage
- Duplicate detection asks rather than blocks
- Quick entry completes in two taps plus an amount

---

## Out of scope

- Receipt attachment (07)
- Automatic categorisation (12)
- Recurring transactions (19)
- Bank import
