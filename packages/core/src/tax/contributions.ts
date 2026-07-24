import { minor, type Minor } from '../money/minor.js';
import type { ContributionRule } from './types.js';

/** Max annual employee CPP contribution: (YMPE − exemption) × rate. */
export function cppEmploymentMax(cpp: ContributionRule): Minor {
  const pensionable = (cpp.max_pensionable_minor ?? 0) - (cpp.exemption_minor ?? 0);
  return minor(Math.round(pensionable * cpp.rate));
}

/**
 * CPP on self-employment net income: (min(net, YMPE) − exemption) × rate × 2.
 * The self-employed pay both halves — a large, surprising number shown on its
 * own line, never folded into a total (PRD 05).
 */
export function cppSelfEmployed(netMinor: Minor, cpp: ContributionRule): Minor {
  const ceiling = cpp.max_pensionable_minor ?? Infinity;
  const exemption = cpp.exemption_minor ?? 0;
  const pensionable = Math.max(0, Math.min(netMinor, ceiling) - exemption);
  return minor(Math.round(pensionable * cpp.rate * cpp.self_employed_multiplier));
}

/** Max annual employee EI premium: max insurable × rate. */
export function eiEmploymentMax(ei: ContributionRule): Minor {
  return minor(Math.round((ei.max_pensionable_minor ?? 0) * ei.rate));
}

/**
 * CPP2 (second additional) on the earnings slice [base, base+amount] that falls
 * within [YMPE, YAMPE]. For self-employment stacked on top of employment, pass
 * base = employment earnings so only the portion above the first ceiling counts.
 */
export function cpp2OnSlice(baseMinor: Minor, amountMinor: Minor, cpp2: ContributionRule, selfEmployed: boolean): Minor {
  const floor = cpp2.exemption_minor ?? 0;             // YMPE (first ceiling)
  const ceiling = cpp2.max_pensionable_minor ?? Infinity; // YAMPE
  const sliceLo = Math.max(baseMinor, floor);
  const sliceHi = Math.min(baseMinor + amountMinor, ceiling);
  const band = Math.max(0, sliceHi - sliceLo);
  const mult = selfEmployed ? cpp2.self_employed_multiplier : 1;
  return minor(Math.round(band * cpp2.rate * mult));
}

/** Cap a contribution at its annual maximum. */
export function capAt(amountMinor: Minor, maxMinor: Minor): Minor {
  return minor(Math.min(amountMinor, maxMinor));
}

export function findRule(rules: ContributionRule[], kind: ContributionRule['kind']): ContributionRule | undefined {
  return rules.find((r) => r.kind === kind);
}
