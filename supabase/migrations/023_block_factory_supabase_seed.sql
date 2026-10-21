-- Block factory catalog + calculation-based opening stock (Supabase-only app)
-- Yield reference (20cm blocks, 50,000 planned/batch):
--   cement bags  = CEIL(50000/64)  = 782 per batch
--   poliche loads = CEIL(50000/1120) = 45 per batch
-- Opening reserve = 3 batches → 2346 cement bags, 135 poliche loads

-- ─── Clear legacy transactional demo data ───────────────────────────────────
DELETE FROM inventory_movements WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM production_counts WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM production_batches WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM order_items WHERE order_id IN (
  SELECT id FROM orders WHERE organization_id = '11111111-1111-1111-1111-111111111111'
);
DELETE FROM orders WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM customer_payments WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM reconciliation_records WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM sage_transactions WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM material_purchases WHERE organization_id = '11111111-1111-1111-1111-111111111111';
DELETE FROM stock_counts WHERE organization_id = '11111111-1111-1111-1111-111111111111';

UPDATE customers SET balance = 0 WHERE organization_id = '11111111-1111-1111-1111-111111111111';

-- Remove obsolete block SKUs (replaced by yield-based catalog)
DELETE FROM inventory_items
WHERE organization_id = '11111111-1111-1111-1111-111111111111'
  AND factory_id = '22222222-2222-2222-2222-222222222221'
  AND sku IN ('BLK-RM-001', 'BLK-RM-002', 'BLK-FG-001');

-- Free unique slugs held by legacy types (010) before inserting catalog IDs (023)
UPDATE inventory_item_types SET slug = slug || '_legacy'
WHERE id IN (
  '33333333-3333-3333-3333-333333333331',
  '33333333-3333-3333-3333-333333333332',
  '33333333-3333-3333-3333-333333333333'
);

