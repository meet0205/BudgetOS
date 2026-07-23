# 24 — Trade-off Modelling

**Priority:** P3
**Depends on:** 21, 23

---

## Problem

"Spend less on dining" is advice nobody acts on. "Cutting dining by $120/month reaches your car goal 4 months sooner" is a decision.

---

## Behaviour

A slider per category. Moving it shows the effect on every goal date and on safe-to-spend, live.

The starting point is the user's actual history — the slider's range is bounded by what they have actually spent, not by hypotheticals. A category they have never spent under $200 in does not offer a $50 scenario.

---

## Mechanism

```
freed_per_month = current_avg − proposed
new_months = ceil((target − current) / (contribution + freed_per_month))
delta_months = old_months − new_months
```

Applied across all goals in priority order, since freed money funds them in sequence.

### Honest bounds

Slider minimum is the lowest month observed in the trailing 12, not zero. Showing a scenario the user has never achieved produces a plan they will not follow.

---

## Data

No new tables. Reads `monthly_category_totals`, `goals`, `allocation_buckets`. Scenarios are ephemeral unless explicitly saved as a budget (20).
