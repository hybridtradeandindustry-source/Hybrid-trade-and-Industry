-- Storage buckets for documents and photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('photos', 'photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('signatures', 'signatures', false, 2097152, ARRAY['image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "documents_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents' AND has_permission('documents', 'upload'));

CREATE POLICY "documents_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents' AND has_permission('documents', 'read'));

CREATE POLICY "photos_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('photos', 'signatures'));

CREATE POLICY "photos_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('photos', 'signatures'));

-- Admin RBAC write policies
CREATE POLICY "roles_admin" ON roles FOR ALL TO authenticated
  USING (has_permission('admin', 'manage'))
  WITH CHECK (has_permission('admin', 'manage'));

CREATE POLICY "user_roles_admin" ON user_roles FOR ALL TO authenticated
  USING (has_permission('admin', 'manage'))
  WITH CHECK (has_permission('admin', 'manage'));

CREATE POLICY "role_permissions_admin" ON role_permissions FOR ALL TO authenticated
  USING (has_permission('admin', 'manage'))
  WITH CHECK (has_permission('admin', 'manage'));

-- Production side-effects: post damaged blocks to raw material, approved to finished goods
CREATE OR REPLACE FUNCTION handle_production_count_inventory()
RETURNS TRIGGER AS $$
DECLARE
  raw_item_id UUID;
  fg_item_id UUID;
BEGIN
  IF NEW.factory_id IS NOT NULL AND NEW.damaged_count IS NOT NULL AND NEW.damaged_count > 0 THEN
    SELECT id INTO raw_item_id FROM inventory_items
    WHERE factory_id = NEW.factory_id AND category = 'raw_material' AND is_active = true
    LIMIT 1;
    IF raw_item_id IS NOT NULL THEN
      INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
      VALUES (NEW.organization_id, NEW.factory_id, raw_item_id, 'damage_return', NEW.damaged_count, 'production_counts', NEW.id, NEW.entered_by);
    END IF;
  END IF;

  IF NEW.checkpoint = 'after_curing' AND NEW.good_count IS NOT NULL AND NEW.good_count > 0 THEN
    SELECT id INTO fg_item_id FROM inventory_items
    WHERE factory_id = NEW.factory_id AND category = 'finished_goods' AND is_active = true
    LIMIT 1;
    IF fg_item_id IS NOT NULL THEN
      INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
      VALUES (NEW.organization_id, NEW.factory_id, fg_item_id, 'production_in', NEW.good_count, 'production_counts', NEW.id, NEW.entered_by);
    END IF;
  END IF;

  IF NEW.processed_output IS NOT NULL AND NEW.processed_output > 0 THEN
    SELECT id INTO fg_item_id FROM inventory_items
    WHERE factory_id = NEW.factory_id AND category = 'finished_goods' AND is_active = true
    LIMIT 1;
    IF fg_item_id IS NOT NULL THEN
      INSERT INTO inventory_movements (organization_id, factory_id, item_id, movement_type, quantity, reference_type, reference_id, created_by)
      VALUES (NEW.organization_id, NEW.factory_id, fg_item_id, 'production_in', NEW.processed_output, 'production_counts', NEW.id, NEW.entered_by);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_production_count_inventory
AFTER INSERT ON production_counts
FOR EACH ROW EXECUTE FUNCTION handle_production_count_inventory();
