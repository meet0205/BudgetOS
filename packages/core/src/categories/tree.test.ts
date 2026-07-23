import { describe, it, expect } from 'vitest';
import { caSeedRows, CA_TRANSACTION_CATEGORIES } from './seed-ca.js';
import { buildTree, depthOf, wouldExceedDepth, MAX_DEPTH, rollup, assertDepthWithin } from './tree.js';
import type { Category } from '../db/types.js';
import { toMinor } from '../money/minor.js';

// Build Category rows from the flat seed, wiring parent_id by slug.
function seedAsCategories(): Category[] {
  const rows = caSeedRows();
  const idBySlug = new Map<string, string>();
  rows.forEach((r) => idBySlug.set(`${r.layer}:${r.slug}`, `${r.layer}:${r.slug}`));
  return rows.map((r) => ({
    id: `${r.layer}:${r.slug}`,
    user_id: null,
    layer: r.layer,
    slug: r.slug,
    display_name: r.display_name,
    parent_id: r.parent_slug ? `${r.layer}:${r.parent_slug}` : null,
    icon: null,
    color: null,
    is_system: true,
    is_hidden: false,
    business_expense_kind: r.business_expense_kind,
    sort_order: r.sort_order,
    created_at: '2026-07-23T00:00:00.000Z',
    deleted_at: null,
  }));
}

describe('seed taxonomy', () => {
  it('has ~20 transaction-layer top categories', () => {
    expect(CA_TRANSACTION_CATEGORIES.length).toBeGreaterThanOrEqual(18);
  });

  it('has unique slugs per layer', () => {
    const rows = caSeedRows();
    const perLayer = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = perLayer.get(r.layer) ?? new Set();
      expect(set.has(r.slug)).toBe(false);
      set.add(r.slug);
      perLayer.set(r.layer, set);
    }
  });

  it('carries CRA business_expense_kind on vehicle/dining product categories', () => {
    const rows = caSeedRows();
    const fuel = rows.find((r) => r.slug === 'p-fuel');
    expect(fuel?.business_expense_kind).toBe('motor_vehicle');
    const restaurants = rows.find((r) => r.slug === 'p-restaurants');
    expect(restaurants?.business_expense_kind).toBe('meals_entertainment');
  });

  it('never exceeds the max depth', () => {
    expect(() => assertDepthWithin(seedAsCategories())).not.toThrow();
    expect(Math.max(...caSeedRows().map((r) => r.depth))).toBeLessThanOrEqual(MAX_DEPTH);
  });
});

describe('buildTree & depth', () => {
  const cats = seedAsCategories();

  it('nests product children under their group', () => {
    const productRoots = buildTree(cats.filter((c) => c.layer === 'product'));
    const groceries = productRoots.find((n) => n.slug === 'p-groceries');
    expect(groceries).toBeDefined();
    expect(groceries!.children.map((c) => c.slug)).toContain('p-dairy');
    expect(groceries!.depth).toBe(1);
    expect(groceries!.children[0]!.depth).toBe(2);
  });

  it('depthOf follows the parent chain', () => {
    const byId = new Map(cats.map((c) => [c.id, c]));
    expect(depthOf('product:p-groceries', byId)).toBe(1);
    expect(depthOf('product:p-dairy', byId)).toBe(2);
  });

  it('wouldExceedDepth blocks a 4th level', () => {
    const byId = new Map(cats.map((c) => [c.id, c]));
    // p-dairy is at depth 2; a child would be depth 3 (ok), grandchild depth 4 (blocked).
    expect(wouldExceedDepth('product:p-dairy', byId)).toBe(false);
    // Simulate a depth-3 node.
    const deep: Category = { ...cats[0]!, id: 'x', parent_id: 'product:p-dairy', slug: 'x' };
    byId.set('x', deep);
    expect(wouldExceedDepth('x', byId)).toBe(true);
  });
});

describe('rollup', () => {
  it('sums descendants into ancestors', () => {
    const productRoots = buildTree(seedAsCategories().filter((c) => c.layer === 'product'));
    const amounts = new Map<string, ReturnType<typeof toMinor>>([
      ['product:p-dairy', toMinor('10.00')],
      ['product:p-produce', toMinor('5.00')],
    ]);
    const totals = rollup(productRoots, amounts);
    expect(totals.get('product:p-groceries')).toBe(1500); // 10 + 5 rolled up
    expect(totals.get('product:p-dairy')).toBe(1000);
  });
});
