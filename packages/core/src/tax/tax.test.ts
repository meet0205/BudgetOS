import { describe, it, expect } from 'vitest';
import { toMinor, minor } from '../money/minor.js';
import { taxOn, jurisdictionTax } from './brackets.js';
import { cppSelfEmployed, cpp2OnSlice, cppEmploymentMax, eiEmploymentMax, capAt } from './contributions.js';
import { reserveTarget } from './reserve.js';
import { requiresInstalments, instalmentDueDates } from './instalments.js';
import { computeTaxEstimate } from './estimate.js';
import { FEDERAL_2026, NOVA_SCOTIA_2026, CONTRIBUTIONS_2026 } from './seed-ca-2026.js';
import type { IncomeWithDeductions } from '../db/types.js';

describe('progressive brackets (2026 federal)', () => {
  it('applies rates band by band with per-band rounding', () => {
    // $60,000: 14% of 58,523 + 20.5% of 1,477 = 8,193.22 + 302.79 = 8,496.01
    expect(taxOn(toMinor('60000.00'), FEDERAL_2026.brackets)).toBe(toMinor('8496.01'));
  });
  it('is zero below the first cent of income', () => {
    expect(taxOn(minor(0), FEDERAL_2026.brackets)).toBe(0);
  });
  it('subtracts the basic personal amount credit at the lowest rate', () => {
    // 8,496.01 − (16,452 × 14%) = 8,496.01 − 2,303.28 = 6,192.73
    expect(jurisdictionTax(toMinor('60000.00'), FEDERAL_2026)).toBe(toMinor('6192.73'));
  });
});

describe('progressive brackets (2026 Nova Scotia)', () => {
  it('computes NS tax after BPA for $60,000', () => {
    // 8.79% of 30,995 + 14.95% of 29,005 = 2,724.46 + 4,336.25 = 7,060.71
    // credit 11,932 × 8.79% = 1,048.82 → 7,060.71 − 1,048.82 = 6,011.89
    expect(jurisdictionTax(toMinor('60000.00'), NOVA_SCOTIA_2026)).toBe(toMinor('6011.89'));
  });
});

describe('contributions (2026)', () => {
  const cpp = CONTRIBUTIONS_2026.find((c) => c.kind === 'cpp')!;
  const cpp2 = CONTRIBUTIONS_2026.find((c) => c.kind === 'cpp2')!;
  const ei = CONTRIBUTIONS_2026.find((c) => c.kind === 'ei')!;

  it('doubles CPP on self-employment net', () => {
    // ($10,000 − $3,500) × 5.95% × 2 = 6,500 × 0.0595 × 2 = 773.50
    expect(cppSelfEmployed(toMinor('10000.00'), cpp)).toBe(toMinor('773.50'));
  });
  it('caps self-employed CPP at the pensionable ceiling', () => {
    // (74,600 − 3,500) × 5.95% × 2 = 71,100 × 0.0595 × 2 = 8,460.90
    expect(cppSelfEmployed(toMinor('200000.00'), cpp)).toBe(toMinor('8460.90'));
  });
  it('computes CPP2 only on the slice within [YMPE, YAMPE]', () => {
    // SE $10k stacked on $70k employment → slice [74,600, 80,000] = 5,400 × 4% × 2 = 432.00
    expect(cpp2OnSlice(toMinor('70000.00'), toMinor('10000.00'), cpp2, true)).toBe(toMinor('432.00'));
    // entirely below YMPE → no CPP2
    expect(cpp2OnSlice(toMinor('20000.00'), toMinor('10000.00'), cpp2, true)).toBe(0);
  });
  it('exposes the annual maximums', () => {
    expect(cppEmploymentMax(cpp)).toBe(toMinor('4230.45')); // (74,600−3,500)×5.95%
    expect(eiEmploymentMax(ei)).toBe(toMinor('1123.07'));   // 68,900×1.63%
    expect(capAt(toMinor('9999.00'), cppEmploymentMax(cpp))).toBe(toMinor('4230.45'));
  });
});

