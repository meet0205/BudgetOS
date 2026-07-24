// Generates supabase/migrations/0007_seed_categories_ca.sql from the single
// source of truth: packages/core/src/categories/ca-taxonomy.json.
// Run:  node scripts/gen-seed-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const taxonomyPath = join(root, 'packages/core/src/categories/ca-taxonomy.json');
const outPath = join(root, 'supabase/migrations/0007_seed_categories_ca.sql');

const taxonomy = JSON.parse(readFileSync(taxonomyPath, 'utf8'));

function flatten(roots, layer) {
  const out = [];
  const walk = (nodes, parent) => {
    nodes.forEach((node, i) => {
      out.push({
        slug: node.slug,
        display_name: node.display_name,
        layer,
        parent_slug: parent,
        business_expense_kind: node.business_expense_kind ?? null,
        sort_order: i,
      });
      if (node.children?.length) walk(node.children, node.slug);
    });
  };
  walk(roots, null);
  return out;
}

const rows = [...flatten(taxonomy.transaction, 'transaction'), ...flatten(taxonomy.product, 'product')];

const sqlStr = (v) => (v === null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const values = rows
  .map(
    (r) =>
      `  (${sqlStr(r.slug)}, ${sqlStr(r.layer)}::category_layer, ${sqlStr(r.display_name)}, ` +
      `${sqlStr(r.parent_slug)}, ${sqlStr(r.business_expense_kind)}, ${r.sort_order})`,
  )
  .join(',\n');

const sql = `-- 0007_seed_categories_ca.sql
-- Feature 02 — Canadian system category seed.
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   node scripts/gen-seed-sql.mjs
-- Source of truth: packages/core/src/categories/ca-taxonomy.json
--
-- System categories: user_id IS NULL, is_system true, visible to all users.
-- A temp table holds the seed so both passes (insert rows, then resolve
-- parent_id by slug) can reference it — a CTE is scoped to a single statement.

create temporary table _cat_seed (
  slug text, layer category_layer, display_name text,
  parent_slug text, business_expense_kind text, sort_order int
);

insert into _cat_seed (slug, layer, display_name, parent_slug, business_expense_kind, sort_order) values
${values};

insert into categories (user_id, layer, slug, display_name, is_system, business_expense_kind, sort_order)
select null, layer, slug, display_name, true, business_expense_kind, sort_order
from _cat_seed
on conflict do nothing;

-- Resolve parent_id within each layer, for system rows only.
update categories c
set parent_id = p.id
from _cat_seed s
join categories p
  on p.slug = s.parent_slug and p.layer = s.layer and p.user_id is null
where c.slug = s.slug and c.layer = s.layer and c.user_id is null
  and s.parent_slug is not null;

drop table _cat_seed;
`;

writeFileSync(outPath, sql);
console.log(`Wrote ${outPath} (${rows.length} categories)`);
