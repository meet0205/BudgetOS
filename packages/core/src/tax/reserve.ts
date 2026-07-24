import { minor, type Minor } from '../money/minor.js';

export const DEFAULT_RESERVE_MULTIPLIER = 1.1;

/**
 * Reserve target = max(0, shortfall) × multiplier. The failure modes are
 * asymmetric — over-reserving yields an April surplus, under-reserving means
 * finding cash already spent — so the multiplier defaults high (PRD 05).
 */
export function reserveTarget(shortfallMinor: Minor, multiplier = DEFAULT_RESERVE_MULTIPLIER): Minor {
  return minor(Math.max(0, Math.round(shortfallMinor * multiplier)));
}
