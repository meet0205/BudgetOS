# 10 — Review & Correction

**Priority:** P1
**Depends on:** 09
**Blocks:** 12 (learning loop)

---

## Problem

Parsers are wrong sometimes. Review is where wrong becomes right, and where corrections teach the system so the same mistake stops recurring.

Review must be fast. A user who spends thirty seconds correcting every receipt stops scanning receipts.

---

## Behaviour

Split view: document image above, extracted fields below. Tapping a field highlights its source region in the image. Tapping a region scrolls to its field. Bidirectional, because verifying a number means finding it on the paper.

Low-confidence fields are visually marked. High-confidence fields are not — drawing attention to everything draws attention to nothing.

Editing a field marks `is_user_corrected`, which permanently protects it from re-parse and from AI overwrite (14).

Bulk actions: accept all, and accept all above a confidence threshold. For a stack of clean receipts the whole review is one tap.

---

## Mechanism

### Learning from corrections

Every correction writes a feedback row:

| Correction | Learned |
|---|---|
| Merchant name | New alias in `merchant_aliases` |
| Category | Rule candidate in 12 |
| Product description | Alias in `product_aliases` |
| Deduction label (11) | Employer-scoped label mapping |
| Field position | Template refinement for that merchant |

The loop is what makes the app improve with use. Without it every receipt is the first receipt.

### Re-parse

A document can be re-parsed after a parser upgrade. User-corrected fields survive; everything else is recomputed. `parser_version` on the receipt makes it possible to find documents parsed by an old version.

---

## Data

```sql
create table correction_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references documents(id) on delete cascade,
  entity_type text not null,
  entity_id uuid,
  field text not null,
  old_value text,
  new_value text,
  parser_version text,
  created_at timestamptz not null default now()
);
create index on correction_events (user_id, entity_type, created_at desc);
```

---

## Acceptance criteria

- Tapping a field highlights the source region; tapping a region scrolls to the field
- Only low-confidence fields are visually flagged
- Corrections set `is_user_corrected` and survive re-parse
- Every correction writes a `correction_events` row
- Merchant corrections create aliases usable by the next parse
- Accept-all completes review in one tap
- A typical clean receipt reviews in under 10 s
