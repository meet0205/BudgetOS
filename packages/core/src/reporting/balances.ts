/**
 * Account balances derived from the ledger (Feature 03). Balance is opening
 * balance plus the signed effect of every non-deleted transaction. This is the
 * one place transaction `kind` becomes a sign:
 *
 *   expense   → money leaves the account            (−)
 *   income    → money arrives                        (+)
 *   refund    → money comes back                     (+)
 *   transfer  → leaves source, arrives at counterparty (− / +)
 *   adjustment→ a manual correction                  (+ signed amount)
 *
 * Balances use base-currency amounts so mixed-currency accounts still sum.
 */
import type { Minor } from '../money/minor.js';
import { minor } from '../money/minor.js';
import type { Account, TransactionWithSplits } from '../db/types.js';

export function computeBalances(
  accounts: readonly Account[],
  transactions: readonly TransactionWithSplits[],
): Map<string, Minor> {
  const balances = new Map<string, number>();
  for (const a of accounts) balances.set(a.id, a.opening_balance_minor);

  const bump = (accountId: string | null, delta: number) => {
    if (accountId === null || !balances.has(accountId)) return;
    balances.set(accountId, balances.get(accountId)! + delta);
  };

  for (const { transaction: t } of transactions) {
    if (t.deleted_at !== null) continue;
    const amt = t.base_total_minor;
    switch (t.kind) {
      case 'expense':
        bump(t.account_id, -amt);
        break;
      case 'income':
      case 'refund':
        bump(t.account_id, amt);
        break;
      case 'transfer':
        bump(t.account_id, -amt);
        bump(t.counterparty_account_id, amt);
        break;
      case 'adjustment':
        bump(t.account_id, amt);
        break;
    }
  }

  const out = new Map<string, Minor>();
  for (const [id, v] of balances) out.set(id, minor(v));
  return out;
}
