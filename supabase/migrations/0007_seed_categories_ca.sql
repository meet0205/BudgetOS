-- 0007_seed_categories_ca.sql
-- Feature 02 — Canadian system category seed.
-- GENERATED FILE — do not edit by hand. Regenerate with:
--   node scripts/gen-seed-sql.mjs
-- Source of truth: packages/core/src/categories/ca-taxonomy.json
--
-- System categories: user_id IS NULL, is_system true, visible to all users.
-- Two passes: insert rows, then resolve parent_id by slug within each layer.

with seed(slug, layer, display_name, parent_slug, business_expense_kind, sort_order) as (
  values
  ('groceries', 'transaction'::category_layer, 'Groceries', null, null, 0),
  ('dining', 'transaction'::category_layer, 'Dining', null, null, 1),
  ('vehicle', 'transaction'::category_layer, 'Vehicle', null, null, 2),
  ('transit', 'transaction'::category_layer, 'Transit', null, null, 3),
  ('housing', 'transaction'::category_layer, 'Housing', null, null, 4),
  ('utilities', 'transaction'::category_layer, 'Utilities', null, null, 5),
  ('telecom', 'transaction'::category_layer, 'Telecom', null, null, 6),
  ('insurance', 'transaction'::category_layer, 'Insurance', null, null, 7),
  ('health', 'transaction'::category_layer, 'Health', null, null, 8),
  ('personal-care', 'transaction'::category_layer, 'Personal care', null, null, 9),
  ('clothing', 'transaction'::category_layer, 'Clothing', null, null, 10),
  ('household', 'transaction'::category_layer, 'Household', null, null, 11),
  ('entertainment', 'transaction'::category_layer, 'Entertainment', null, null, 12),
  ('subscriptions', 'transaction'::category_layer, 'Subscriptions', null, null, 13),
  ('education', 'transaction'::category_layer, 'Education', null, null, 14),
  ('gifts', 'transaction'::category_layer, 'Gifts', null, null, 15),
  ('travel', 'transaction'::category_layer, 'Travel', null, null, 16),
  ('fees', 'transaction'::category_layer, 'Fees', null, null, 17),
  ('business', 'transaction'::category_layer, 'Business', null, null, 18),
  ('other', 'transaction'::category_layer, 'Other', null, null, 19),
  ('p-groceries', 'product'::category_layer, 'Groceries', null, null, 0),
  ('p-dairy', 'product'::category_layer, 'Dairy', 'p-groceries', null, 0),
  ('p-produce', 'product'::category_layer, 'Produce', 'p-groceries', null, 1),
  ('p-meat-seafood', 'product'::category_layer, 'Meat & Seafood', 'p-groceries', null, 2),
  ('p-bakery', 'product'::category_layer, 'Bakery', 'p-groceries', null, 3),
  ('p-pantry', 'product'::category_layer, 'Pantry', 'p-groceries', null, 4),
  ('p-frozen', 'product'::category_layer, 'Frozen', 'p-groceries', null, 5),
  ('p-snacks', 'product'::category_layer, 'Snacks', 'p-groceries', null, 6),
  ('p-beverages', 'product'::category_layer, 'Beverages', 'p-groceries', null, 7),
  ('p-household-supplies', 'product'::category_layer, 'Household supplies', 'p-groceries', null, 8),
  ('p-vehicle', 'product'::category_layer, 'Vehicle', null, null, 1),
  ('p-fuel', 'product'::category_layer, 'Fuel', 'p-vehicle', 'motor_vehicle', 0),
  ('p-maintenance', 'product'::category_layer, 'Maintenance', 'p-vehicle', 'motor_vehicle', 1),
  ('p-parking', 'product'::category_layer, 'Parking', 'p-vehicle', 'motor_vehicle', 2),
  ('p-tolls', 'product'::category_layer, 'Tolls', 'p-vehicle', 'motor_vehicle', 3),
  ('p-registration', 'product'::category_layer, 'Registration', 'p-vehicle', 'motor_vehicle', 4),
  ('p-vehicle-insurance', 'product'::category_layer, 'Vehicle insurance', 'p-vehicle', 'motor_vehicle', 5),
  ('p-dining', 'product'::category_layer, 'Dining', null, null, 2),
  ('p-restaurants', 'product'::category_layer, 'Restaurants', 'p-dining', 'meals_entertainment', 0),
  ('p-fast-food', 'product'::category_layer, 'Fast food', 'p-dining', 'meals_entertainment', 1),
  ('p-coffee', 'product'::category_layer, 'Coffee', 'p-dining', 'meals_entertainment', 2),
  ('p-delivery', 'product'::category_layer, 'Delivery', 'p-dining', 'meals_entertainment', 3),
  ('p-alcohol', 'product'::category_layer, 'Alcohol', 'p-dining', null, 4),
  ('p-home', 'product'::category_layer, 'Home', null, null, 3),
  ('p-furniture', 'product'::category_layer, 'Furniture', 'p-home', null, 0),
  ('p-appliances', 'product'::category_layer, 'Appliances', 'p-home', null, 1),
  ('p-tools', 'product'::category_layer, 'Tools', 'p-home', 'supplies', 2),
  ('p-decor', 'product'::category_layer, 'Decor', 'p-home', null, 3),
  ('p-garden', 'product'::category_layer, 'Garden', 'p-home', null, 4),
  ('p-cleaning', 'product'::category_layer, 'Cleaning supplies', 'p-home', null, 5),
  ('p-office', 'product'::category_layer, 'Office', null, null, 4),
  ('p-office-supplies', 'product'::category_layer, 'Office supplies', 'p-office', 'office_supplies', 0),
  ('p-software', 'product'::category_layer, 'Software', 'p-office', 'supplies', 1),
  ('p-postage', 'product'::category_layer, 'Postage & shipping', 'p-office', 'delivery_freight', 2),
  ('p-health', 'product'::category_layer, 'Health', null, null, 5),
  ('p-pharmacy', 'product'::category_layer, 'Pharmacy', 'p-health', null, 0),
  ('p-dental', 'product'::category_layer, 'Dental', 'p-health', null, 1),
  ('p-vision', 'product'::category_layer, 'Vision', 'p-health', null, 2),
  ('p-supplements', 'product'::category_layer, 'Supplements', 'p-health', null, 3),
  ('p-personal-care', 'product'::category_layer, 'Personal care', null, null, 6),
  ('p-toiletries', 'product'::category_layer, 'Toiletries', 'p-personal-care', null, 0),
  ('p-cosmetics', 'product'::category_layer, 'Cosmetics', 'p-personal-care', null, 1),
  ('p-haircare', 'product'::category_layer, 'Hair care', 'p-personal-care', null, 2),
  ('p-clothing', 'product'::category_layer, 'Clothing', null, null, 7),
  ('p-apparel', 'product'::category_layer, 'Apparel', 'p-clothing', null, 0),
  ('p-footwear', 'product'::category_layer, 'Footwear', 'p-clothing', null, 1),
  ('p-accessories', 'product'::category_layer, 'Accessories', 'p-clothing', null, 2),
  ('p-tech', 'product'::category_layer, 'Technology', null, null, 8),
  ('p-electronics', 'product'::category_layer, 'Electronics', 'p-tech', null, 0),
  ('p-phone', 'product'::category_layer, 'Phone & accessories', 'p-tech', null, 1),
  ('p-subscriptions-digital', 'product'::category_layer, 'Digital subscriptions', 'p-tech', null, 2),
  ('p-other', 'product'::category_layer, 'Other', null, null, 9),
  ('p-uncategorised', 'product'::category_layer, 'Uncategorised', 'p-other', null, 0)
)
insert into categories (user_id, layer, slug, display_name, is_system, business_expense_kind, sort_order)
select null, layer, slug, display_name, true, business_expense_kind, sort_order
from seed
on conflict do nothing;

-- Resolve parent_id within each layer, for system rows only.
update categories c
set parent_id = p.id
from seed s
join categories p
  on p.slug = s.parent_slug and p.layer = s.layer and p.user_id is null
where c.slug = s.slug and c.layer = s.layer and c.user_id is null
  and s.parent_slug is not null;
