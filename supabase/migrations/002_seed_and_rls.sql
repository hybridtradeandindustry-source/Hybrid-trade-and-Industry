-- Seed data and RLS policies

-- Seed permissions
INSERT INTO permissions (resource, action, description) VALUES
  ('dashboard', 'read', 'View dashboards'),
  ('finance', 'read', 'View financial data'),
  ('finance', 'verify', 'Verify and approve financial records'),
  ('finance', 'sync', 'Trigger Sage 50 sync'),
  ('production', 'read', 'View production data'),
  ('production', 'create', 'Create production counts'),
  ('production', 'verify', 'Verify production entries'),
  ('inventory', 'read', 'View inventory'),
  ('inventory', 'manage', 'Manage inventory movements'),
  ('inventory', 'count', 'Perform stock counts'),
  ('sales', 'read', 'View sales and orders'),
  ('sales', 'manage', 'Manage orders and customers'),
  ('sales', 'deliver', 'Confirm deliveries'),
  ('hr', 'read', 'View HR data'),
  ('hr', 'manage', 'Manage HR records'),
  ('reports', 'read', 'View reports'),
  ('reports', 'export', 'Export reports'),
  ('ai', 'read', 'View AI briefings'),
  ('ai', 'chat', 'Chat with AI assistant'),
  ('admin', 'manage', 'Manage roles and permissions'),
  ('documents', 'read', 'View documents'),
  ('documents', 'upload', 'Upload documents'),
  ('notifications', 'read', 'View notifications'),
  ('audit', 'read', 'View audit logs');

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE factories ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sage_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_submissions ENABLE ROW LEVEL SECURITY;

-- Organization-scoped policies
CREATE POLICY org_isolation ON organizations FOR SELECT USING (id = get_user_organization_id());

CREATE POLICY factories_org ON factories FOR ALL USING (organization_id = get_user_organization_id());

CREATE POLICY profiles_org ON profiles FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY profiles_self ON profiles FOR UPDATE USING (id = auth.uid());

CREATE POLICY roles_org ON roles FOR SELECT USING (organization_id = get_user_organization_id());
CREATE POLICY permissions_read ON permissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY user_roles_org ON user_roles FOR SELECT USING (
  user_id IN (SELECT id FROM profiles WHERE organization_id = get_user_organization_id())
);

CREATE POLICY audit_org ON audit_logs FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('audit', 'read')
);

CREATE POLICY inventory_items_org ON inventory_items FOR ALL USING (
  organization_id = get_user_organization_id() AND has_permission('inventory', 'read')
);

CREATE POLICY inventory_movements_org ON inventory_movements FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY stock_counts_org ON stock_counts FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY production_batches_org ON production_batches FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY production_counts_org ON production_counts FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY customers_org ON customers FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY orders_org ON orders FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY order_items_org ON order_items FOR ALL USING (
  order_id IN (SELECT id FROM orders WHERE organization_id = get_user_organization_id())
);

CREATE POLICY deliveries_org ON deliveries FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY sage_sync_logs_org ON sage_sync_logs FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'read')
);

CREATE POLICY sage_accounts_org ON sage_accounts FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'read')
);

CREATE POLICY sage_transactions_org ON sage_transactions FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'read')
);

CREATE POLICY sage_invoices_org ON sage_invoices FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'read')
);

CREATE POLICY sage_budgets_org ON sage_budgets FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'read')
);

CREATE POLICY reconciliation_org ON reconciliation_records FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY employees_org ON employees FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY attendance_org ON attendance_records FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY leave_org ON leave_requests FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY documents_org ON documents FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY notifications_own ON notifications FOR ALL USING (user_id = auth.uid());

CREATE POLICY ai_briefings_org ON ai_briefings FOR SELECT USING (
  organization_id = get_user_organization_id() AND has_permission('ai', 'read')
);

CREATE POLICY ai_alerts_org ON ai_alerts FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY ai_conversations_own ON ai_conversations FOR ALL USING (user_id = auth.uid());

CREATE POLICY report_templates_org ON report_templates FOR SELECT USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY report_schedules_org ON report_schedules FOR SELECT USING (
  organization_id = get_user_organization_id()
);

CREATE POLICY offline_own ON offline_submissions FOR ALL USING (user_id = auth.uid());

-- Storage buckets (run via Supabase dashboard or separate migration)
-- documents, delivery-proofs, production-photos, hr-documents

-- Demo seed for development
INSERT INTO organizations (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Elecnovatech Manufacturing', 'elecnovatech');

INSERT INTO factories (id, organization_id, name, slug, type) VALUES
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Block Factory', 'block-factory', 'block'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Plastic Recycling Factory', 'recycling-factory', 'recycling');

INSERT INTO roles (id, organization_id, name, slug, description, is_system) VALUES
  ('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Owner / CEO', 'ceo', 'Full access to everything', true),
  ('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Finance Manager', 'finance_manager', 'All financial data company-wide', true),
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Factory Manager', 'factory_manager', 'Full operational view of assigned factory', true),
  ('33333333-3333-3333-3333-333333333334', '11111111-1111-1111-1111-111111111111', 'Production Supervisor', 'production_supervisor', 'Production data and verification', true),
  ('33333333-3333-3333-3333-333333333335', '11111111-1111-1111-1111-111111111111', 'Warehouse Officer', 'warehouse_officer', 'Inventory management', true),
  ('33333333-3333-3333-3333-333333333336', '11111111-1111-1111-1111-111111111111', 'Sales Manager', 'sales_manager', 'Orders, customers, deliveries', true),
  ('33333333-3333-3333-3333-333333333337', '11111111-1111-1111-1111-111111111111', 'HR Manager', 'hr_manager', 'Employee data company-wide', true),
  ('33333333-3333-3333-3333-333333333338', '11111111-1111-1111-1111-111111111111', 'Floor Employee', 'floor_employee', 'Mobile tasks only', true),
  ('33333333-3333-3333-3333-333333333339', '11111111-1111-1111-1111-111111111111', 'Driver', 'driver', 'Delivery tasks only', true);

