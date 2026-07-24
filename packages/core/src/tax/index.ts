export type { Bracket, Jurisdiction, ContributionRule, ContributionKind } from './types.js';
export { taxOn, jurisdictionTax } from './brackets.js';
export {
  cppEmploymentMax, cppSelfEmployed, eiEmploymentMax, cpp2OnSlice, capAt, findRule,
} from './contributions.js';
export { reserveTarget, DEFAULT_RESERVE_MULTIPLIER } from './reserve.js';
export { requiresInstalments, instalmentDueDates } from './instalments.js';
export { computeTaxEstimate, annualFactorForDate, type TaxEstimate } from './estimate.js';
export {
  FEDERAL_2026, NOVA_SCOTIA_2026, CONTRIBUTIONS_2026,
  INSTALMENT_THRESHOLD_MINOR, INSTALMENT_THRESHOLD_SOURCE,
  jurisdictionsFor, contributionsFor,
} from './seed-ca-2026.js';
