/**
 * Category hierarchy: build a tree, enforce the depth cap, and roll amounts up
 * from descendants to ancestors for reporting (Feature 02).
 */
import type { Category } from '../db/types.js';
import type { UUID } from '../db/ids.js';
import type { Minor } from '../money/minor.js';
import { add, ZERO } from '../money/index.js';

/** Maximum category depth (root = 1). */
export const MAX_DEPTH = 3;

export interface CategoryNode extends Category {
  depth: number;
  children: CategoryNode[];
}

function indexById(categories: Category[]): Map<UUID, Category> {
  const m = new Map<UUID, Category>();
  for (const c of categories) m.set(c.id, c);
  return m;
}

/**
 * Depth of a category (root = 1), following the parent chain. Throws on a cycle
 * or a parent that isn't in the set.
 */
export function depthOf(id: UUID, byId: Map<UUID, Category>): number {
  let depth = 0;
  let current: UUID | null = id;
  const seen = new Set<UUID>();
  while (current !== null) {
    if (seen.has(current)) throw new Error(`category cycle detected at ${current}`);
    seen.add(current);
    const node = byId.get(current);
    if (!node) throw new Error(`category ${current} not found while measuring depth`);
    depth += 1;
    current = node.parent_id;
  }
  return depth;
}

/** True if adding a child under `parentId` would exceed MAX_DEPTH. */
export function wouldExceedDepth(parentId: UUID | null, byId: Map<UUID, Category>): boolean {
  if (parentId === null) return false; // new root, depth 1
  return depthOf(parentId, byId) + 1 > MAX_DEPTH;
}

/** Throw if any category in the set is deeper than MAX_DEPTH. */
export function assertDepthWithin(categories: Category[]): void {
  const byId = indexById(categories);
  for (const c of categories) {
    if (depthOf(c.id, byId) > MAX_DEPTH) {
      throw new Error(`category "${c.slug}" exceeds max depth ${MAX_DEPTH}`);
    }
  }
}

/**
 * Build nested trees (one per layer implicitly — pass a single layer's rows).
 * Soft-deleted rows are dropped. Children are sorted by sort_order then name.
 */
export function buildTree(categories: Category[]): CategoryNode[] {
  const live = categories.filter((c) => c.deleted_at === null);
  const byId = indexById(live);
  const nodes = new Map<UUID, CategoryNode>();
  for (const c of live) nodes.set(c.id, { ...c, depth: depthOf(c.id, byId), children: [] });

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_id !== null && nodes.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (list: CategoryNode[]) => {
    list.sort((a, b) =>
      a.sort_order !== b.sort_order
        ? a.sort_order - b.sort_order
        : a.display_name.localeCompare(b.display_name),
    );
    for (const n of list) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

/**
 * Roll leaf amounts up the tree. `amountByCategory` holds directly-assigned
 * totals per category id; the result holds each category's own amount plus the
 * sum of all its descendants — what a rolled-up report shows.
 */
export function rollup(
  roots: CategoryNode[],
  amountByCategory: Map<UUID, Minor>,
): Map<UUID, Minor> {
  const totals = new Map<UUID, Minor>();
  const visit = (node: CategoryNode): Minor => {
    let total = amountByCategory.get(node.id) ?? ZERO;
    for (const child of node.children) total = add(total, visit(child));
    totals.set(node.id, total);
    return total;
  };
  for (const root of roots) visit(root);
  return totals;
}
