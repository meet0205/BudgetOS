/**
 * Canadian seed taxonomy (Feature 02).
 *
 * The data lives in `ca-taxonomy.json` — the single source of truth. This module
 * types it and flattens it; `scripts/gen-seed-sql.mjs` reads the same JSON to
 * generate `supabase/migrations/0007_seed_categories_ca.sql`. SQL and app seed
 * therefore never drift.
 *
 * Two layers:
 *   - transaction: receipt-level (Groceries, Vehicle, Dining) — roughly 20 tops.
 *   - product:     line-level, grouped and nested (Groceries → Dairy, Produce…).
 *
 * Product-layer categories carry a `business_expense_kind` where they map to a
 * CRA T2125 deduction line (Feature 13). These kind strings are structural
 * labels, NOT tax figures — no rates or amounts live here.
 */
import taxonomy from './ca-taxonomy.json';
import type { CategoryLayer } from '../db/types.js';

/** CRA business-expense kinds (T2125 lines). Structural labels only. */
export const CRA_BUSINESS_EXPENSE_KINDS = [
  'advertising',
  'meals_entertainment',
  'insurance',
  'interest_bank_charges',
  'business_taxes_licences',
  'office_supplies',
  'office_rent',
  'supplies',
  'professional_fees',
  'telephone_utilities',
  'travel',
  'motor_vehicle',
  'maintenance_repairs',
  'delivery_freight',
] as const;

export type BusinessExpenseKind = (typeof CRA_BUSINESS_EXPENSE_KINDS)[number];

export interface SeedCategory {
  slug: string;
  display_name: string;
  business_expense_kind?: string;
  children?: SeedCategory[];
}

const data = taxonomy as { transaction: SeedCategory[]; product: SeedCategory[] };

export const CA_TRANSACTION_CATEGORIES: SeedCategory[] = data.transaction;
export const CA_PRODUCT_CATEGORIES: SeedCategory[] = data.product;

export interface FlatSeedCategory {
  slug: string;
  display_name: string;
  layer: CategoryLayer;
  parent_slug: string | null;
  business_expense_kind: string | null;
  sort_order: number;
  depth: number; // 1-based
}

/** Flatten a nested seed tree into rows with parent_slug + depth resolved. */
export function flattenSeed(roots: SeedCategory[], layer: CategoryLayer): FlatSeedCategory[] {
  const out: FlatSeedCategory[] = [];
  const walk = (nodes: SeedCategory[], parent: string | null, depth: number) => {
    nodes.forEach((node, i) => {
      out.push({
        slug: node.slug,
        display_name: node.display_name,
        layer,
        parent_slug: parent,
        business_expense_kind: node.business_expense_kind ?? null,
        sort_order: i,
        depth,
      });
      if (node.children?.length) walk(node.children, node.slug, depth + 1);
    });
  };
  walk(roots, null, 1);
  return out;
}

/** The full seed as flat rows across both layers. */
export function caSeedRows(): FlatSeedCategory[] {
  return [
    ...flattenSeed(CA_TRANSACTION_CATEGORIES, 'transaction'),
    ...flattenSeed(CA_PRODUCT_CATEGORIES, 'product'),
  ];
}
