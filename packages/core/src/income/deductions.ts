import type { DeductionKind } from '../db/types.js';

/** Plain-language labels for the controlled deduction vocabulary. */
export const DEDUCTION_LABELS: Record<DeductionKind, string> = {
  federal_tax: 'Federal tax',
  provincial_tax: 'Provincial tax',
  cpp: 'CPP',
  cpp2: 'CPP2',
  ei: 'EI',
  qpp: 'QPP',
  qpip: 'QPIP',
  rpp: 'Registered pension (RPP)',
  rrsp: 'RRSP',
  union_dues: 'Union dues',
  group_benefits: 'Group benefits',
  life_insurance: 'Life insurance',
  ltd: 'Long-term disability',
  garnishment: 'Garnishment',
  other: 'Other',
};

/** Order shown in the picker — the common payroll lines first. */
export const DEDUCTION_ORDER: DeductionKind[] = [
  'federal_tax', 'provincial_tax', 'cpp', 'cpp2', 'ei', 'qpp', 'qpip',
  'rpp', 'rrsp', 'union_dues', 'group_benefits', 'life_insurance', 'ltd',
  'garnishment', 'other',
];

/**
 * Deductions that affect the tax estimate (Feature 05):
 *   - federal_tax / provincial_tax feed the "already withheld" side
 *   - cpp / ei feed contribution tracking against annual maximums
 * Everything else is recorded but does not change the estimate.
 */
const TAX_FEEDING = new Set<DeductionKind>(['federal_tax', 'provincial_tax', 'cpp', 'ei']);

export function feedsTax(kind: DeductionKind): boolean {
  return TAX_FEEDING.has(kind);
}
