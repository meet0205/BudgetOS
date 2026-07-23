import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAdapter } from '../adapter.js';
import { CategoryRepository } from './categories.js';
import { TransactionRepository } from './transactions.js';
import { AccountRepository } from './accounts.js';
import { mergeCategories } from '../../categories/merge.js';
import { fixedClock } from '../clock.js';
import { toMinor } from '../../money/minor.js';
import { caSeedRows } from '../../categories/seed-ca.js';

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const clock = fixedClock('2026-07-23T12:00:00.000Z');

function harness() {
  const adapter = new InMemoryAdapter();
  let n = 0;
  const newId = () => `id-${(++n).toString().padStart(4, '0')}`;
  return {
    adapter,
    categories: new CategoryRepository(adapter, { clock, newId }),
    transactions: new TransactionRepository(adapter, { clock, newId }),
    accounts: new AccountRepository(adapter, { clock, newId }),
  };
}

describe('CategoryRepository seeding', () => {
  it('seeds the full Canadian taxonomy and is idempotent', async () => {
    const { categories } = harness();
    const added = await categories.seedSystemCategories();
    expect(added).toBe(caSeedRows().length);
    const again = await categories.seedSystemCategories();
    expect(again).toBe(0); // nothing re-added
    const visible = await categories.listVisible(USER);
    expect(visible.length).toBe(caSeedRows().length);
    expect(visible.every((c) => c.is_system && c.user_id === null)).toBe(true);
  });

  it('resolves product parent ids', async () => {
    const { categories } = harness();
    await categories.seedSystemCategories();
    const all = await categories.listVisible(USER, 'product');
    const dairy = all.find((c) => c.slug === 'p-dairy')!;
    const groceries = all.find((c) => c.slug === 'p-groceries')!;
    expect(dairy.parent_id).toBe(groceries.id);
  });
});

describe('CategoryRepository create & delete', () => {
  let h: ReturnType<typeof harness>;
  beforeEach(async () => {
    h = harness();
    await h.categories.seedSystemCategories();
  });

  it('creates a user category', async () => {
    const cat = await h.categories.create(USER, {
      layer: 'transaction',
      slug: 'coffee-habit',
      display_name: 'Coffee habit',
    });
    expect(cat.user_id).toBe(USER);
    expect(cat.is_system).toBe(false);
  });

  it('enforces the depth cap on create', async () => {
    const all = await h.categories.listVisible(USER, 'product');
    const dairy = all.find((c) => c.slug === 'p-dairy')!; // depth 2
    const child = await h.categories.create(USER, {
      layer: 'product',
      slug: 'oat-milk',
      display_name: 'Oat milk',
      parent_id: dairy.id, // depth 3 — ok
    });
    await expect(
      h.categories.create(USER, {
        layer: 'product',
        slug: 'barista-oat',
        display_name: 'Barista oat',
        parent_id: child.id, // depth 4 — blocked
      }),
    ).rejects.toThrow(/max category depth/);
  });

  it('reassigns splits before soft-deleting a user category', async () => {
    const custom = await h.categories.create(USER, {
      layer: 'product',
      slug: 'temp',
      display_name: 'Temp',
    });
    const dest = (await h.categories.listVisible(USER, 'product')).find((c) => c.slug === 'p-other')!;
    await h.transactions.create({
      user_id: USER,
      kind: 'expense',
      occurred_at: '2026-07-20T10:00:00.000Z',
      total_minor: toMinor('9.00'),
      base_total_minor: toMinor('9.00'),
      splits: [{ amount_minor: toMinor('9.00'), base_amount_minor: toMinor('9.00'), category_id: custom.id }],
    });
    const moved = await h.categories.deleteUserCategory(USER, custom.id, dest.id);
    expect(moved).toBe(1);
    // Category gone from visible list.
    expect((await h.categories.listVisible(USER, 'product')).find((c) => c.slug === 'temp')).toBeUndefined();
    // The split now points at the destination.
    const [txn] = await h.transactions.list(USER);
    expect(txn!.splits[0]!.category_id).toBe(dest.id);
  });

  it('refuses to delete a system category', async () => {
    const sys = (await h.categories.listVisible(USER, 'product')).find((c) => c.slug === 'p-fuel')!;
    const dest = (await h.categories.listVisible(USER, 'product')).find((c) => c.slug === 'p-other')!;
    await expect(h.categories.deleteUserCategory(USER, sys.id, dest.id)).rejects.toThrow(/system/);
  });
});

describe('mergeCategories', () => {
  it('reassigns splits, records the merge, and soft-deletes the source', async () => {
    const h = harness();
    await h.categories.seedSystemCategories();
    const from = await h.categories.create(USER, { layer: 'product', slug: 'a', display_name: 'A' });
    const into = await h.categories.create(USER, { layer: 'product', slug: 'b', display_name: 'B' });

    for (let i = 0; i < 3; i++) {
      await h.transactions.create({
        user_id: USER,
        kind: 'expense',
        occurred_at: '2026-07-20T10:00:00.000Z',
        total_minor: toMinor('1.00'),
        base_total_minor: toMinor('1.00'),
        splits: [{ amount_minor: toMinor('1.00'), base_amount_minor: toMinor('1.00'), category_id: from.id }],
      });
    }

    const { rowsMoved, merge } = await mergeCategories(h.adapter, USER, from.id, into.id, {
      clock,
      newId: () => 'merge-1',
    });
    expect(rowsMoved).toBe(3);
    expect(merge.rows_moved).toBe(3);
    // Source hidden from visible list.
    expect((await h.categories.listVisible(USER, 'product')).find((c) => c.slug === 'a')).toBeUndefined();
    // All splits now on the target.
    const txns = await h.transactions.list(USER);
    expect(txns.every((t) => t.splits[0]!.category_id === into.id)).toBe(true);
  });

  it('refuses cross-layer and self merges', async () => {
    const h = harness();
    await h.categories.seedSystemCategories();
    const p = await h.categories.create(USER, { layer: 'product', slug: 'p1', display_name: 'P1' });
    const t = await h.categories.create(USER, { layer: 'transaction', slug: 't1', display_name: 'T1' });
    await expect(mergeCategories(h.adapter, USER, p.id, p.id)).rejects.toThrow(/into itself/);
    await expect(mergeCategories(h.adapter, USER, p.id, t.id)).rejects.toThrow(/across category layers/);
  });
});

describe('AccountRepository', () => {
  it('creates accounts and hides archived from pickers but keeps them for history', async () => {
    const { accounts } = harness();
    const chequing = await accounts.create(USER, { name: 'Chequing', kind: 'bank' });
    const oldCard = await accounts.create(USER, { name: 'Old Visa', kind: 'credit_card' });
    await accounts.setArchived(USER, oldCard.id, true);

    const pickers = await accounts.list(USER);
    expect(pickers.map((a) => a.id)).toEqual([chequing.id]);

    const history = await accounts.list(USER, true);
    expect(history.map((a) => a.name).sort()).toEqual(['Chequing', 'Old Visa']);
  });
});
