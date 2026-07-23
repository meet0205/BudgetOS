# 18 — Interactive Dashboard

**Priority:** P2
**Depends on:** 16, 17

---

## Problem

The home screen answers one question — can I spend — and offers doors into everything else. Charts that only display are decoration; every chart here is an entry point into a filter.

---

## Behaviour

### Default cards

1. **Safe to spend** — with the tax reserve shown as a distinct deduction
2. **Tax position** — reserved vs estimated owing, instalment status if applicable
3. **Spend by category** — donut, current period
4. **Income to allocation flow** — Sankey
5. **Top insight** (23)
6. **Upcoming bills** — next 14 days
7. **Category trend** — stacked area, 6 months

Beyond these, pinned saved filters from 16 render as cards.

### Controls

- **Period selector** — month / quarter / year / custom, applies to all cards at once
- **Chart type dropdown** — per card, switch between compatible visualisations
- **Dimension dropdown** — per card, switch grouping: category, merchant, product type, account
- **Comparison toggle** — overlay previous period or same period last year

Layout is user-arrangeable and persists per device.

### Drill-down

Tapping any chart segment applies the corresponding filter and navigates to 16's result view. Tapping a donut slice for Groceries opens the filtered list. This is the point of the charts.

---

## Mechanism

| Chart | Library (web/desktop) | Library (mobile) |
|---|---|---|
| Bar, line, area, donut | Recharts | Victory Native |
| Sankey | Recharts | **verify** |
| Heatmap | custom SVG | custom SVG |

Sankey on mobile needs verification. If Victory Native lacks it: a `react-native-svg` implementation or a WebView-hosted Recharts instance.

---

## Data

```sql
create table dashboard_layout (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_label text,
  cards jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, device_label)
);
```

`cards` shape: `[{ id, type, chart, dimension, filter_id, position, size }]`

---

## Acceptance criteria

- Every chart segment drills to a filtered list
- Period selector applies across all cards simultaneously
- Chart type and dimension switch per card without losing filter state
- Layout persists per device
- Pinned filters render as cards
- Comparison overlay works on all time-series charts
- Dashboard renders in under 1 s with 3 years of data
- Tax reserve is visibly distinct from safe-to-spend, never merged
