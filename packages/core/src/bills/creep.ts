import type { Minor } from '../money/minor.js';

/** Percent change from previous to current amount (e.g. 71 → 88 ≈ +23.9). */
export function creepPercent(previousMinor: Minor, currentMinor: Minor): number {
  if (previousMinor === 0) return currentMinor === 0 ? 0 : Infinity;
  return ((currentMinor - previousMinor) / previousMinor) * 100;
}

/**
 * A meaningful bill increase — a single jump above the threshold. A 5% rise is
 * noise; a 40% rise or a subscription price hike is worth surfacing (default
 * threshold 20%). Feeds insights (Feature 23).
 */
export function isMeaningfulCreep(percent: number, thresholdPercent = 20): boolean {
  return Number.isFinite(percent) && percent >= thresholdPercent;
}
