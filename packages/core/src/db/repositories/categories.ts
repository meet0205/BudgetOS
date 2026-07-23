import type { Adapter } from '../adapter.js';
import type { Category, CategoryLayer, TransactionSplit } from '../types.js';
import { type Clock, systemClock } from '../clock.js';
import { newId as defaultNewId, type UUID } from '../ids.js';
import { caSeedRows } from '../../categories/seed-ca.js';
import { wouldExceedDepth } from '../../categories/tree.js';
import { TRANSACTION_SPLITS } from './transactions.js';

export const CATEGORIES = 'categories';
export const CATEGORY_MERGES = 'category_merges';

const SYSTEM_USER: null = null;

export interface NewCategoryInput {
  layer: CategoryLayer;
  slug: string;
  display_name: string;
  parent_id?: UUID | null;
  icon?: string | null;
  color?: string | null;
  business_expense_kind?: string | null;
  sort_order?: number;
}

export class CategoryRepository {
  private readonly newId: () => UUID;
  private readonly clock: Clock;

  constructor(
    private readonly adapter: Adapter,
    options: { clock?: Clock; newId?: () => UUID } = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.newId = options.newId ?? defaultNewId;
  }

  private async allRows(): Promise<Category[]> {
    return this.adapter.all<Category>(CATEGORIES);
  }

  /**
   * Insert the Canadian system taxonomy (user_id NULL, is_system true).
   * Idempotent: skips any (layer, slug) that already exists. Returns count added.
   */
  async seedSystemCategories(): Promise<number> {
    const existing = await this.allRows();
    const have = new Set(existing.filter((c) => c.is_system).map((c) => `${c.layer}:${c.slug}`));
    const rows = caSeedRows();
    const now = this.clock.now();

    // Assign ids up front so parent_slug can resolve to parent_id.
    const idBySlug = new Map<string, UUID>();
    for (const r of rows) idBySlug.set(`${r.layer}:${r.slug}`, this.newId());

    let added = 0;
    await this.adapter.tx(async (a) => {
      for (const r of rows) {
        const key = `${r.layer}:${r.slug}`;
        if (have.has(key)) continue;
        const category: Category = {
          id: idBySlug.get(key)!,
          user_id: SYSTEM_USER,
          layer: r.layer,
          slug: r.slug,
          display_name: r.display_name,
          parent_id: r.parent_slug ? (idBySlug.get(`${r.layer}:${r.parent_slug}`) ?? null) : null,
          icon: null,
          color: null,
          is_system: true,
          is_hidden: false,
          business_expense_kind: r.business_expense_kind,
          sort_order: r.sort_order,
          created_at: now,
          deleted_at: null,
        };
        await a.insert(CATEGORIES, category);
        added += 1;
      }
    });
    return added;
  }

  /** System categories plus the user's own, excluding soft-deleted rows. */
  async listVisible(userId: UUID, layer?: CategoryLayer): Promise<Category[]> {
    const all = await this.allRows();
    return all.filter(
      (c) =>
        c.deleted_at === null &&
        (c.user_id === null || c.user_id === userId) &&
        (layer === undefined || c.layer === layer),
    );
  }

  /** Create a user category, enforcing the depth cap. */
  async create(userId: UUID, input: NewCategoryInput): Promise<Category> {
    const all = await this.allRows();
    const byId = new Map<UUID, Category>(all.map((c) => [c.id, c]));
    if (input.parent_id != null && wouldExceedDepth(input.parent_id, byId)) {
      throw new Error(`creating under ${input.parent_id} would exceed max category depth`);
    }
    const category: Category = {
      id: this.newId(),
      user_id: userId,
      layer: input.layer,
      slug: input.slug,
      display_name: input.display_name,
      parent_id: input.parent_id ?? null,
      icon: input.icon ?? null,
      color: input.color ?? null,
      is_system: false,
      is_hidden: false,
      business_expense_kind: input.business_expense_kind ?? null,
      sort_order: input.sort_order ?? 0,
      created_at: this.clock.now(),
      deleted_at: null,
    };
    await this.adapter.insert(CATEGORIES, category);
    return category;
  }

  /** Hide/unhide. System categories may be hidden but not deleted. */
  async setHidden(id: UUID, hidden: boolean): Promise<void> {
    await this.adapter.update<Category>(CATEGORIES, id, { is_hidden: hidden });
  }

  /**
   * Delete a user category. Requires a destination: all splits pointing at it are
   * reassigned first, then the category is soft-deleted. System categories cannot
   * be deleted. Returns the number of splits reassigned.
   */
  async deleteUserCategory(userId: UUID, id: UUID, reassignToId: UUID): Promise<number> {
    const cat = await this.adapter.get<Category>(CATEGORIES, id);
    if (!cat || cat.deleted_at !== null) throw new Error(`category ${id} not found`);
    if (cat.is_system || cat.user_id === null) throw new Error('system categories cannot be deleted');
    if (cat.user_id !== userId) throw new Error(`category ${id} not owned by user`);
    if (reassignToId === id) throw new Error('reassign destination must differ from the deleted category');

    let moved = 0;
    await this.adapter.tx(async (a) => {
      const splits = await a.all<TransactionSplit>(TRANSACTION_SPLITS);
      for (const s of splits) {
        if (s.user_id === userId && s.category_id === id) {
          await a.update<TransactionSplit>(TRANSACTION_SPLITS, s.id, { category_id: reassignToId });
          moved += 1;
        }
      }
      await a.update<Category>(CATEGORIES, id, { deleted_at: this.clock.now() });
    });
    return moved;
  }
}
