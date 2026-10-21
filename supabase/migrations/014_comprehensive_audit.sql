-- Comprehensive audit coverage: triggers on all org-scoped business tables
-- plus child tables that resolve organization_id via parent lookup.

CREATE OR REPLACE FUNCTION add_audit_trigger_if_missing(target_table regclass)
RETURNS void AS $$
DECLARE
  trigger_name text := 'audit_' || target_table::text;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trigger_name, target_table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION create_audit_log()',
    trigger_name,
    target_table
  );
END;
$$ LANGUAGE plpgsql;

-- Core business tables (orders/production/inventory/finance already partially covered)
SELECT add_audit_trigger_if_missing('inventory_items'::regclass);
SELECT add_audit_trigger_if_missing('production_batches'::regclass);
SELECT add_audit_trigger_if_missing('customers'::regclass);
SELECT add_audit_trigger_if_missing('deliveries'::regclass);
SELECT add_audit_trigger_if_missing('sage_transactions'::regclass);
SELECT add_audit_trigger_if_missing('sage_sync_logs'::regclass);
SELECT add_audit_trigger_if_missing('sage_accounts'::regclass);
SELECT add_audit_trigger_if_missing('sage_invoices'::regclass);
SELECT add_audit_trigger_if_missing('sage_budgets'::regclass);
SELECT add_audit_trigger_if_missing('employees'::regclass);
SELECT add_audit_trigger_if_missing('attendance_records'::regclass);
SELECT add_audit_trigger_if_missing('leave_requests'::regclass);
SELECT add_audit_trigger_if_missing('documents'::regclass);
SELECT add_audit_trigger_if_missing('notifications'::regclass);
SELECT add_audit_trigger_if_missing('profiles'::regclass);
SELECT add_audit_trigger_if_missing('roles'::regclass);
SELECT add_audit_trigger_if_missing('report_schedules'::regclass);
SELECT add_audit_trigger_if_missing('ai_alerts'::regclass);

-- Enterprise inventory catalog & ops
SELECT add_audit_trigger_if_missing('inventory_item_types'::regclass);
SELECT add_audit_trigger_if_missing('inventory_categories'::regclass);
SELECT add_audit_trigger_if_missing('inventory_units'::regclass);
SELECT add_audit_trigger_if_missing('inventory_unit_conversions'::regclass);
SELECT add_audit_trigger_if_missing('inventory_custom_field_definitions'::regclass);
SELECT add_audit_trigger_if_missing('inventory_sku_rules'::regclass);
SELECT add_audit_trigger_if_missing('inventory_catalog_change_requests'::regclass);
SELECT add_audit_trigger_if_missing('inventory_locations'::regclass);
SELECT add_audit_trigger_if_missing('inventory_location_stock'::regclass);
SELECT add_audit_trigger_if_missing('inventory_lots'::regclass);
SELECT add_audit_trigger_if_missing('inventory_bom'::regclass);
SELECT add_audit_trigger_if_missing('inventory_quarantine_holds'::regclass);
SELECT add_audit_trigger_if_missing('inventory_cycle_count_schedules'::regclass);
SELECT add_audit_trigger_if_missing('inventory_variance_rules'::regclass);
SELECT add_audit_trigger_if_missing('purchase_requisitions'::regclass);
SELECT add_audit_trigger_if_missing('sage_inventory_mappings'::regclass);
SELECT add_audit_trigger_if_missing('inventory_inter_factory_transfers'::regclass);

-- HR enterprise
SELECT add_audit_trigger_if_missing('hr_departments'::regclass);
SELECT add_audit_trigger_if_missing('hr_positions'::regclass);

-- Child tables without organization_id — resolve via parent
CREATE OR REPLACE FUNCTION create_audit_log_order_items()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  uid UUID := auth.uid();
  parent_order_id UUID;
BEGIN
  parent_order_id := COALESCE(NEW.order_id, OLD.order_id);
  SELECT organization_id INTO org_id FROM orders WHERE id = parent_order_id;
  IF org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values)
    VALUES (org_id, uid, 'order_items', OLD.id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
    VALUES (org_id, uid, 'order_items', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values)
    VALUES (org_id, uid, 'order_items', NEW.id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_order_items ON order_items;
CREATE TRIGGER audit_order_items
  AFTER INSERT OR UPDATE OR DELETE ON order_items
  FOR EACH ROW EXECUTE FUNCTION create_audit_log_order_items();

CREATE OR REPLACE FUNCTION create_audit_log_bom_lines()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  uid UUID := auth.uid();
  parent_bom_id UUID;
BEGIN
  parent_bom_id := COALESCE(NEW.bom_id, OLD.bom_id);
  SELECT organization_id INTO org_id FROM inventory_bom WHERE id = parent_bom_id;
  IF org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values)
    VALUES (org_id, uid, 'inventory_bom_lines', OLD.id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
    VALUES (org_id, uid, 'inventory_bom_lines', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values)
    VALUES (org_id, uid, 'inventory_bom_lines', NEW.id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_inventory_bom_lines ON inventory_bom_lines;
CREATE TRIGGER audit_inventory_bom_lines
  AFTER INSERT OR UPDATE OR DELETE ON inventory_bom_lines
  FOR EACH ROW EXECUTE FUNCTION create_audit_log_bom_lines();

CREATE OR REPLACE FUNCTION create_audit_log_requisition_lines()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  uid UUID := auth.uid();
  parent_id UUID;
BEGIN
  parent_id := COALESCE(NEW.requisition_id, OLD.requisition_id);
  SELECT organization_id INTO org_id FROM purchase_requisitions WHERE id = parent_id;
  IF org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values)
    VALUES (org_id, uid, 'purchase_requisition_lines', OLD.id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
    VALUES (org_id, uid, 'purchase_requisition_lines', NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values)
    VALUES (org_id, uid, 'purchase_requisition_lines', NEW.id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_purchase_requisition_lines ON purchase_requisition_lines;
CREATE TRIGGER audit_purchase_requisition_lines
  AFTER INSERT OR UPDATE OR DELETE ON purchase_requisition_lines
  FOR EACH ROW EXECUTE FUNCTION create_audit_log_requisition_lines();

CREATE OR REPLACE FUNCTION create_audit_log_user_roles()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  uid UUID := auth.uid();
  target_user_id UUID;
BEGIN
  target_user_id := COALESCE(NEW.user_id, OLD.user_id);
  SELECT organization_id INTO org_id FROM profiles WHERE id = target_user_id;
  IF org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values)
    VALUES (org_id, uid, 'user_roles', OLD.user_id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
    VALUES (org_id, uid, 'user_roles', NEW.user_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values)
    VALUES (org_id, uid, 'user_roles', NEW.user_id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_user_roles ON user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION create_audit_log_user_roles();

CREATE OR REPLACE FUNCTION create_audit_log_role_permissions()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  uid UUID := auth.uid();
  parent_role_id UUID;
BEGIN
  parent_role_id := COALESCE(NEW.role_id, OLD.role_id);
  SELECT organization_id INTO org_id FROM roles WHERE id = parent_role_id;
  IF org_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values)
    VALUES (org_id, uid, 'role_permissions', OLD.role_id, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, old_values, new_values)
    VALUES (org_id, uid, 'role_permissions', NEW.role_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSE
    INSERT INTO audit_logs (organization_id, user_id, entity_type, entity_id, action, new_values)
    VALUES (org_id, uid, 'role_permissions', NEW.role_id, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_role_permissions ON role_permissions;
CREATE TRIGGER audit_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION create_audit_log_role_permissions();

DROP FUNCTION IF EXISTS add_audit_trigger_if_missing(regclass);