-- ─── Enterprise catalog (block factory) — insert types BEFORE repointing FKs ─
INSERT INTO inventory_item_types (id, organization_id, name, slug, applies_to, sort_order, is_active)
VALUES
  ('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111111', 'Raw Material', 'raw_material', 'both', 1, true),
  ('44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111111', 'Work in Process', 'work_in_process', 'both', 2, true),
  ('44444444-4444-4444-4444-444444444403', '11111111-1111-1111-1111-111111111111', 'Finished Goods', 'finished_goods', 'both', 3, true),
  ('44444444-4444-4444-4444-444444444404', '11111111-1111-1111-1111-111111111111', 'Consumables', 'consumables', 'both', 4, true),
  ('44444444-4444-4444-4444-444444444405', '11111111-1111-1111-1111-111111111111', 'Packaging', 'packaging', 'both', 5, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  applies_to = EXCLUDED.applies_to,
  sort_order = EXCLUDED.sort_order,
  is_active = true;

-- Reconcile legacy item type IDs (010) → catalog IDs (023)
UPDATE inventory_items SET item_type_id = '44444444-4444-4444-4444-444444444401'
WHERE item_type_id = '33333333-3333-3333-3333-333333333331';
UPDATE inventory_items SET item_type_id = '44444444-4444-4444-4444-444444444402'
WHERE item_type_id = '33333333-3333-3333-3333-333333333332';
UPDATE inventory_items SET item_type_id = '44444444-4444-4444-4444-444444444403'
WHERE item_type_id = '33333333-3333-3333-3333-333333333333';

UPDATE inventory_categories SET item_type_id = '44444444-4444-4444-4444-444444444401'
WHERE item_type_id = '33333333-3333-3333-3333-333333333331';
UPDATE inventory_categories SET item_type_id = '44444444-4444-4444-4444-444444444402'
WHERE item_type_id = '33333333-3333-3333-3333-333333333332';
UPDATE inventory_categories SET item_type_id = '44444444-4444-4444-4444-444444444403'
WHERE item_type_id = '33333333-3333-3333-3333-333333333333';

UPDATE inventory_units SET item_type_id = '44444444-4444-4444-4444-444444444401'
WHERE item_type_id = '33333333-3333-3333-3333-333333333331';
UPDATE inventory_units SET item_type_id = '44444444-4444-4444-4444-444444444402'
WHERE item_type_id = '33333333-3333-3333-3333-333333333332';
UPDATE inventory_units SET item_type_id = '44444444-4444-4444-4444-444444444403'
WHERE item_type_id = '33333333-3333-3333-3333-333333333333';

UPDATE inventory_unit_conversions SET item_type_id = '44444444-4444-4444-4444-444444444401'
WHERE item_type_id = '33333333-3333-3333-3333-333333333331';
UPDATE inventory_unit_conversions SET item_type_id = '44444444-4444-4444-4444-444444444402'
WHERE item_type_id = '33333333-3333-3333-3333-333333333332';
UPDATE inventory_unit_conversions SET item_type_id = '44444444-4444-4444-4444-444444444403'
WHERE item_type_id = '33333333-3333-3333-3333-333333333333';

UPDATE inventory_custom_field_definitions SET item_type_id = '44444444-4444-4444-4444-444444444401'
WHERE item_type_id = '33333333-3333-3333-3333-333333333331';
UPDATE inventory_custom_field_definitions SET item_type_id = '44444444-4444-4444-4444-444444444402'
WHERE item_type_id = '33333333-3333-3333-3333-333333333332';
UPDATE inventory_custom_field_definitions SET item_type_id = '44444444-4444-4444-4444-444444444403'
WHERE item_type_id = '33333333-3333-3333-3333-333333333333';

UPDATE inventory_sku_rules SET item_type_id = '44444444-4444-4444-4444-444444444401'
WHERE item_type_id = '33333333-3333-3333-3333-333333333331';
UPDATE inventory_sku_rules SET item_type_id = '44444444-4444-4444-4444-444444444402'
WHERE item_type_id = '33333333-3333-3333-3333-333333333332';
UPDATE inventory_sku_rules SET item_type_id = '44444444-4444-4444-4444-444444444403'
WHERE item_type_id = '33333333-3333-3333-3333-333333333333';

DELETE FROM inventory_item_types
WHERE id IN (
  '33333333-3333-3333-3333-333333333331',
  '33333333-3333-3333-3333-333333333332',
  '33333333-3333-3333-3333-333333333333'
);

-- Remove duplicate slug rows if legacy slugs differed (raw_materials vs raw_material)
DELETE FROM inventory_item_types t
WHERE t.organization_id = '11111111-1111-1111-1111-111111111111'
  AND t.id NOT IN (
    '44444444-4444-4444-4444-444444444401',
    '44444444-4444-4444-4444-444444444402',
    '44444444-4444-4444-4444-444444444403',
    '44444444-4444-4444-4444-444444444404',
    '44444444-4444-4444-4444-444444444405'
  )
  AND NOT EXISTS (SELECT 1 FROM inventory_items i WHERE i.item_type_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM inventory_categories c WHERE c.item_type_id = t.id);

INSERT INTO inventory_categories (id, organization_id, item_type_id, name, slug, factory_id, is_active)
VALUES
  ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444401', 'Cement & Binders', 'cement_binders', '22222222-2222-2222-2222-222222222221', true),
  ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444401', 'Poliche', 'poliche', '22222222-2222-2222-2222-222222222221', true),
  ('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444402', 'Block Drying / Curing', 'block_drying', '22222222-2222-2222-2222-222222222221', true),
  ('55555555-5555-5555-5555-555555555504', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444403', 'Concrete Blocks', 'concrete_blocks', '22222222-2222-2222-2222-222222222221', true),
  ('55555555-5555-5555-5555-555555555505', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444404', 'Spare Parts & Tools', 'spare_parts', '22222222-2222-2222-2222-222222222221', true),
  ('55555555-5555-5555-5555-555555555506', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444401', 'Plastic Feedstock', 'plastic_feedstock', '22222222-2222-2222-2222-222222222222', true),
  ('55555555-5555-5555-5555-555555555508', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444403', 'Recycled Pellets', 'recycled_pellets', '22222222-2222-2222-2222-222222222222', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  item_type_id = EXCLUDED.item_type_id,
  factory_id = EXCLUDED.factory_id,
  is_active = true;

-- ─── Block factory inventory (Birr unit costs) ─────────────────────────────
INSERT INTO inventory_items (
  id, organization_id, factory_id, name, sku, category, item_type_id, category_id,
  unit, quantity, reserved_quantity, low_stock_threshold, reorder_quantity, max_stock_level,
  unit_cost, supplier, location, is_active, custom_fields
) VALUES
  ('66666666-6666-6666-6666-666666666601', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Portland Cement', 'BLK-RM-CEM', 'raw_material', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555501',
   'bag', 0, 0, 200, 1000, 5000, 980, 'BuildMart Supplies', 'Cement Storage Area', true,
   '{"cement_type":"Portland","brand":"Dangote","kg_per_bag":45}'::jsonb),
  ('66666666-6666-6666-6666-666666666602', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Poliche', 'BLK-RM-POL', 'raw_material', '44444444-4444-4444-4444-444444444401', '55555555-5555-5555-5555-555555555502',
   'load', 0, 0, 15, 40, 200, 8500, 'QuarryCo Ltd', 'Raw Material Storage Area', true, '{}'::jsonb),
  ('66666666-6666-6666-6666-666666666603', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Blocks in Curing/Drying', 'BLK-WIP-001', 'work_in_process', '44444444-4444-4444-4444-444444444402', '55555555-5555-5555-5555-555555555503',
   'units', 0, 0, 0, 0, 100000, 18, NULL, 'Curing & Drying Yard', true, '{}'::jsonb),
  ('66666666-6666-6666-6666-666666666604', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Production Waste Blocks', 'BLK-WIP-WASTE', 'work_in_process', '44444444-4444-4444-4444-444444444402', '55555555-5555-5555-5555-555555555503',
   'units', 0, 0, 0, 0, 10000, 5, NULL, 'Waste Area', true, '{}'::jsonb),
  ('66666666-6666-6666-6666-666666666605', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Concrete Block 20cm', 'BLK-FG-20', 'finished_goods', '44444444-4444-4444-4444-444444444403', '55555555-5555-5555-5555-555555555504',
   'units', 0, 0, 2000, 5000, 50000, 25, NULL, 'Finished Goods Storage Area', true, '{"block_size_cm":20}'::jsonb),
  ('66666666-6666-6666-6666-666666666606', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Concrete Block 15cm', 'BLK-FG-15', 'finished_goods', '44444444-4444-4444-4444-444444444403', '55555555-5555-5555-5555-555555555504',
   'units', 0, 0, 1500, 4000, 50000, 22, NULL, 'Finished Goods Storage Area', true, '{"block_size_cm":15}'::jsonb),
  ('66666666-6666-6666-6666-666666666607', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Concrete Block 10cm', 'BLK-FG-10', 'finished_goods', '44444444-4444-4444-4444-444444444403', '55555555-5555-5555-5555-555555555504',
   'units', 0, 0, 2500, 6000, 50000, 18, NULL, 'Finished Goods Storage Area', true, '{"block_size_cm":10}'::jsonb),
  ('66666666-6666-6666-6666-666666666608', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Concrete Block 24cm', 'BLK-FG-24', 'finished_goods', '44444444-4444-4444-4444-444444444403', '55555555-5555-5555-5555-555555555504',
   'units', 0, 0, 800, 3000, 30000, 28, NULL, 'Finished Goods Storage Area', true, '{"block_size_cm":24}'::jsonb),
  ('66666666-6666-6666-6666-666666666609', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Hydraulic Pump Seal Kit', 'BLK-SP-001', 'raw_material', '44444444-4444-4444-4444-444444444404', '55555555-5555-5555-5555-555555555505',
   'units', 0, 0, 5, 10, 30, 4500, 'Industrial Parts Ethiopia', 'Spare Parts Storage Area', true, '{}'::jsonb),
  ('66666666-6666-6666-6666-666666666610', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Vibration Motor Bearings', 'BLK-SP-002', 'raw_material', '44444444-4444-4444-4444-444444444404', '55555555-5555-5555-5555-555555555505',
   'units', 0, 0, 4, 8, 20, 2800, 'Industrial Parts Ethiopia', 'Spare Parts Storage Area', true, '{}'::jsonb),
  ('66666666-6666-6666-6666-666666666611', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221',
   'Conveyor Belt Section', 'BLK-SP-003', 'raw_material', '44444444-4444-4444-4444-444444444404', '55555555-5555-5555-5555-555555555505',
   'units', 0, 0, 2, 4, 12, 12000, 'Industrial Parts Ethiopia', 'Spare Parts Storage Area', true, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sku = EXCLUDED.sku,
  unit_cost = EXCLUDED.unit_cost,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  reorder_quantity = EXCLUDED.reorder_quantity,
  max_stock_level = EXCLUDED.max_stock_level,
  item_type_id = EXCLUDED.item_type_id,
  category_id = EXCLUDED.category_id,
  custom_fields = EXCLUDED.custom_fields,
  is_active = true;

-- Align recycling items with enterprise types
UPDATE inventory_items SET
  item_type_id = '44444444-4444-4444-4444-444444444401',
  category_id = '55555555-5555-5555-5555-555555555506',
  unit_cost = 35,
  quantity = 0
WHERE sku = 'REC-RM-001';

UPDATE inventory_items SET
  item_type_id = '44444444-4444-4444-4444-444444444403',
  category_id = '55555555-5555-5555-5555-555555555508',
  unit_cost = 120,
  quantity = 0
WHERE sku = 'REC-FG-001';

-- ─── Opening stock (yield-calculated raw materials + spare parts starter) ───
ALTER TABLE inventory_movements DISABLE TRIGGER USER;

INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reason, source_module, notes)
VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '66666666-6666-6666-6666-666666666601', 'receipt', 2346, 'opening_balance', 'opening_stock', 'system', 'Opening stock: 3× batch cement (782 bags × 50k blocks @ 20cm yield)'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '66666666-6666-6666-6666-666666666602', 'receipt', 135, 'opening_balance', 'opening_stock', 'system', 'Opening stock: 3× batch poliche (45 loads × 50k blocks @ 20cm yield)'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '66666666-6666-6666-6666-666666666609', 'receipt', 8, 'opening_balance', 'opening_stock', 'system', 'Spare parts opening count'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '66666666-6666-6666-6666-666666666610', 'receipt', 6, 'opening_balance', 'opening_stock', 'system', 'Spare parts opening count'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', (SELECT id FROM inventory_items WHERE sku = 'REC-RM-001' LIMIT 1), 'receipt', 5000, 'opening_balance', 'opening_stock', 'system', 'Recycling feedstock opening balance');

UPDATE inventory_items i SET quantity = COALESCE((
  SELECT SUM(m.quantity) FROM inventory_movements m WHERE m.item_id = i.id
), 0)
WHERE i.organization_id = '11111111-1111-1111-1111-111111111111';

ALTER TABLE inventory_movements ENABLE TRIGGER USER;

-- ─── Suppliers & banks ───────────────────────────────────────────────────
INSERT INTO suppliers (id, organization_id, name, contact_phone, contact_email, address, is_active, total_purchases)
VALUES
  ('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111', 'BuildMart Supplies', '+251 911 234567', 'orders@buildmart.et', 'Addis Ababa, Bole', true, 0),
  ('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111', 'QuarryCo Ltd', '+251 922 345678', 'sales@quarryco.et', 'Debre Zeit Road', true, 0),
  ('77777777-7777-7777-7777-777777777703', '11111111-1111-1111-1111-111111111111', 'Industrial Parts Ethiopia', '+251 933 456789', NULL, 'Addis Ababa', true, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO banks (id, organization_id, name, code, is_active)
VALUES
  ('88888888-8888-8888-8888-888888888801', '11111111-1111-1111-1111-111111111111', 'Commercial Bank of Ethiopia', 'CBE', true),
  ('88888888-8888-8888-8888-888888888802', '11111111-1111-1111-1111-111111111111', 'Bank of Abyssinia', 'BOA', true),
  ('88888888-8888-8888-8888-888888888803', '11111111-1111-1111-1111-111111111111', 'Awash Bank', 'AWASH', true)
ON CONFLICT (id) DO NOTHING;
