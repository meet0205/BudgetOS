# 25 — Warranty & Return Tracking

**Priority:** P3
**Depends on:** 09

---

## Problem

Return windows close silently. Warranties expire unremembered. The receipt with the proof is in a drawer or a bin.

The app already has the receipt image and the purchase date. The rest is a reminder.

---

## Behaviour

Items above a threshold amount, or in categories like electronics and appliances, prompt on review: is this returnable, is it under warranty.

Detected terms from receipt text prefill the dates. Both are editable, and either can be added manually to any line item.

Reminders fire before each deadline, with a lead time the user sets. The reminder links to the receipt image, which is the thing needed at the counter.

---

## Mechanism

### Detection

Receipt footers frequently carry return policy text — "30 day return policy", "1 year manufacturer warranty". Extracted by 09's footer zone parse, and by 14 where phrasing is unusual.

Absent explicit terms, category defaults apply: electronics 30 days return, appliances 1 year warranty. Defaults are suggestions shown as such, not silent assumptions.

---

## Data

```sql
create table warranties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  line_item_id uuid references line_items(id) on delete cascade,
  receipt_id uuid references receipts(id),
  product_name text not null,
  merchant_id uuid references merchants(id),
  purchased_on date not null,
  return_deadline date,
  warranty_expires_on date,
  warranty_terms text,
  reminder_lead_days int not null default 7,
  return_reminded_at timestamptz,
  warranty_reminded_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on warranties (user_id, return_deadline) where deleted_at is null;
create index on warranties (user_id, warranty_expires_on) where deleted_at is null;
