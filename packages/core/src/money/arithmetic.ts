/**
 * The ONLY sanctioned place for arithmetic on `Minor` values. Everything here
 * operates on integer cents and returns integer cents. Any `*` or `/` on money
 * elsewhere in the codebase is a bug.
 */
import { minor, type Minor } from './minor.js';

/** Sum any number of Minor values. */
export function add(...values: Minor[]): Minor {
  let acc = 0;
  for (const v of values) acc += v;
  return minor(acc);
}

/** Sum an array of Minor values. */
export function sum(values: readonly Minor[]): Minor {
  let acc = 0;
  for (const v of values) acc += v;
  return minor(acc);
}

/** a - b. */
export function subtract(a: Minor, b: Minor): Minor {
  return minor(a - b);
}

/** Flip sign — used for the negative leg of a transfer or a refund split. */
export function negate(a: Minor): Minor {
  return minor(-a);
}

/** Absolute value. */
export function abs(a: Minor): Minor {
  return minor(Math.abs(a));
}

/** Multiply by an integer count (e.g. quantity). Non-integers are rejected. */
export function scale(a: Minor, factor: number): Minor {
  if (!Number.isInteger(factor)) {
    throw new RangeError(`scale: factor must be an integer, got ${factor}`);
  }
  return minor(a * factor);
}

/**
 * A percentage of an amount, rounded half-up to the nearest cent. Used for
 * business-use portions, HST, and tax rates. `percent` is a plain number
 * (e.g. 13 for 13%, 5.05 for 5.05%).
 */
export function percentage(a: Minor, percent: number): Minor {
  // Scale to avoid float drift: work in hundredths of a percent, round once.
  const scaled = Math.round((a * percent) / 100);
  return minor(scaled);
}

/**
 * Split an amount across integer-weighted parts so the parts always sum back to
 * the original — the leftover cents from rounding are distributed one-per-part
 * to the earliest parts (largest-remainder). Essential for the split ledger:
 * splitting $10.00 three ways yields [334, 333, 333], summing to exactly 1000.
 */
export function allocate(a: Minor, weights: readonly number[]): Minor[] {
  if (weights.length === 0) {
    throw new RangeError('allocate: need at least one weight');
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new RangeError('allocate: weights must be non-negative integers');
  }
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight === 0) {
    throw new RangeError('allocate: weights sum to zero');
  }

  const parts: number[] = [];
  let distributed = 0;
  for (const w of weights) {
    // Truncate toward zero so the running remainder is always non-negative
    // for positive `a` (and non-positive for negative `a`).
    const part = Math.trunc((a * w) / totalWeight);
    parts.push(part);
    distributed += part;
  }

  // Hand out the remaining cents one at a time, in weight order.
  let remainder = a - distributed;
  const step = remainder >= 0 ? 1 : -1;
  let i = 0;
  while (remainder !== 0) {
    // Skip zero-weight parts so they never receive a stray cent.
    if (weights[i % weights.length]! > 0) {
      parts[i % weights.length]! += step;
      remainder -= step;
    }
    i += 1;
  }

  return parts.map((p) => minor(p));
}
