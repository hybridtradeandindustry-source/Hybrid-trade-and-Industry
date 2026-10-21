-- Production ↔ inventory sync: app-managed movements with reversal on delete

-- Reverse item quantity when a movement is removed (keeps inventory accurate on count edits)
CREATE OR REPLACE FUNCTION reverse_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE inventory_items
  SET quantity = quantity - OLD.quantity,
      updated_at = NOW()
  WHERE id = OLD.item_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_movement_quantity_delete ON inventory_movements;

-- Replace DB insert trigger with app-level sync (supports update/delete + BOM)
DROP TRIGGER IF EXISTS trg_production_count_inventory ON production_counts;
DROP FUNCTION IF EXISTS handle_production_count_inventory();

-- Additional raw material for block factory BOM
INSERT INTO inventory_items (organization_id, factory_id, name, sku, category, unit, quantity, low_stock_threshold)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'Sand Aggregate',
  'BLK-RM-002',
  'raw_material',
  'kg',
  0,
  800
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_items WHERE factory_id = '22222222-2222-2222-2222-222222222221' AND sku = 'BLK-RM-002'
);

-- Block factory BOM: Standard Block 6"
INSERT INTO inventory_bom (organization_id, factory_id, finished_item_id, name, version, yield_quantity, is_active)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  fg.id,
  'Standard Block 6" Recipe',
  1,
  100,
  true
FROM inventory_items fg
WHERE fg.sku = 'BLK-FG-001'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_bom b
    WHERE b.finished_item_id = fg.id AND b.version = 1
  );

INSERT INTO inventory_bom_lines (bom_id, component_item_id, quantity_required, unit, scrap_factor, sort_order)
SELECT bom.id, rm.id, 50, 'kg', 0.05, 1
FROM inventory_bom bom
JOIN inventory_items fg ON fg.id = bom.finished_item_id AND fg.sku = 'BLK-FG-001'
JOIN inventory_items rm ON rm.sku = 'BLK-RM-001' AND rm.factory_id = bom.factory_id
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_bom_lines bl
  JOIN inventory_items rm2 ON rm2.id = bl.component_item_id AND rm2.sku = 'BLK-RM-001'
  WHERE bl.bom_id = bom.id
);

INSERT INTO inventory_bom_lines (bom_id, component_item_id, quantity_required, unit, scrap_factor, sort_order)
SELECT bom.id, rm.id, 120, 'kg', 0.03, 2
FROM inventory_bom bom
JOIN inventory_items fg ON fg.id = bom.finished_item_id AND fg.sku = 'BLK-FG-001'
JOIN inventory_items rm ON rm.sku = 'BLK-RM-002' AND rm.factory_id = bom.factory_id
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_bom_lines bl
  JOIN inventory_items rm2 ON rm2.id = bl.component_item_id AND rm2.sku = 'BLK-RM-002'
  WHERE bl.bom_id = bom.id
);

-- Recycling BOM: HDPE Pellets
INSERT INTO inventory_bom (organization_id, factory_id, finished_item_id, name, version, yield_quantity, is_active)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  fg.id,
  'HDPE Pellet Recipe',
  1,
  500,
  true
FROM inventory_items fg
WHERE fg.sku = 'REC-FG-001'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_bom b
    WHERE b.finished_item_id = fg.id AND b.version = 1
  );

INSERT INTO inventory_bom_lines (bom_id, component_item_id, quantity_required, unit, scrap_factor, sort_order)
SELECT bom.id, rm.id, 100, 'kg', 0.115, 1
FROM inventory_bom bom
JOIN inventory_items fg ON fg.id = bom.finished_item_id AND fg.sku = 'REC-FG-001'
JOIN inventory_items rm ON rm.sku = 'REC-RM-001' AND rm.factory_id = bom.factory_id
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_bom_lines bl WHERE bl.bom_id = bom.id
);

-- Reset seeded quantities so stock reflects real movements only
UPDATE inventory_items
SET quantity = 0, reserved_quantity = 0, updated_at = NOW()
WHERE organization_id = '11111111-1111-1111-1111-111111111111';

