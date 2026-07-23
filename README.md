# Budget App — Specification Bundle

**Personal budget planner & money management application**
Canada / Nova Scotia · Desktop-first · July 2026

---

## What's in here

```
budget-app-spec/
├── README.md              ← you are here
├── prd/                   ← 30 feature PRDs + index
│   ├── 00-INDEX.md        ← START HERE: priority order, dependency graph
│   ├── 01-data-foundation.md
│   ├── …
│   └── 30-hst.md
├── wireframes/            ← 20 desktop screens, 6 HTML pages
│   ├── index.html         ← START HERE: open in any browser
│   ├── 01-shell-dashboard.html
│   ├── …
│   └── wireframe.css
└── archive/               ← superseded documents, kept for reference
    ├── 00-original-full-prd.md
    ├── 01-addendum-ai.md
    └── 02-addendum-income-tax-ca.md
```

The `prd/` and `wireframes/` folders are current. `archive/` holds the earlier
monolithic PRD and its two addenda — superseded by the per-feature files but
retained because they contain narrative reasoning the feature files compress.

---

## Reading order

1. `prd/00-INDEX.md` — priority tiers, dependency graph, and the build-order argument
2. `wireframes/index.html` — open in a browser, no build step
3. `prd/01` through `prd/06` — the P0 set, which is a complete product on its own

---

## The core decisions

**Manual entry before parsers.** P0 is manual income, tax estimation, and
safe-to-spend. No camera, no OCR, no AI. The tax calculator is fully testable
with typed-in numbers and it's the part that has value. Parsers reduce typing;
they are not the feature.

**Trust OCR for numbers, trust the model for meaning.** AI enrichment resolves
abbreviated product names — `GV WHL MLK 1G` → Great Value Whole Milk → Dairy.
It never overrides a locally reconciled total. A language model transposing a
digit is the failure that would silently corrupt financial data.

**The YTD column gate is a hard stop.** Reading a pay stub's year-to-date column
as current-period overstates income by roughly 14× in July. The number looks
plausible, balances arithmetically, and destroys the tax estimate. Ambiguous
columns route to review with both shown side by side. No override.

**Tax reserve is net of position.** Employment withholding counts as already
paid. Self-employment income reserves at the marginal rate on the net amount
after business expenses. Over-withholding on employment offsets the
self-employment reserve rather than sitting idle.

**Subscription OAuth doesn't exist.** Claude Pro, ChatGPT Plus, and Gemini
Advanced don't expose OAuth granting third-party programmatic access. The
"subscription" experience is delivered by an app subscription with a proxy
backend; bring-your-own-key is the secondary, privacy-maximal path.

---

## Before you build feature 05

**No CRA numbers appear anywhere in this bundle.** Brackets, basic personal
amounts, CPP/EI rates and maximums, CPP2, the NS low-income reduction, the
instalment threshold, and instalment due dates are all structural only. The
`tax_jurisdictions` and `contribution_rules` tables carry `source_url` and
`verified_on` columns for this reason.

Populate them from CRA before building the tax calculator. Seeding from memory
produces a confidently wrong reserve, which is worse than no reserve.

---

## Desktop-first notes

The specs were originally written mobile-first and then retargeted. What changed:

| Feature | Change |
|---|---|
| 07 Capture | Camera path deferred. Import is drag-and-drop, PDF, screenshot, file picker. Bulk import matters much more. |
| 08 OCR | Tesseract.js only. Apple Vision and ML Kit adapters deferred. Keep the adapter interface. |
| 18 Dashboard | Sankey open question resolved — Recharts has it on web. |
| 28 Sync | IndexedDB via Dexie only. WatermelonDB deferred. Build the queue and conflict rules now anyway. |

Keep `packages/core` platform-agnostic even while building one target. That
discipline is what makes phones an app shell later rather than a port.

---

## Open questions

| # | Question | Blocks |
|---|---|---|
| 1 | CRA figures — all of them | Feature 05 |
| 2 | Uber Canada HST reporting — what it collects and remits | Feature 30 |
| 3 | Prior-year data for the instalment two-year test — imported or manual | Feature 05 |
| 4 | Single filer assumed throughout — confirm | Feature 05 |
| 5 | Windows code-signing certificate | Desktop release |

---

## Missing wireframes

Two screens have PRDs but no wireframe yet, both P2/P3:

- **Product detail** — price history for one product across stores (feature 22)
- **Rules editor** — the condition builder (feature 12)

Neither blocks P0 or P1.
