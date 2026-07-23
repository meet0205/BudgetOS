/**
 * Category merge (Feature 02). Merging A into B reassigns every split pointing at
 * A over to B, records the operation in category_merges so a changed report can
 * be explained, then soft-deletes A. System categories cannot be the source.
 */
import type { Adapter } from '../db/adapter.js';
import type { Category, CategoryMerge, TransactionSplit } from '../db/types.js';
import { type Clock, systemClock } from '../db/clock.js';
import { newId as defaultNewId, type UUID } from '../db/ids.js';
import { CATEGORIES, CATEGORY_MERGES } from '../db/repositories/categories.js';
import { TRANSACTION_SPLITS } from '../db/repositories/transactions.js';

export interface MergeResult {
  merge: CategoryMerge;
  rowsMoved: number;
}

export async function mergeCategories(
  adapter: Adapter,
  userId: UUID,
  fromId: UUID,
  intoId: UUID,
  options: { clock?: Clock; newId?: () => UUID } = {},
): Promise<MergeResult> {
  const clock = options.clock ?? systemClock;
  const genId = options.newId ?? defaultNewId;

  if (fromId === intoId) throw new Error('cannot merge a category into itself');

  const from = await adapter.get<Category>(CATEGORIES, fromId);
  const into = await adapter.get<Category>(CATEGORIES, intoId);
  if (!from || from.deleted_at !== null) throw new Error(`source category ${fromId} not found`);
  if (!into || into.deleted_at !== null) throw new Error(`target category ${intoId} not found`);
  if (from.is_system || from.user_id === null) throw new Error('system categories cannot be merged away');
  if (from.user_id !== userId) throw new Error(`category ${fromId} not owned by user`);
  if (into.user_id !== null && into.user_id !== userId) throw new Error('target category not visible to user');
  if (from.layer !== into.layer) throw new Error('cannot merge across category layers');

  let rowsMoved = 0;
  const merge: CategoryMerge = {
    id: genId(),
    user_id: userId,
    from_category_id: fromId,
    into_category_id: intoId,
    rows_moved: 0,
    merged_at: clock.now(),
  };

  await adapter.tx(async (a) => {
    const splits = await a.all<TransactionSplit>(TRANSACTION_SPLITS);
    for (const s of splits) {
      if (s.user_id === userId && s.category_id === fromId) {
        await a.update<TransactionSplit>(TRANSACTION_SPLITS, s.id, { category_id: intoId });
        rowsMoved += 1;
      }
    }
    merge.rows_moved = rowsMoved;
    await a.insert(CATEGORY_MERGES, merge);
    await a.update<Category>(CATEGORIES, fromId, { deleted_at: clock.now() });
  });

  return { merge, rowsMoved };
}
