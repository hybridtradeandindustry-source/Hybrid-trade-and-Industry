-- Admin write access for RBAC management
-- Replaces simpler policies from 003 with org-scoped versions.

DROP POLICY IF EXISTS profiles_self_select ON profiles;
DROP POLICY IF EXISTS profiles_admin ON profiles;
DROP POLICY IF EXISTS roles_admin ON roles;
DROP POLICY IF EXISTS user_roles_admin ON user_roles;
DROP POLICY IF EXISTS role_permissions_admin ON role_permissions;

CREATE POLICY profiles_self_select ON profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY profiles_admin ON profiles
  FOR ALL TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND has_permission('admin', 'manage')
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND has_permission('admin', 'manage')
  );

CREATE POLICY roles_admin ON roles
  FOR ALL TO authenticated
  USING (
    organization_id = get_user_organization_id()
    AND has_permission('admin', 'manage')
  )
  WITH CHECK (
    organization_id = get_user_organization_id()
    AND has_permission('admin', 'manage')
  );

CREATE POLICY role_permissions_admin ON role_permissions
  FOR ALL TO authenticated
  USING (
    role_id IN (SELECT id FROM roles WHERE organization_id = get_user_organization_id())
    AND has_permission('admin', 'manage')
  )
  WITH CHECK (
    role_id IN (SELECT id FROM roles WHERE organization_id = get_user_organization_id())
    AND has_permission('admin', 'manage')
  );

CREATE POLICY user_roles_admin ON user_roles
  FOR ALL TO authenticated
  USING (
    user_id IN (SELECT id FROM profiles WHERE organization_id = get_user_organization_id())
    AND has_permission('admin', 'manage')
  )
  WITH CHECK (
    user_id IN (SELECT id FROM profiles WHERE organization_id = get_user_organization_id())
    AND has_permission('admin', 'manage')
  );

-- Enterprise inventory permissions (if not already seeded)
INSERT INTO permissions (resource, action, description) VALUES
  ('inventory', 'approve_catalog', 'Approve catalog change requests'),
  ('inventory', 'requisition', 'Create purchase requisitions'),
  ('inventory', 'bom', 'Manage bill of materials')
ON CONFLICT (resource, action) DO NOTHING;
