# 07 — Document Capture

**Priority:** P1
**Depends on:** 01
**Blocks:** 08

---

## Problem

A receipt in a pocket is not data. The gap between having a receipt and having it in the app is where most personal finance tracking dies — if capture takes more than a few seconds, it stops happening.

This feature is the intake surface for both receipts and income documents. Same pipeline, different downstream parsers.

---

## Behaviour

Five paths in, all equal:

| Path | Use |
|---|---|
| Camera | The common case — a paper receipt, right now |
| Gallery | A photo taken earlier |
| PDF | Emailed invoices, digital pay stubs |
| Screenshot | App receipts, e-transfers |
| Manual | No document at all (03, 04) |

Camera capture shows edge detection with a live overlay, auto-captures when the document is steady and in frame, and allows manual shutter override. Multi-page receipts capture as a sequence and stay one document.

After capture the image is queued and the user returns to the camera immediately. Processing happens in the background — waiting for OCR before allowing the next capture makes bulk entry painful.

---

## Mechanism

### Pre-processing

Before storage: perspective correction from detected edges, rotation to upright, crop to document bounds, downscale to a maximum edge of 2000px. Original is retained if storage settings permit; the processed version is what OCR reads.

### Deduplication

Two hashes, both computed at capture:

- **SHA-256 of the file bytes** — catches literal re-upload
- **Perceptual hash** — catches the same receipt photographed twice

A pHash within a small Hamming distance of an existing document prompts rather than blocks. Photographing the same receipt twice is a mistake worth catching; two identical-looking receipts from the same shop on the same day are possible.

### Storage

Supabase Storage, path `{user_id}/{yyyy}/{mm}/{document_id}.{ext}`. Bucket is private with RLS matching the row.

Local cache holds recent originals for offline viewing, capped by a settings value with LRU eviction.

### Queue

Captured documents enter a processing queue with status. The queue survives app restart and drains when OCR is available. On mobile this means a capture during a subway ride processes when the app next has resources, not never.

---

## Data

```sql
create type doc_status as enum
  ('captured','processing','parsed','needs_review','confirmed','failed');

create type doc_purpose as enum ('receipt','income','other');

create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose doc_purpose not null default 'receipt',
  status doc_status not null default 'captured',
  storage_path text,
  local_path text,
  mime_type text not null,
  byte_size int,
  page_count int not null default 1,
  content_hash text not null,
  perceptual_hash text,
  captured_at timestamptz not null default now(),
  processed_at timestamptz,
  ocr_raw jsonb,
  ocr_engine text,
  ocr_confidence numeric(3,2),
  parser_version text,
  error_code text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on documents (user_id, status, captured_at desc);
create unique index on documents (user_id, content_hash) where deleted_at is null;
create index on documents (user_id, perceptual_hash);

create table document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  page_number int not null,
  storage_path text not null,
  unique (document_id, page_number)
);
