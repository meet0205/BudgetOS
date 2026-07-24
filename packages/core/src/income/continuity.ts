import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { IncomeDocument } from '../db/types.js';

type StubLike = Pick<IncomeDocument, 'pay_date' | 'gross_minor' | 'ytd_gross_minor'>;

export interface ContinuityGap {
  /** The stub after which the sequence breaks. */
  afterPayDate: string;
  /** The stub whose YTD didn't line up. */
  beforePayDate: string;
  /** Gross that appears unaccounted between the two stubs. */
  missingGrossMinor: Minor;
}

export interface ContinuityResult {
  ok: boolean;
  /** True when at least one consecutive pair carried YTD figures to check. */
  checked: boolean;
  gaps: ContinuityGap[];
}

/**
 * Detect gaps in a run of employment stubs using the YTD identity:
 *
 *   stub[n].ytd_gross === stub[n-1].ytd_gross + stub[n].gross
 *
 * A break means a missing stub or a typo. Only consecutive pairs that both
 * carry ytd_gross are checked (YTD is optional to enter). When no pair can be
 * checked, `checked` is false — the caller should note the weaker guarantee
 * (summing entered stubs can't detect one that was never entered).
 */
export function checkContinuity(stubs: StubLike[]): ContinuityResult {
  const withYtd = stubs
    .filter((s) => s.ytd_gross_minor != null)
    .sort((a, b) => a.pay_date.localeCompare(b.pay_date));

  const gaps: ContinuityGap[] = [];
  let checked = false;

  for (let i = 1; i < withYtd.length; i++) {
    const prev = withYtd[i - 1]!;
    const curr = withYtd[i]!;
    checked = true;
    const expected = prev.ytd_gross_minor! + curr.gross_minor;
    if (curr.ytd_gross_minor! !== expected) {
      gaps.push({
        afterPayDate: prev.pay_date,
        beforePayDate: curr.pay_date,
        missingGrossMinor: minor(curr.ytd_gross_minor! - expected),
      });
    }
  }

  return { ok: gaps.length === 0, checked, gaps };
}
