import type { Adapter } from '../adapter.js';
import type { Account, AccountKind } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import type { Minor } from '../../money/minor.js';
import { ZERO } from '../../money/minor.js';

export const ACCOUNTS = 'accounts';

export interface NewAccountInput {
  name: string;
  kind: AccountKind;
  currency_code?: string;
  opening_balance_minor?: Minor;
  sort_order?: number;
}

export class AccountRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  async create(userId: UUID, input: NewAccountInput): Promise<Account> {
    const account: Account = {
      id: this.newId(),
      user_id: userId,
      name: input.name,
      kind: input.kind,
      currency_code: input.currency_code ?? 'CAD',
      opening_balance_minor: input.opening_balance_minor ?? ZERO,
      is_archived: false,
      sort_order: input.sort_order ?? 0,
      created_at: this.clock.now(),
      deleted_at: null,
    };
    await this.adapter.insert(ACCOUNTS, account);
    return account;
  }

  /**
   * User's accounts, newest sort first. Archived accounts are hidden from
   * pickers by default but remain available (includeArchived) for history.
   */
  async list(userId: UUID, includeArchived = false): Promise<Account[]> {
    const all = await this.adapter.all<Account>(ACCOUNTS);
    return all
      .filter((a) => a.user_id === userId && a.deleted_at === null)
      .filter((a) => (includeArchived ? true : !a.is_archived))
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  async setArchived(userId: UUID, id: UUID, archived: boolean): Promise<void> {
    const account = await this.adapter.get<Account>(ACCOUNTS, id);
    if (!account || account.user_id !== userId) throw new Error(`account ${id} not found`);
    await this.adapter.update<Account>(ACCOUNTS, id, { is_archived: archived });
  }
}