-- Audit trigger must read org from OLD on DELETE (row is already gone from the table)
CREATE OR REPLACE FUNCTION create_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  uid UUID;
BEGIN
  uid := auth.uid();
  IF TG_OP = 'DELETE' THEN
    org_id := OLD.organization_id;
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values)
    VALUES (org_id, uid, TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    org_id := COALESCE(NEW.organization_id, OLD.organization_id);
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
    VALUES (org_id, uid, TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    org_id := NEW.organization_id;
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values)
    VALUES (org_id, uid, TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bulk rebuild: skip audit noise during migration (delete trigger not created yet)
ALTER TABLE inventory_movements DISABLE TRIGGER audit_inventory_movements;

-- Remove old production-linked movements and rebuild from current counts
DELETE FROM inventory_movements
WHERE reference_type = 'production_counts';

-- Rebuild inventory from production counts (mirrors app sync rules)
DO $$
DECLARE
  rec RECORD;
  raw_item_id UUID;
  fg_item_id UUID;
  bom_rec RECORD;
  line_rec RECORD;
  scale NUMERIC;
  qty NUMERIC;
BEGIN
  FOR rec IN SELECT * FROM production_counts ORDER BY created_at ASC LOOP
    -- Damaged / waste return to raw material
    IF COALESCE(rec.damaged_count, 0) > 0 THEN
      SELECT id INTO raw_item_id FROM inventory_items
      WHERE factory_id = rec.factory_id AND category = 'raw_material' AND is_active = true
      ORDER BY created_at LIMIT 1;
      IF raw_item_id IS NOT NULL THEN
        INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
        VALUES (rec.organization_id, rec.factory_id, raw_item_id, 'damage_return', rec.damaged_count, 'production_counts', rec.id, rec.entered_by);
      END IF;
    END IF;

    -- Block factory: after curing output
    IF rec.checkpoint = 'after_curing' AND COALESCE(rec.good_count, 0) > 0 THEN
      SELECT b.id, b.factory_id, b.finished_item_id, b.name, b.yield_quantity
      INTO bom_rec
      FROM inventory_bom b
      WHERE b.factory_id = rec.factory_id AND b.is_active = true
      ORDER BY b.version DESC LIMIT 1;

      IF bom_rec.id IS NOT NULL THEN
        scale := rec.good_count / NULLIF(bom_rec.yield_quantity, 0);
        FOR line_rec IN
          SELECT component_item_id, quantity_required, scrap_factor
          FROM inventory_bom_lines WHERE bom_id = bom_rec.id ORDER BY sort_order
        LOOP
          qty := -line_rec.quantity_required * scale * (1 + COALESCE(line_rec.scrap_factor, 0));
          IF qty <> 0 THEN
            INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by, notes)
            VALUES (rec.organization_id, rec.factory_id, line_rec.component_item_id, 'production_out', qty, 'production_counts', rec.id, rec.entered_by, 'BOM consumption: ' || bom_rec.name);
          END IF;
        END LOOP;
        INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by, notes)
        VALUES (rec.organization_id, rec.factory_id, bom_rec.finished_item_id, 'production_in', rec.good_count, 'production_counts', rec.id, rec.entered_by, 'BOM output: ' || bom_rec.name);
      ELSE
        SELECT id INTO fg_item_id FROM inventory_items
        WHERE factory_id = rec.factory_id AND category = 'finished_goods' AND is_active = true
        ORDER BY created_at LIMIT 1;
        IF fg_item_id IS NOT NULL THEN
          INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
          VALUES (rec.organization_id, rec.factory_id, fg_item_id, 'production_in', rec.good_count, 'production_counts', rec.id, rec.entered_by);
        END IF;
      END IF;
    END IF;

    -- Recycling: material in/out
    IF COALESCE(rec.material_received, 0) > 0 THEN
      SELECT id INTO raw_item_id FROM inventory_items
      WHERE factory_id = rec.factory_id AND category = 'raw_material' AND is_active = true
      ORDER BY created_at LIMIT 1;
      IF raw_item_id IS NOT NULL THEN
        INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
        VALUES (rec.organization_id, rec.factory_id, raw_item_id, 'production_out', -rec.material_received, 'production_counts', rec.id, rec.entered_by);
      END IF;
    END IF;

    IF COALESCE(rec.waste_rejected, 0) > 0 THEN
      SELECT id INTO raw_item_id FROM inventory_items
      WHERE factory_id = rec.factory_id AND category = 'raw_material' AND is_active = true
      ORDER BY created_at LIMIT 1;
      IF raw_item_id IS NOT NULL THEN
        INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
        VALUES (rec.organization_id, rec.factory_id, raw_item_id, 'damage_return', rec.waste_rejected, 'production_counts', rec.id, rec.entered_by);
      END IF;
    END IF;

    IF COALESCE(rec.processed_output, 0) > 0 THEN
      SELECT b.id, b.factory_id, b.finished_item_id, b.name, b.yield_quantity
      INTO bom_rec
      FROM inventory_bom b
      WHERE b.factory_id = rec.factory_id AND b.is_active = true
      ORDER BY b.version DESC LIMIT 1;

      IF bom_rec.id IS NOT NULL THEN
        scale := rec.processed_output / NULLIF(bom_rec.yield_quantity, 0);
        FOR line_rec IN
          SELECT component_item_id, quantity_required, scrap_factor
          FROM inventory_bom_lines WHERE bom_id = bom_rec.id ORDER BY sort_order
        LOOP
          qty := -line_rec.quantity_required * scale * (1 + COALESCE(line_rec.scrap_factor, 0));
          IF qty <> 0 THEN
            INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by, notes)
            VALUES (rec.organization_id, rec.factory_id, line_rec.component_item_id, 'production_out', qty, 'production_counts', rec.id, rec.entered_by, 'BOM consumption: ' || bom_rec.name);
          END IF;
        END LOOP;
        INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by, notes)
        VALUES (rec.organization_id, rec.factory_id, bom_rec.finished_item_id, 'production_in', rec.processed_output, 'production_counts', rec.id, rec.entered_by, 'BOM output: ' || bom_rec.name);
      ELSE
        SELECT id INTO fg_item_id FROM inventory_items
        WHERE factory_id = rec.factory_id AND category = 'finished_goods' AND is_active = true
        ORDER BY created_at LIMIT 1;
        IF fg_item_id IS NOT NULL THEN
          INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
          VALUES (rec.organization_id, rec.factory_id, fg_item_id, 'production_in', rec.processed_output, 'production_counts', rec.id, rec.entered_by);
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

ALTER TABLE inventory_movements ENABLE TRIGGER audit_inventory_movements;

DROP TRIGGER IF EXISTS trg_inventory_movement_quantity_delete ON inventory_movements;
CREATE TRIGGER trg_inventory_movement_quantity_delete
AFTER DELETE ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION reverse_inventory_quantity();
