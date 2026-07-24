import type { Minor } from '../money/minor.js';
import { INSTALMENT_THRESHOLD_MINOR } from './seed-ca-2026.js';

/**
 * CRA requires quarterly instalments when net tax owing exceeds the threshold
 * (federal, outside Quebec) in the current year and either of the two prior
 * years. The two-prior-years test needs history we may not have, so this checks
 * only the current-year condition and the caller notes the test is incomplete.
 */
export function requiresInstalments(netOwingMinor: Minor, thresholdMinor: number = INSTALMENT_THRESHOLD_MINOR): boolean {
  return netOwingMinor > thresholdMinor;
}

/** Standard CRA instalment due dates for a tax year. */
export function instalmentDueDates(taxYear: number): string[] {
  return [`${taxYear}-03-15`, `${taxYear}-06-15`, `${taxYear}-09-15`, `${taxYear}-12-15`];
}
