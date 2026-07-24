import { minor, ZERO, type Minor } from '../money/minor.js';
import type { IncomeWithDeductions } from '../db/types.js';
import type { Jurisdiction, ContributionRule } from './types.js';
import { jurisdictionTax } from './brackets.js';
import { cppEmploymentMax, cppSelfEmployed, eiEmploymentMax, cpp2OnSlice, capAt, findRule } from './contributions.js';
import { reserveTarget, DEFAULT_RESERVE_MULTIPLIER } from './reserve.js';
import { requiresInstalments } from './instalments.js';

export interface TaxEstimate {
  taxYear: number;
  province: string;
  asOf: string;
  employmentGrossMinor: Minor;
  selfEmploymentNetMinor: Minor;
  otherIncomeMinor: Minor;
  projectedAnnualMinor: Minor;
  estFederalTaxMinor: Minor;
  estProvincialTaxMinor: Minor;
  estCppEmploymentMinor: Minor;
  estCppSelfEmployedMinor: Minor; // the doubled self-employed CPP — its own line
  estCpp2Minor: Minor;
  estEiMinor: Minor;
  totalLiabilityMinor: Minor;
  alreadyWithheldMinor: Minor;    // income tax withheld (projected)
  shortfallMinor: Minor;          // net owing at filing (may be negative = refund)
  reserveMultiplier: number;
  reserveTargetMinor: Minor;
  requiresInstalments: boolean;
  verifiedOn: string;
  sources: { label: string; url: string }[];
}

/** YTD → projected-annual factor from the day of year (linear projection). */
export function annualFactorForDate(asOfISO: string): number {
  const [y, m, d] = asOfISO.slice(0, 10).split('-').map((n) => parseInt(n, 10)) as [number, number, number];
  const dayOfYear = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
  const yearDays = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  return dayOfYear > 0 ? yearDays / dayOfYear : 1;
}

/**
 * A full tax-position estimate, recomputed from scratch (never patched). Self-
 * employment is always taxed on combined income at the marginal rate; employment
 * CPP/EI are payroll-remitted and net out of the shortfall, leaving income-tax
 * under-withholding + self-employed CPP as what must be reserved. Unbalanced
 * income documents (reconciles = false) are excluded. Every figure is a planning
 * estimate — this never states what the user owes CRA.
 */
export function computeTaxEstimate(args: {
  incomes: IncomeWithDeductions[];
  taxYear: number;
  province: string;
  asOf: string;
  federal: Jurisdiction;
  provincial: Jurisdiction;
  contributions: ContributionRule[];
  reserveMultiplier?: number;
  annualOverrideMinor?: Minor | null;
  annualise?: boolean;
}): TaxEstimate {
  const { incomes, taxYear, province, asOf, federal, provincial, contributions } = args;
  const multiplier = args.reserveMultiplier ?? DEFAULT_RESERVE_MULTIPLIER;
  const f = args.annualise === false ? 1 : annualFactorForDate(asOf);

  const rec = incomes.filter(
    (r) => r.document.reconciles && r.document.tax_year === taxYear && r.document.deleted_at === null,
  );

  let empGrossYtd = 0, seNetYtd = 0, otherYtd = 0;
  let withheldTaxYtd = 0, empCppYtd = 0, empEiYtd = 0;
  for (const { document: doc, deductions } of rec) {
    if (doc.income_kind === 'employment') empGrossYtd += doc.gross_minor;
    else if (doc.income_kind === 'self_employment') seNetYtd += doc.gross_minor - doc.platform_fees_minor;
    else otherYtd += doc.gross_minor;
    for (const d of deductions) {
      if (d.kind === 'federal_tax' || d.kind === 'provincial_tax') withheldTaxYtd += d.amount_minor;
      else if (d.kind === 'cpp') empCppYtd += d.amount_minor;
      else if (d.kind === 'ei') empEiYtd += d.amount_minor;
    }
  }

  const empGross = minor(Math.round(empGrossYtd * f));
  const seNet = minor(Math.round(seNetYtd * f));
  const other = minor(Math.round(otherYtd * f));
  const combined = args.annualOverrideMinor ?? minor(empGross + seNet + other);
  const withheld = minor(Math.round(withheldTaxYtd * f));

  const fedTax = jurisdictionTax(combined, federal);
  const provTax = jurisdictionTax(combined, provincial);

  const cppRule = findRule(contributions, 'cpp');
  const cpp2Rule = findRule(contributions, 'cpp2');
  const eiRule = findRule(contributions, 'ei');

  const empCpp = cppRule ? capAt(minor(Math.round(empCppYtd * f)), cppEmploymentMax(cppRule)) : ZERO;
  const empEi = eiRule ? capAt(minor(Math.round(empEiYtd * f)), eiEmploymentMax(eiRule)) : ZERO;
  const seCpp = cppRule ? cppSelfEmployed(seNet, cppRule) : ZERO;
  const seCpp2 = cpp2Rule ? cpp2OnSlice(empGross, seNet, cpp2Rule, true) : ZERO;

  const totalLiability = minor(fedTax + provTax + empCpp + seCpp + seCpp2 + empEi);
  // Payroll-remitted amounts (income tax withheld + employment CPP/EI) are already
  // paid; the shortfall is income-tax under-withholding + self-employed CPP/CPP2.
  const shortfall = minor(fedTax + provTax + seCpp + seCpp2 - withheld);
  const reserve = reserveTarget(shortfall, multiplier);

  const verifiedOn = [federal.verified_on, provincial.verified_on, ...contributions.map((c) => c.verified_on)]
    .sort()[0]!;
  const sources = [
    { label: 'Federal brackets & BPA', url: federal.source_url },
    { label: `${province} brackets & BPA`, url: provincial.source_url },
    { label: 'CPP / CPP2', url: cppRule?.source_url ?? '' },
    { label: 'EI', url: eiRule?.source_url ?? '' },
  ].filter((s) => s.url);

  return {
    taxYear, province, asOf,
    employmentGrossMinor: empGross,
    selfEmploymentNetMinor: seNet,
    otherIncomeMinor: other,
    projectedAnnualMinor: minor(combined),
    estFederalTaxMinor: fedTax,
    estProvincialTaxMinor: provTax,
    estCppEmploymentMinor: empCpp,
    estCppSelfEmployedMinor: seCpp,
    estCpp2Minor: seCpp2,
    estEiMinor: empEi,
    totalLiabilityMinor: totalLiability,
    alreadyWithheldMinor: withheld,
    shortfallMinor: shortfall,
    reserveMultiplier: multiplier,
    reserveTargetMinor: reserve,
    requiresInstalments: requiresInstalments(shortfall),
    verifiedOn,
    sources,
  };
}
