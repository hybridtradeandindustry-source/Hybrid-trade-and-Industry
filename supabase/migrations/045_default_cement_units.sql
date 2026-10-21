-- inventory_units was never seeded, so the "Unit" dropdown had nothing to show
-- when editing catalog items (e.g. Portland Cement) even though the item itself
-- already had a unit value saved. Add kg/bag for Raw Material as a default —
-- more units can be added per type via Inventory > Setup > Units.
INSERT INTO inventory_units (organization_id, item_type_id, name, abbreviation, is_base_unit, is_active)
VALUES
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444401', 'Bag', 'bag', true, true),
  ('11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444401', 'Kilogram', 'kg', false, true)
ON CONFLICT (item_type_id, abbreviation) DO NOTHING;