-- Assign all permissions to CEO role
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333331', id FROM permissions;

-- Finance Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333332', id FROM permissions
WHERE resource IN ('dashboard', 'finance', 'sales', 'reports', 'ai', 'documents', 'notifications', 'audit')
  AND action IN ('read', 'verify', 'sync', 'export', 'chat', 'upload');

-- Factory Manager permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM permissions
WHERE resource IN ('dashboard', 'production', 'inventory', 'sales', 'reports', 'ai', 'documents', 'notifications')
  AND action IN ('read', 'create', 'verify', 'manage', 'count', 'chat', 'upload', 'export');

-- Production Supervisor
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333334', id FROM permissions
WHERE (resource, action) IN (
  ('dashboard', 'read'), ('production', 'read'), ('production', 'create'), ('production', 'verify'),
  ('inventory', 'read'), ('ai', 'read'), ('notifications', 'read'), ('documents', 'upload')
);

-- Warehouse Officer
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333335', id FROM permissions
WHERE (resource, action) IN (
  ('dashboard', 'read'), ('inventory', 'read'), ('inventory', 'manage'), ('inventory', 'count'),
  ('production', 'read'), ('ai', 'read'), ('notifications', 'read'), ('documents', 'upload')
);

-- Sales Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333336', id FROM permissions
WHERE resource IN ('dashboard', 'sales', 'reports', 'ai', 'documents', 'notifications')
  AND action IN ('read', 'manage', 'deliver', 'export', 'chat', 'upload');

-- HR Manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333337', id FROM permissions
WHERE resource IN ('dashboard', 'hr', 'reports', 'ai', 'documents', 'notifications')
  AND action IN ('read', 'manage', 'export', 'chat', 'upload');

-- Floor Employee (mobile)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333338', id FROM permissions
WHERE (resource, action) IN (
  ('production', 'create'), ('inventory', 'count'), ('notifications', 'read'), ('documents', 'upload')
);

-- Driver (mobile)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333339', id FROM permissions
WHERE (resource, action) IN (
  ('sales', 'deliver'), ('notifications', 'read'), ('documents', 'upload')
);

-- Sample inventory items
INSERT INTO inventory_items (organization_id, factory_id, name, sku, category, unit, quantity, low_stock_threshold) VALUES
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 'Cement Mix', 'BLK-RM-001', 'raw_material', 'kg', 5000, 500),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 'Standard Block 6"', 'BLK-FG-001', 'finished_goods', 'units', 1200, 200),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Plastic Waste Input', 'REC-RM-001', 'raw_material', 'kg', 3000, 300),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Recycled Pellets', 'REC-FG-001', 'finished_goods', 'kg', 800, 100);

-- Sample customers
INSERT INTO customers (id, organization_id, name, email, phone, balance) VALUES
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', 'ABC Construction Ltd', 'orders@abcconstruction.com', '+1234567890', 15000.00),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', 'GreenBuild Supplies', 'procurement@greenbuild.com', '+1234567891', 8500.00);

-- Sample orders
INSERT INTO orders (id, organization_id, factory_id, customer_id, order_number, status, total_amount, delivery_date) VALUES
  ('55555555-5555-5555-5555-555555555551', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '44444444-4444-4444-4444-444444444441', 'ORD-1051', 'pending', 12500.00, CURRENT_DATE + 7),
  ('55555555-5555-5555-5555-555555555552', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '44444444-4444-4444-4444-444444444442', 'ORD-1052', 'pending', 8900.00, CURRENT_DATE + 3),
  ('55555555-5555-5555-5555-555555555553', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', '44444444-4444-4444-4444-444444444441', 'ORD-1049', 'confirmed', 22000.00, CURRENT_DATE + 14),
  ('55555555-5555-5555-5555-555555555554', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444442', 'ORD-1044', 'in_production', 5600.00, CURRENT_DATE + 5);

UPDATE orders SET ai_risk_flag = true, ai_risk_reason = 'Production behind schedule — delivery date at risk' WHERE order_number = 'ORD-1052';

-- Report templates
INSERT INTO report_templates (organization_id, name, slug, module, config, is_system) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Daily Production Summary', 'daily-production', 'production', '{"period": "daily"}', true),
  ('11111111-1111-1111-1111-111111111111', 'Finance Reconciliation Report', 'finance-reconciliation', 'finance', '{"period": "weekly"}', true),
  ('11111111-1111-1111-1111-111111111111', 'Inventory Status Report', 'inventory-status', 'inventory', '{"period": "daily"}', true),
  ('11111111-1111-1111-1111-111111111111', 'Sales Pipeline Report', 'sales-pipeline', 'sales', '{"period": "weekly"}', true),
  ('11111111-1111-1111-1111-111111111111', 'HR Attendance Report', 'hr-attendance', 'hr', '{"period": "monthly"}', true);

INSERT INTO report_schedules (organization_id, template_id, cron_expression, recipients, is_active)
SELECT '11111111-1111-1111-1111-111111111111', id, '0 7 * * *', '["ceo@elecnovatech.com"]', true
FROM report_templates WHERE slug = 'daily-production';
