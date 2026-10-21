-- Finance: allow text operational record refs + seed data + write policies

-- operational_record_id was UUID-only; UI accepts order numbers and free-text refs
ALTER TABLE reconciliation_records
  ALTER COLUMN operational_record_id TYPE TEXT USING operational_record_id::TEXT;

-- Sage transaction CRUD for finance sync role
DROP POLICY IF EXISTS sage_transactions_write ON sage_transactions;
CREATE POLICY sage_transactions_write ON sage_transactions FOR ALL USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'sync')
);

-- Sage sync log insert for sync action
DROP POLICY IF EXISTS sage_sync_logs_write ON sage_sync_logs;
CREATE POLICY sage_sync_logs_write ON sage_sync_logs FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id() AND has_permission('finance', 'sync')
);

DROP POLICY IF EXISTS sage_sync_logs_update ON sage_sync_logs;
CREATE POLICY sage_sync_logs_update ON sage_sync_logs FOR UPDATE USING (
  organization_id = get_user_organization_id() AND has_permission('finance', 'sync')
);

-- Sample Sage transactions (idempotent)
INSERT INTO sage_transactions (id, organization_id, sage_id, transaction_date, description, amount, transaction_type, factory_id)
VALUES
  ('66666666-6666-6666-6666-666666666661', '11111111-1111-1111-1111-111111111111', 'SAGE-TX-001', CURRENT_DATE, 'Block sales revenue', 45000.00, 'revenue', '22222222-2222-2222-2222-222222222221'),
  ('66666666-6666-6666-6666-666666666662', '11111111-1111-1111-1111-111111111111', 'SAGE-TX-002', CURRENT_DATE, 'Raw material purchase', -12000.00, 'expense', '22222222-2222-2222-2222-222222222221'),
  ('66666666-6666-6666-6666-666666666663', '11111111-1111-1111-1111-111111111111', 'SAGE-TX-003', CURRENT_DATE, 'Recycling revenue', 18500.00, 'revenue', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (organization_id, sage_id) DO NOTHING;

-- Latest sync log
INSERT INTO sage_sync_logs (id, organization_id, status, records_processed, started_at, completed_at)
VALUES (
  '77777777-7777-7777-7777-777777777771',
  '11111111-1111-1111-1111-111111111111',
  'success',
  156,
  NOW() - INTERVAL '30 minutes',
  NOW() - INTERVAL '29 minutes'
)
ON CONFLICT (id) DO NOTHING;

-- Sample reconciliation rows linked to seeded orders
INSERT INTO reconciliation_records (
  id,
  organization_id,
  factory_id,
  operational_record_type,
  operational_record_id,
  operational_amount,
  sage_amount,
  status
)
VALUES
  (
    '88888888-8888-8888-8888-888888888881',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    'order',
    '55555555-5555-5555-5555-555555555553',
    22000.00,
    22000.00,
    'matched'
  ),
  (
    '88888888-8888-8888-8888-888888888882',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    'order',
    '55555555-5555-5555-5555-555555555552',
    8900.00,
    8500.00,
    'variance'
  ),
  (
    '88888888-8888-8888-8888-888888888883',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'order',
    '55555555-5555-5555-5555-555555555554',
    5600.00,
    NULL,
    'pending'
  )
ON CONFLICT (id) DO NOTHING;
