# 11 — Income Document Parser

**Priority:** P1
**Depends on:** 08, 04
**Blocks:** 14

---

## Problem

Typing a pay stub takes a minute and is error-prone across gross, net, and four to six deduction lines. Parsing it is worth doing — but a pay stub has one failure mode that a receipt does not, and it is severe.

---

## The YTD column problem

Every pay stub shows current-period and year-to-date figures side by side for each line.

**Reading the YTD column as current-period overstates income by however many pay periods have elapsed.** In July that is roughly 14×. The resulting tax estimate is catastrophically wrong, and nothing about it looks wrong — the numbers are real, they balance, they came off the document.

This is the highest-risk parse error in the product.

### The gate

`columns.ts` must:

1. Identify headers (`Current`, `This Period`, `YTD`, `Year to Date`, `Cumulative`) by text match and x-position clustering
2. Verify: YTD values must be ≥ current values on every matched line
3. Cross-check against the previous stub — this YTD gross should equal prior YTD gross plus this current gross
4. **Refuse to auto-accept when assignment is uncertain**

Uncertain cases route to review showing both columns side by side, and the user picks. This is a hard gate, not a confidence weight. No override, no "accept anyway."

---

## Three parsers

| Parser | Input | Reconciliation |
|---|---|---|
| `payslip` | Pay stub | gross − deductions = net, **exact** |
| `taxslip` | T4, T4A, T5 | box mapping; T4 box 14 vs sum of stubs |
| `invoice` | Self-employment billing | gross only; HST separate line |
| `uber` | Platform summary | gross fares, fees, HST collected |

Shared intake (07) and OCR (08), divergent at parse.

### Exact reconciliation

Payslips balance exactly. Currency is integer cents, so there is no rounding tolerance. A stub that doesn't balance has a misparse, and it goes to review — no confidence override, same rule as manual entry in 04.

### Deduction label learning

Unrecognised deduction labels map to `other` with the raw text preserved and surface in review. Once the user classifies `CPP QPP` as `cpp`, that mapping is remembered per employer and applied to subsequent stubs — the same learning loop as 10.

---

## Files

```
packages/core/src/parser/income/
├── index.ts            # type detection → route
├── payslip.ts
├── taxslip.ts
├── invoice.ts
├── uber.ts
├── columns.ts          # THE GATE
├── deductions.ts       # label → kind, learned per employer
└── reconcile.ts
```

---

## Acceptance criteria

- Columns correctly assigned on ≥95% of stubs
- Ambiguous columns **always** route to review — never auto-accepted
- Review shows both columns side by side for the user to pick
- Payslip reconciliation is exact; failures cannot be dismissed
- Cross-stub YTD breaks detected and name the missing period
- Deduction label mappings persist per employer
- Manually entered fields survive re-parse unchanged
- Parsed values populate the same `income_documents` shape as 04
