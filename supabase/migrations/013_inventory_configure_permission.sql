-- Inventory catalog configure permission (admin catalog structure)
INSERT INTO permissions (resource, action, description) VALUES
  ('inventory', 'configure', 'Configure inventory catalog structure')
ON CONFLICT (resource, action) DO NOTHING;
