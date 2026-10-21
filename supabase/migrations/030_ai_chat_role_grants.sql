-- Grant ai:chat to Production Supervisor and Warehouse Officer so they can use
-- the AI assistant (scoped to their own permissions via TOOL_PERMISSIONS —
-- see src/lib/ai/tools/index.ts). Previously only ceo/finance_manager/
-- factory_manager/sales_manager/hr_manager could chat at all; store keepers
-- and production supervisors got a flat 403 instead of a role-scoped answer.

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333334', p.id
FROM permissions p
WHERE p.resource = 'ai' AND p.action = 'chat'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333335', p.id
FROM permissions p
WHERE p.resource = 'ai' AND p.action = 'chat'
ON CONFLICT DO NOTHING;
