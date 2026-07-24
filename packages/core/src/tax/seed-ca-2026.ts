import type { Jurisdiction, ContributionRule } from './types.js';

/**
 * 2026 Canadian tax reference data — federal and Nova Scotia — populated from
 * official sources, cross-checked across CRA/provincial and reputable tax
 * aggregators, and stamped with `verified_on`. These are PLANNING-ESTIMATE
 * inputs, not a filing. Re-verify against CRA before relying on them; the UI
 * surfaces `verified_on` and prompts when it goes stale.
 *
 * Sources (verified 2026-07-24):
 *  - Federal brackets & BPA: CRA current-year rates
 *    https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html
 *  - Nova Scotia brackets & BPA: Government of Nova Scotia
 *    https://www.novascotia.ca/personal-income-tax-rates-and-indexation
 *  - CPP / CPP2 rates & ceilings: CRA
 *    https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html
 *  - EI premium rate & max insurable: CRA
 *    https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html
 */

const FED_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html';
const NS_URL = 'https://www.novascotia.ca/personal-income-tax-rates-and-indexation';
const CPP_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html';
const EI_URL = 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/employment-insurance-ei/ei-premium-rates-maximums.html';
const VERIFIED = '2026-07-24';

export const FEDERAL_2026: Jurisdiction = {
  country: 'CA',
  province: null,
  tax_year: 2026,
  brackets: [
    { upto_minor: 5_852_300, rate: 0.14 },   // ≤ $58,523
    { upto_minor: 11_704_500, rate: 0.205 }, // → $117,045
    { upto_minor: 18_144_000, rate: 0.26 },  // → $181,440
    { upto_minor: 25_848_200, rate: 0.29 },  // → $258,482
    { upto_minor: null, rate: 0.33 },
  ],
  basic_personal_amount_minor: 1_645_200, // $16,452 (≤ $181,440 net income)
  low_income_reduction: null,
  source_url: FED_URL,
  verified_on: VERIFIED,
};

export const NOVA_SCOTIA_2026: Jurisdiction = {
  country: 'CA',
  province: 'NS',
  tax_year: 2026,
  brackets: [
    { upto_minor: 3_099_500, rate: 0.0879 },  // ≤ $30,995
    { upto_minor: 6_199_100, rate: 0.1495 },  // → $61,991
    { upto_minor: 9_741_700, rate: 0.1667 },  // → $97,417
    { upto_minor: 15_712_400, rate: 0.175 },  // → $157,124
    { upto_minor: null, rate: 0.21 },
  ],
  basic_personal_amount_minor: 1_193_200, // $11,932 (reduction eliminated for 2026)
  low_income_reduction: null,             // phases out above low incomes; n/a for typical estimates
  source_url: NS_URL,
  verified_on: VERIFIED,
};

export const CONTRIBUTIONS_2026: ContributionRule[] = [
  {
    tax_year: 2026, kind: 'cpp', rate: 0.0595,
    max_pensionable_minor: 7_460_000, // YMPE $74,600
    exemption_minor: 350_000,          // $3,500 basic exemption
    self_employed_multiplier: 2.0,
    source_url: CPP_URL, verified_on: VERIFIED,
  },
  {
    tax_year: 2026, kind: 'cpp2', rate: 0.04,
    max_pensionable_minor: 8_500_000, // YAMPE $85,000
    exemption_minor: 7_460_000,        // band starts at the first ceiling (YMPE)
    self_employed_multiplier: 2.0,
    source_url: CPP_URL, verified_on: VERIFIED,
  },
  {
    tax_year: 2026, kind: 'ei', rate: 0.0163,
    max_pensionable_minor: 6_890_000, // max insurable $68,900
    exemption_minor: 0,
    self_employed_multiplier: 1.0,     // EI is employment-only unless the user opts in
    source_url: EI_URL, verified_on: VERIFIED,
  },
];

/** Net tax owing (federal, outside Quebec) that triggers required quarterly instalments. */
export const INSTALMENT_THRESHOLD_MINOR = 300_000; // $3,000
export const INSTALMENT_THRESHOLD_SOURCE = 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/paying-your-income-tax-instalments.html';

export function jurisdictionsFor(year: number, province: string): { federal: Jurisdiction; provincial: Jurisdiction } | null {
  if (year === 2026 && province === 'NS') return { federal: FEDERAL_2026, provincial: NOVA_SCOTIA_2026 };
  return null;
}

export function contributionsFor(year: number): ContributionRule[] | null {
  return year === 2026 ? CONTRIBUTIONS_2026 : null;
}
