import { minor, type Minor } from '../money/minor.js';
import type { Bracket, Jurisdiction } from './types.js';

/**
 * Progressive tax on an income across a bracket set. `Math.round` is applied per
 * band, not once at the end — this matches how CRA computes and avoids a cent of
 * drift per band (PRD 05).
 */
export function taxOn(incomeMinor: Minor, brackets: Bracket[]): Minor {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const ceiling = b.upto_minor ?? Infinity;
    if (incomeMinor <= prev) break;
    const inBand = Math.min(incomeMinor, ceiling) - prev;
    tax += Math.round(inBand * b.rate);
    prev = ceiling;
  }
  return minor(tax);
}

/**
 * Income tax for a jurisdiction after the basic personal amount credit. The BPA
 * is a non-refundable credit worth BPA × the lowest bracket rate, floored at
 * zero. Credits, deductions, and spousal transfers are out of scope (estimate).
 */
export function jurisdictionTax(incomeMinor: Minor, jur: Jurisdiction): Minor {
  const gross = taxOn(incomeMinor, jur.brackets);
  const lowestRate = jur.brackets[0]?.rate ?? 0;
  const credit = Math.round(jur.basic_personal_amount_minor * lowestRate);
  return minor(Math.max(0, gross - credit));
}