describe('reserve & instalments', () => {
  it('reserves shortfall × multiplier, floored at zero', () => {
    expect(reserveTarget(toMinor('1000.00'), 1.1)).toBe(toMinor('1100.00'));
    expect(reserveTarget(toMinor('-500.00'), 1.1)).toBe(0); // refund → nothing to reserve
  });
  it('flags instalments above the $3,000 threshold', () => {
    expect(requiresInstalments(toMinor('3000.01'))).toBe(true);
    expect(requiresInstalments(toMinor('2999.99'))).toBe(false);
    expect(instalmentDueDates(2026)).toEqual(['2026-03-15', '2026-06-15', '2026-09-15', '2026-12-15']);
  });
});

describe('computeTaxEstimate', () => {
  const emp = (gross: string, net: string, ded: [string, string][]): IncomeWithDeductions => ({
    document: {
      id: 'e', user_id: 'u', doc_type: 'manual', income_kind: 'employment', source_file_id: null,
      employer_name: 'Employer', employer_id: null, period_start: null, period_end: null,
      pay_date: '2026-06-30', tax_year: 2026, province: 'NS',
      gross_minor: toMinor(gross), net_minor: toMinor(net), ytd_gross_minor: null, ytd_net_minor: null,
      platform_fees_minor: minor(0), hst_collected_minor: minor(0), currency_code: 'CAD',
      is_user_entered: true, reconciles: true, created_at: '', updated_at: '', deleted_at: null,
    },
    deductions: ded.map(([kind, amt], i) => ({
      id: `d${i}`, income_document_id: 'e', user_id: 'u', kind: kind as any,
      raw_label: null, amount_minor: toMinor(amt), ytd_amount_minor: null, is_user_entered: true,
    })),
  });
  const se = (gross: string, fees: string): IncomeWithDeductions => ({
    document: {
      id: 's', user_id: 'u', doc_type: 'manual', income_kind: 'self_employment', source_file_id: null,
      employer_name: 'Uber', employer_id: null, period_start: null, period_end: null,
      pay_date: '2026-06-30', tax_year: 2026, province: 'NS',
      gross_minor: toMinor(gross), net_minor: null, ytd_gross_minor: null, ytd_net_minor: null,
      platform_fees_minor: toMinor(fees), hst_collected_minor: minor(0), currency_code: 'CAD',
      is_user_entered: true, reconciles: true, created_at: '', updated_at: '', deleted_at: null,
    },
    deductions: [],
  });

  const base = { taxYear: 2026, province: 'NS', asOf: '2026-06-30', federal: FEDERAL_2026, provincial: NOVA_SCOTIA_2026, contributions: CONTRIBUTIONS_2026, annualise: false as const };

  it('taxes self-employment on combined income and reserves the SE gap', () => {
    // Employment $50k (withheld $6k income tax), self-employment net $10k → combined $60k.
    const est = computeTaxEstimate({
      ...base,
      incomes: [emp('50000.00', '44000.00', [['federal_tax', '4000.00'], ['provincial_tax', '2000.00'], ['cpp', '2500.00'], ['ei', '800.00']]), se('12000.00', '2000.00')],
    });
    expect(est.projectedAnnualMinor).toBe(toMinor('60000.00'));
    expect(est.estFederalTaxMinor).toBe(toMinor('6192.73'));   // combined, not SE in isolation
    expect(est.estProvincialTaxMinor).toBe(toMinor('6011.89'));
    expect(est.estCppSelfEmployedMinor).toBe(toMinor('773.50')); // ($10k−$3.5k)×5.95%×2, own line
    // shortfall = fed + prov + seCpp + seCpp2 − withheld(6000) = 6192.73+6011.89+773.50+0−6000 = 6978.12
    expect(est.shortfallMinor).toBe(toMinor('6978.12'));
    expect(est.reserveTargetMinor).toBe(toMinor('7675.93')); // ×1.10 → round(767812)=7675.93... see below
    expect(est.requiresInstalments).toBe(true);
    expect(est.verifiedOn).toBe('2026-07-24');
  });

  it('excludes unbalanced (reconciles=false) income documents', () => {
    const bad = se('99999.00', '0.00');
    bad.document.reconciles = false;
    const est = computeTaxEstimate({ ...base, incomes: [bad] });
    expect(est.projectedAnnualMinor).toBe(0);
  });
});
