# 28 — Offline & Sync

**Priority:** P3
**Depends on:** 01

---

## Problem

Receipts get photographed in shops with bad signal. Entry happens on a subway. The app must work with no network and reconcile later without losing or duplicating anything.

---

## Behaviour

Everything works offline: capture, entry, viewing, reports on cached data. A subtle indicator shows pending sync count. Nothing blocks on network.

---

## Mechanism

### Local-first

| Platform | Local store |
|---|---|
| Mobile | WatermelonDB |
| Web / Desktop | IndexedDB via Dexie |

Writes go local first, then queue for sync. Reads come from local. The network is a background reconciliation, never a dependency.

### Queue

Ordered, idempotent, survives restart. Each operation carries a client-generated UUID, so a retry after an ambiguous failure cannot duplicate.

### Conflict resolution

Last-write-wins on scalar fields by `updated_at`, with one exception: **`is_user_corrected` fields never lose to a non-user write.** A parser result arriving late must not overwrite a correction made on another device.

Deletions win over edits. Splits are replaced atomically as a set rather than merged field-by-field, since a partial merge could break the sum invariant.

### Realtime

Supabase Realtime pushes changes to other signed-in devices. Not required for correctness — the queue handles it either way — but makes multi-device feel immediate.

---

## Data

```sql
create table sync_queue (
  id uuid primary key,
  user_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  payload jsonb not null,
  client_created_at timestamptz not null,
  attempts int not null default 0,
  last_error text,
  synced_at timestamptz
);
