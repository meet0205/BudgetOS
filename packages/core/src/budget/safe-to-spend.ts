import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { FundingResult } from './allocate.js';
import { daysRemaining, type Period } from './period.js';

export interface SafeToSpend {
  incomeMinor: Minor;
  allocatedMinor: Minor;     // buckets excluding the reserve
  taxReservedMinor: Minor;
  spentMinor: Minor;
  safeToSpendMinor: Minor;   // may be negative when overspent/over-allocated
  dailyMinor: Minor;         // safe-to-spend ÷ days remaining
  daysRemaining: number;
}

/**
 * safe_to_spend = income − allocated − tax reserved − spent (PRD 06 step 6).
 * The daily figure divides the remaining safe-to-spend across the days left in
 * the period, so overspending today visibly shrinks tomorrow's number.
 */
export function computeSafeToSpend(args: {
  incomeMinor: Minor;
  funding: FundingResult;
  spentMinor: Minor;
  period: Period;
  asOfISO: string;
}): SafeToSpend {
  const { incomeMinor, funding, spentMinor, period, asOfISO } = args;
  const safe = incomeMinor - funding.allocatedMinor - funding.taxReservedMinor - spentMinor;
  const days = daysRemaining(period, asOfISO);
  // Truncate toward zero: a positive daily figure never over-promises.
  const daily = Math.trunc(safe / days);
  return {
    incomeMinor,
    allocatedMinor: funding.allocatedMinor,
    taxReservedMinor: funding.taxReservedMinor,
    spentMinor,
    safeToSpendMinor: minor(safe),
    dailyMinor: minor(daily),
    daysRemaining: days,
  };
}
