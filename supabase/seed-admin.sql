-- Bootstrap your first Supabase admin (CEO) after creating an Auth user.
--
-- 1. Supabase Dashboard → Authentication → Users → Add user
--    Email: ceo@elecnovatech.com
--    Password: (your choice — e.g. a strong password; NOT stored in this repo)
--
-- 2. Copy the new user's UUID from the Users table.
--
-- 3. Replace USER_UUID_HERE below and run in SQL Editor:

-- INSERT INTO profiles (id, organization_id, email, full_name, is_active)
-- VALUES (
--   'USER_UUID_HERE',
--   '11111111-1111-1111-1111-111111111111',
--   'ceo@elecnovatech.com',
--   'James Morrison',
--   true
-- );

-- INSERT INTO user_roles (user_id, role_id)
-- VALUES (
--   'USER_UUID_HERE',
--   '33333333-3333-3333-3333-333333333331'
-- );

-- CEO role id = 33333333-3333-3333-3333-333333333331 (full admin)
-- Other role ids from migration 002_seed_and_rls.sql:
--   finance_manager    → 33333333-3333-3333-3333-333333333332
--   factory_manager    → 33333333-3333-3333-3333-333333333333
--   warehouse_officer  → 33333333-3333-3333-3333-333333333335
