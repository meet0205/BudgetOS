/**
 * Money is represented as integer minor units (cents). No floats in the money
 * path — division happens only at the display boundary (`format`).
 *
 * `Minor` is a branded number so accidental float arithmetic (`a * b`, `a / b`)
 * on money values is caught by review/lint. All sanctioned math lives in
 * `arithmetic.ts`.
 */
export type Minor = number & { readonly __brand: 'minor' };

/** Zero, typed as Minor. */
export const ZERO = 0 as Minor;

/**
 * Assert/brand a raw integer as Minor. Throws on non-integers so a stray float
 * never enters the money path unnoticed.
 */
export function minor(cents: number): Minor {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`minor: expected an integer number of cents, got ${cents}`);
  }
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`minor: ${cents} exceeds safe integer range`);
  }
  return cents as Minor;
}

/**
 * Parse a human-entered major-unit string (e.g. "1,234.56", "-5.2", "$3")
 * into integer cents. Rounds half-up at the third decimal. Tolerates a leading
 * currency symbol, thousands separators, surrounding whitespace, and a sign.
 *
 * Throws on anything it cannot parse — silent coercion of bad input is how
 * financial data gets quietly corrupted.
 */
export function toMinor(major: string): Minor {
  if (typeof major !== 'string') {
    throw new TypeError(`toMinor: expected a string, got ${typeof major}`);
  }
  const cleaned = major.trim().replace(/[$\s,]/g, '');
  const m = /^([+-]?)(\d*)(?:\.(\d+))?$/.exec(cleaned);
  if (!m || (m[2] === '' && (m[3] === undefined || m[3] === ''))) {
    throw new RangeError(`toMinor: cannot parse "${major}" as a money amount`);
  }
  const sign = m[1] === '-' ? -1 : 1;
  const wholeRaw = m[2] ?? '';
  const whole = wholeRaw === '' ? 0 : parseInt(wholeRaw, 10);

  // Pad the fraction to 3 digits: two for cents, one to decide rounding.
  const fracPadded = ((m[3] ?? '') + '000').slice(0, 3);
  let cents = parseInt(fracPadded.slice(0, 2), 10);
  if (parseInt(fracPadded.slice(2, 3), 10) >= 5) cents += 1;

  return minor(sign * (whole * 100 + cents));
}

/** Convert cents to a plain major-unit number. Display boundary only. */
export function toMajorNumber(m: Minor): number {
  return m / 100;
}

/**
 * Format cents as a localised currency string, e.g. `$1,234.56` for CAD.
 * This is the display boundary — the only place division by 100 is expected.
 */
export function format(m: Minor, currency = 'CAD', locale = 'en-CA'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(m / 100);
}
