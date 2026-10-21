-- Production seed: block batches + checkpoint counts + recycling cycle counts

INSERT INTO production_batches (id, organization_id, factory_id, batch_number, status)
VALUES
  (
    '99999999-9999-9999-9999-999999999991',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    'BATCH-20260702-A1B2',
    'curing'
  ),
  (
    '99999999-9999-9999-9999-999999999992',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    'BATCH-20260701-C3D4',
    'drying'
  )
ON CONFLICT (factory_id, batch_number) DO NOTHING;

INSERT INTO production_counts (
  id,
  organization_id,
  factory_id,
  batch_id,
  checkpoint,
  good_count,
  damaged_count,
  production_date
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    '99999999-9999-9999-9999-999999999991',
    'batch_count',
    500,
    0,
    CURRENT_DATE
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    '99999999-9999-9999-9999-999999999991',
    'after_drying',
    480,
    20,
    CURRENT_DATE
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    '99999999-9999-9999-9999-999999999991',
    'after_curing',
    455,
    25,
    CURRENT_DATE
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO production_counts (
  id,
  organization_id,
  factory_id,
  material_received,
  processed_output,
  waste_rejected,
  production_date
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    1200,
    980,
    220,
    CURRENT_DATE
  )
ON CONFLICT (id) DO NOTHING;
