# 29 — Security & Privacy

**Priority:** P3
**Depends on:** 01

---

## Problem

This app holds income, tax position, and a complete record of purchases. That is among the most sensitive data a person has.

---

## Behaviour

### Privacy statement

Shown in settings, and the substance of the first-run disclosure:

> Receipt scanning happens entirely on your device. Text extraction is local, offline, and free.
>
> If you enable AI Enhancement, extracted receipt **text** is sent to your chosen AI provider to identify products and categories. Card numbers, phone numbers, and addresses are removed first, automatically and always.
>
> Receipt **images** are only sent if you specifically turn that on in Settings. The default is off.
>
> With your own API key, requests go directly from your device to the provider — we never see them. With an app subscription, requests pass through our servers and are not stored after processing.
>
> We never sell your data. We never use it for advertising.

This replaces the base PRD's "nothing leaves the device", which stopped being true when 14 was added. A privacy claim that is almost true is worse than one that is precise.

### Controls

- Biometric or passcode lock, with a configurable timeout
- Local-only mode — no sync, no AI, everything stays on device
- Data export — full JSON plus CSVs plus original images
- Account deletion — removes all rows and storage objects, confirmed by typing

---

## Mechanism

### At rest

Supabase encryption at rest for the database. Storage bucket is private with RLS matching row ownership. Local caches use platform encrypted storage where available.

### Secrets

API keys (15) in Keychain, EncryptedSharedPreferences, or Electron safeStorage. **Never in Postgres, never in a network request to our infrastructure.**

### Notifications

Push payloads carry no financial detail. "A bill is due soon" — never the amount, never the merchant. Notification previews appear on lock screens.

### Enrichment history

Visible and deletable. Export includes `ai_enrichments` metadata. Account deletion removes it.

---

## Acceptance criteria

- Biometric lock engages after the configured timeout
- Local-only mode disables sync and AI, verified by traffic inspection
- Export produces a complete, re-importable archive
- Deletion removes all rows and storage objects
- Push payloads contain no amounts or merchant names
- First-run AI disclosure is a modal, not buried in terms
