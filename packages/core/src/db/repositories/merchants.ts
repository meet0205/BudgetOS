import type { Adapter } from '../adapter.js';
import type { Merchant } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import { normalizeMerchantName } from '../../merchants/normalize.js';
import { rankBySimilarity } from '../../merchants/match.js';

export const MERCHANTS = 'merchants';

export interface MerchantSuggestion {
  merchant: Merchant;
  score: number;
}

export class MerchantRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  /** A user's non-deleted merchants, most-used first. */
  async list(userId: UUID): Promise<Merchant[]> {
    const all = await this.adapter.all<Merchant>(MERCHANTS);
    return all
      .filter((m) => m.user_id === userId && m.deleted_at === null)
      .sort(
        (a, b) =>
          b.transaction_count - a.transaction_count || a.name.localeCompare(b.name),
      );
  }

  /** Exact match on normalized name (the unique key), or null. */
  async findByName(userId: UUID, name: string): Promise<Merchant | null> {
    const normalized = normalizeMerchantName(name);
    if (!normalized) return null;
    const all = await this.adapter.all<Merchant>(MERCHANTS);
    return (
      all.find(
        (m) =>
          m.user_id === userId &&
          m.deleted_at === null &&
          m.normalized_name === normalized,
      ) ?? null
    );
  }

  /**
   * Fuzzy autocomplete. Ranks a user's merchants by trigram similarity to the
   * typed fragment — the local mirror of the gin_trgm index query in 09.
   */
  async suggest(userId: UUID, query: string, limit = 8): Promise<MerchantSuggestion[]> {
    if (!query.trim()) {
      const recent = (await this.list(userId)).slice(0, limit);
      return recent.map((merchant) => ({ merchant, score: 0 }));
    }
    const merchants = await this.list(userId);
    return rankBySimilarity(query, merchants, (m) => m.name, 0.3)
      .slice(0, limit)
      .map(({ item, score }) => ({ merchant: item, score }));
  }

  /**
   * Resolve a typed merchant name to a row at save time — find the existing one
   * or create it. Never called on keystroke, so abandoned entries never leave a
   * merchant behind. Bumps usage so autocomplete learns frequency.
   */
  async resolveOnSave(
    userId: UUID,
    name: string,
    options: { defaultCategoryId?: UUID | null } = {},
  ): Promise<Merchant | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;

    const existing = await this.findByName(userId, trimmed);
    const now = this.clock.now();
    if (existing) {
      await this.adapter.update<Merchant>(MERCHANTS, existing.id, {
        transaction_count: existing.transaction_count + 1,
        last_seen_at: now,
      });
      return { ...existing, transaction_count: existing.transaction_count + 1, last_seen_at: now };
    }

    const merchant: Merchant = {
      id: this.newId(),
      user_id: userId,
      name: trimmed,
      normalized_name: normalizeMerchantName(trimmed),
      chain_id: null,
      default_category_id: options.defaultCategoryId ?? null,
      transaction_count: 1,
      last_seen_at: now,
      created_at: now,
      deleted_at: null,
    };
    await this.adapter.insert(MERCHANTS, merchant);
    return merchant;
  }

  /** Set the category a merchant prefills — how correcting a category teaches (12). */
  async setDefaultCategory(userId: UUID, id: UUID, categoryId: UUID | null): Promise<void> {
    const merchant = await this.adapter.get<Merchant>(MERCHANTS, id);
    if (!merchant || merchant.user_id !== userId) throw new Error(`merchant ${id} not found`);
    await this.adapter.update<Merchant>(MERCHANTS, id, { default_category_id: categoryId });
  }
}
