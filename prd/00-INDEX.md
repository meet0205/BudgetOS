# Budget App — Feature PRD Index

**Region:** Canada / Nova Scotia (province is a user setting)
**Currency:** CAD, stored as integer cents
**Tax year:** Calendar, Jan–Dec
**Version:** 2.0 — reorganised into per-feature documents
**Date:** July 2026

---

## How to read this

One PRD per feature, one file each. Every file follows the same structure:

- **Priority** — P0 through P3
- **Depends on** — features that must ship first
- **Problem** — why it exists
- **Behaviour** — what the user experiences
- **Mechanism** — how it works
- **Data** — schema
- **Files** — where code lives
- **Acceptance criteria** — done means this
- **Out of scope** — explicit exclusions

Build in priority order. Within a priority, build in the listed sequence — the ordering encodes dependencies.

---

## Priority definitions

| Priority | Meaning |
|---|---|
| **P0** | The app does not function without it. Ship first. |
| **P1** | Core value. The app is worth using once these land. |
| **P2** | Differentiators. What makes it better than alternatives. |
| **P3** | Refinement. Valuable but deferrable. |

---

## P0 — Foundation

| # | Feature | File | Depends on |
|---|---|---|---|
| 01 | Data foundation & schema | `01-data-foundation.md` | — |
| 02 | Accounts & categories | `02-accounts-categories.md` | 01 |
| 03 | Manual transaction entry | `03-manual-transactions.md` | 01, 02 |
| 04 | Manual income entry | `04-manual-income.md` | 01 |
| 05 | Canadian tax estimation | `05-tax-estimation.md` | 04 |
| 06 | Allocation buckets & safe-to-spend | `06-allocation-safe-to-spend.md` | 04, 05 |

**P0 exit criteria:** A user can enter income and expenses by hand, see an estimated tax position, and know their safe-to-spend. No camera, no OCR, no AI. This is a complete, useful product.

---

## P1 — Capture & automation

| # | Feature | File | Depends on |
|---|---|---|---|
| 07 | Document capture | `07-document-capture.md` | 01 |
| 08 | On-device OCR | `08-ocr.md` | 07 |
| 09 | Receipt parser | `09-receipt-parser.md` | 08, 02 |
| 10 | Review & correction | `10-review-correction.md` | 09 |
| 11 | Income document parser | `11-income-parser.md` | 08, 04 |
| 12 | Categorisation engine | `12-categorisation.md` | 02, 09 |
| 13 | Business expenses | `13-business-expenses.md` | 03, 05 |

**P1 exit criteria:** Photograph a receipt or pay stub, get structured data with minimal correction. Tax reserve accounts for business expenses.

---

## P2 — Intelligence & analysis

| # | Feature | File | Depends on |
|---|---|---|---|
| 14 | AI enrichment | `14-ai-enrichment.md` | 09, 11 |
| 15 | AI provider settings | `15-ai-settings.md` | 14 |
| 16 | Item-level filtering | `16-filtering.md` | 09, 12 |
| 17 | Reports | `17-reports.md` | 03, 12 |
| 18 | Interactive dashboard | `18-dashboard.md` | 16, 17 |
| 19 | Recurring bills | `19-recurring-bills.md` | 03 |
| 20 | Budgets | `20-budgets.md` | 06, 17 |
| 21 | Savings goals | `21-goals.md` | 06 |

**P2 exit criteria:** Abbreviated product names resolve correctly. Filter by product type across stores. Dashboard drills into filters.

---

## P3 — Refinement

| # | Feature | File | Depends on |
|---|---|---|---|
| 22 | Price & unit tracking | `22-price-tracking.md` | 09, 16 |
| 23 | Insights engine | `23-insights.md` | 17 |
| 24 | Trade-off modelling | `24-tradeoffs.md` | 21, 23 |
| 25 | Warranty & returns | `25-warranty.md` | 09 |
| 26 | Subscription detection | `26-subscriptions.md` | 19 |
| 27 | Multi-currency | `27-multi-currency.md` | 03 |
| 28 | Offline & sync | `28-offline-sync.md` | 01 |
| 29 | Security & privacy | `29-security-privacy.md` | 01 |
| 30 | HST tracking | `30-hst.md` | 13, 05 |

---

## Dependency graph

```
01 data foundation
├── 02 accounts/categories
│   ├── 03 manual transactions
│   │   ├── 13 business expenses ──┐
│   │   ├── 17 reports             │
│   │   ├── 19 recurring bills     │
│   │   └── 27 multi-currency      │
│   └── 12 categorisation          │
│       └── 16 filtering           │
├── 04 manual income               │
│   └── 05 tax estimation ─────────┤
│       └── 06 allocation ─────────┤
│           ├── 20 budgets         │
│           └── 21 goals           │
├── 07 capture                     │
│   └── 08 OCR                     │
│       ├── 09 receipt parser      │
│       │   ├── 10 review          │
│       │   ├── 22 price tracking  │
│       │   └── 25 warranty        │
│       └── 11 income parser       │
│           └── 14 AI enrichment   │
│               └── 15 AI settings │
├── 28 offline/sync                │
└── 29 security                    │
                                   │
                    30 HST ────────┘
```

---

## The build order argument

**Manual entry before parsers.** The tax calculator is the valuable part and is fully testable with typed-in numbers. Parsers reduce typing; they are not the feature. Building 04→05→06 before 07→08→11 means a working product months earlier.

**Tax before capture.** Uber income creates a real liability with a real deadline. Getting the reserve right matters more than reading receipts automatically.

**BYO key before billing.** Prove enrichment accuracy against the local parser with your own API key (14) before constructing subscription infrastructure (15). If the accuracy gain is small, the subscription tier is not worth building.

**Filtering before dashboard.** The dashboard is a set of entry points into filter results. Building charts first produces decoration.

---

## Cross-cutting constraints

These apply to every feature and are not restated in each file.

1. **Money is integer cents.** No floats anywhere in the money path.
2. **Manual entry is always available.** Every parsed field is directly enterable. Manual values set `is_user_entered` and are never overwritten by a later parse.
3. **RLS on every table.** `user_id = auth.uid()`, no exceptions.
4. **Soft deletes.** `deleted_at`, never hard delete user data.
5. **Tax figures are estimates.** Labelled as such wherever displayed. The app never states what is owed to CRA.
6. **CRA values are seed data.** Brackets, rates, and thresholds carry `source_url` and `verified_on`. Never hardcoded from memory.
7. **Offline first.** Capture, entry, and viewing work without network. Sync is a background reconciliation.
8. **AI trusts OCR for numbers.** Language models handle meaning; deterministic paths handle digits.

---

## Open questions carried forward

| # | Question | Blocks |
|---|---|---|
| 1 | CRA figures — brackets, BPA, CPP/EI rates and maximums, CPP2, NS low-income reduction, instalment threshold and due dates | 05 |
| 2 | Uber HST reporting — what the platform collects and remits | 30 |
| 3 | Prior-year data for the instalment two-year test — imported or manual | 05 |
| 4 | Sankey support in Victory Native on mobile | 18 |
| 5 | Single filer assumed throughout — confirm | 05 |
| 6 | Apple Developer account and Windows code-signing certificate | Desktop release |
