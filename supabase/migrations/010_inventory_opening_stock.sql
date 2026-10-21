-- Opening stock balances, unit costs, and catalog types for real inventory analytics

INSERT INTO inventory_item_types (id, organization_id, name, slug, applies_to, sort_order, is_active)
VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Raw Materials', 'raw_materials', 'both', 1, true),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Work in Progress', 'work_in_progress', 'block', 2, true),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Finished Goods', 'finished_goods', 'both', 3, true)
ON CONFLICT (id) DO NOTHING;

UPDATE inventory_items SET
  item_type_id = '33333333-3333-3333-3333-333333333331',
  unit_cost = 0.45
WHERE sku = 'BLK-RM-001';

UPDATE inventory_items SET
  item_type_id = '33333333-3333-3333-3333-333333333331',
  unit_cost = 0.12
WHERE sku = 'BLK-RM-002';

UPDATE inventory_items SET
  item_type_id = '33333333-3333-3333-3333-333333333333',
  unit_cost = 4.50
WHERE sku = 'BLK-FG-001';

UPDATE inventory_items SET
  item_type_id = '33333333-3333-3333-3333-333333333331',
  unit_cost = 0.35
WHERE sku = 'REC-RM-001';

UPDATE inventory_items SET
  item_type_id = '33333333-3333-3333-3333-333333333333',
  unit_cost = 1.20
WHERE sku = 'REC-FG-001';

-- Opening balance receipts for raw materials (production BOM consumed from zero)
ALTER TABLE inventory_movements DISABLE TRIGGER audit_inventory_movements;

INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, notes)
SELECT
  i.organization_id,
  i.factory_id,
  i.id,
  'receipt',
  CASE i.sku
    WHEN 'BLK-RM-001' THEN 15000
    WHEN 'BLK-RM-002' THEN 20000
    WHEN 'REC-RM-001' THEN 8000
    ELSE 0
  END,
  'opening_balance',
  'Opening stock balance'
FROM inventory_items i
WHERE i.sku IN ('BLK-RM-001', 'BLK-RM-002', 'REC-RM-001')
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements m
    WHERE m.item_id = i.id AND m.reference_type = 'opening_balance'
  );

ALTER TABLE inventory_movements ENABLE TRIGGER audit_inventory_movements;
