/**
 * Tax reference data. Rates change annually and are indexed to inflation, so
 * values are populated from CRA/provincial sources with provenance, never
 * hardcoded from memory (PRD 05). Resolution is always by the year income was
 * *earned*. Every figure this feature displays is a planning estimate — the app
 * never states what the user owes CRA.
 */

export interface Bracket {
  /** Upper bound of the band in cents; null for the top band. */
  upto_minor: number | null;
  /** Marginal rate as a decimal (e.g. 0.14 for 14%). */
  rate: number;
}

export interface Jurisdiction {
  country: string;       // 'CA'
  province: string | null; // null = federal
  tax_year: number;
  brackets: Bracket[];
  basic_personal_amount_minor: number;
  low_income_reduction: unknown | null;
  source_url: string;
  verified_on: string; // yyyy-mm-dd
}

export type ContributionKind = 'cpp' | 'cpp2' | 'ei';

export interface ContributionRule {
  tax_year: number;
  kind: ContributionKind;
  rate: number;
  /** Upper earnings ceiling in cents (YMPE / YAMPE / max insurable). */
  max_pensionable_minor: number | null;
  /** Lower floor in cents (CPP basic exemption; CPP2 uses the first ceiling). */
  exemption_minor: number | null;
  self_employed_multiplier: number;
  source_url: string;
  verified_on: string;
}
