/**
 * Split remainder logic for the multi-split editor (Feature 03). The remainder
 * invariant — splits must sum to the transaction total — is enforced here
 * client-side for immediate feedback, and again by the deferred DB trigger (01)
 * as the guarantee. This module is the UX half.
 */
import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import { sum, subtract } from '../money/arithmetic.js';

/**
 * What's left to allocate: total − Σ splits. Signed on purpose — the editor
 * shows "+$60.00 left" or "−$5.00 over" rather than an error string, so the
 * user sees direction and magnitude.
 */
export function remainder(total: Minor, splitAmounts: readonly Minor[]): Minor {
  return subtract(total, sum(splitAmounts));
}

/** The editor can save only when nothing is left to allocate. */
export function isBalanced(total: Minor, splitAmounts: readonly Minor[]): boolean {
  return remainder(total, splitAmounts) === 0;
}

/**
 * The amount to prefill the next split row with: whatever remains. Enter $40 of
 * a $100 total and the next row prefills $60. Never negative — an over-allocated
 * total prefills 0 and surfaces via the (negative) remainder instead.
 */
export function prefillNext(total: Minor, splitAmounts: readonly Minor[]): Minor {
  const left = remainder(total, splitAmounts);
  return left > 0 ? left : minor(0);
}
