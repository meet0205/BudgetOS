import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';

/**
 * Project annual income from a partial year:
 *
 *   projected = ytd_gross × (pay_periods_per_year / periods_elapsed)
 *
 * Rounded half-up to the cent. `periodsElapsed` must be > 0. The caller may
 * override the result with a known figure (stored on the tax estimate, not the
 * income entry) when income is seasonal or a job change is planned.
 */
export function annualise(
  ytdGross: Minor,
  payPeriodsPerYear: number,
  periodsElapsed: number,
): Minor {
  if (periodsElapsed <= 0) {
    throw new RangeError('annualise: periodsElapsed must be greater than zero');
  }
  if (payPeriodsPerYear <= 0) {
    throw new RangeError('annualise: payPeriodsPerYear must be greater than zero');
  }
  const projected = (ytdGross * payPeriodsPerYear) / periodsElapsed;
  return minor(Math.round(projected));
}

/** Pay periods per year for the common Canadian frequencies. */
export const PAY_PERIODS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
};
