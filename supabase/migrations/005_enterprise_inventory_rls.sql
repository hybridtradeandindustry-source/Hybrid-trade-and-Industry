-- RLS + seed for enterprise inventory tables

INSERT INTO permissions (resource, action, description) VALUES
  ('inventory', 'approve_catalog', 'Approve catalog change requests'),
  ('inventory', 'requisition', 'Create purchase requisitions'),
  ('inventory', 'bom', 'Manage bill of materials')
ON CONFLICT (resource, action) DO NOTHING;

ALTER TABLE inventory_item_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sku_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_catalog_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_location_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_quarantine_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_cycle_count_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_variance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisition_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_inventory_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_inter_factory_transfers ENABLE ROW LEVEL SECURITY;

-- Org-scoped read for authenticated users (mirrors existing inventory pattern)
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'inventory_item_types', 'inventory_categories', 'inventory_units',
    'inventory_unit_conversions', 'inventory_custom_field_definitions',
    'inventory_sku_rules', 'inventory_catalog_change_requests',
    'inventory_locations', 'inventory_location_stock', 'inventory_lots',
    'inventory_bom', 'inventory_bom_lines', 'inventory_quarantine_holds',
    'inventory_cycle_count_schedules', 'inventory_variance_rules',
    'purchase_requisitions', 'purchase_requisition_lines',
    'sage_inventory_mappings', 'inventory_inter_factory_transfers'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT TO authenticated USING (true)',
      t, t
    );
    EXECUTE format(
      'CREATE POLICY %I_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t || '_manage', t
    );
  END LOOP;
END $$;

-- Default variance rule per org (applied on seed org if exists)
INSERT INTO inventory_variance_rules (organization_id, name, max_variance_percent, auto_approve)
SELECT id, 'Standard 2% auto-approve', 2.0, TRUE FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_variance_rules r WHERE r.organization_id = o.id AND r.name = 'Standard 2% auto-approve'
)
LIMIT 1;
