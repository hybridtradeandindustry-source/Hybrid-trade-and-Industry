-- AI Production Intelligence: snapshots, capacity cache, customer credit scores, permissions

-- ─── Production intelligence snapshots ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_intelligence_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  sample_batches int NOT NULL DEFAULT 0,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, factory_id)
);

CREATE INDEX IF NOT EXISTS idx_prod_intel_org_factory
  ON production_intelligence_snapshots (organization_id, factory_id);

-- ─── Capacity snapshots ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS capacity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  inventory jsonb NOT NULL DEFAULT '{}'::jsonb,
  predictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  limiting_factor text,
  confidence numeric(4,3),
  UNIQUE (organization_id, factory_id)
);

CREATE INDEX IF NOT EXISTS idx_capacity_snap_org_factory
  ON capacity_snapshots (organization_id, factory_id);

-- ─── Customer credit score columns ─────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_score int CHECK (credit_score IS NULL OR (credit_score BETWEEN 0 AND 100)),
  ADD COLUMN IF NOT EXISTS credit_limit numeric,
  ADD COLUMN IF NOT EXISTS credit_risk_tier text CHECK (
    credit_risk_tier IS NULL OR credit_risk_tier IN ('low', 'medium', 'high', 'blocked')
  ),
  ADD COLUMN IF NOT EXISTS credit_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_score_factors jsonb;

-- ─── New AI permissions ────────────────────────────────────────────────────
INSERT INTO permissions (resource, action, description)
VALUES
  ('ai', 'capacity', 'View production capacity predictions'),
  ('ai', 'credit_score', 'View and manage customer credit scores'),
  ('ai', 'refresh', 'Refresh AI intelligence snapshots and briefings')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant capacity to ops roles; credit_score to finance/sales/ceo; refresh to managers
DO $$
DECLARE
  perm_capacity uuid;
  perm_credit uuid;
  perm_refresh uuid;
  role_ceo uuid;
  role_factory uuid;
  role_production uuid;
  role_warehouse uuid;
  role_finance uuid;
  role_sales uuid;
BEGIN
  SELECT id INTO perm_capacity FROM permissions WHERE resource = 'ai' AND action = 'capacity';
  SELECT id INTO perm_credit FROM permissions WHERE resource = 'ai' AND action = 'credit_score';
  SELECT id INTO perm_refresh FROM permissions WHERE resource = 'ai' AND action = 'refresh';

  SELECT id INTO role_ceo FROM roles WHERE slug = 'ceo' LIMIT 1;
  SELECT id INTO role_factory FROM roles WHERE slug = 'factory_manager' LIMIT 1;
  SELECT id INTO role_production FROM roles WHERE slug = 'production_supervisor' LIMIT 1;
  SELECT id INTO role_warehouse FROM roles WHERE slug = 'warehouse_officer' LIMIT 1;
  SELECT id INTO role_finance FROM roles WHERE slug = 'finance_manager' LIMIT 1;
  SELECT id INTO role_sales FROM roles WHERE slug = 'sales_manager' LIMIT 1;

  IF perm_capacity IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r, perm_capacity FROM unnest(ARRAY[role_ceo, role_factory, role_production, role_warehouse]) AS r
    WHERE r IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF perm_credit IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r, perm_credit FROM unnest(ARRAY[role_ceo, role_finance, role_sales]) AS r
    WHERE r IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;

  IF perm_refresh IS NOT NULL THEN
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r, perm_refresh FROM unnest(ARRAY[role_ceo, role_factory, role_finance]) AS r
    WHERE r IS NOT NULL
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE production_intelligence_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE capacity_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS production_intelligence_snapshots_select ON production_intelligence_snapshots;
CREATE POLICY production_intelligence_snapshots_select ON production_intelligence_snapshots
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND has_permission('ai', 'read')
  );

DROP POLICY IF EXISTS production_intelligence_snapshots_write ON production_intelligence_snapshots;
CREATE POLICY production_intelligence_snapshots_write ON production_intelligence_snapshots
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (has_permission('ai', 'refresh') OR has_permission('ai', 'read'))
  );

DROP POLICY IF EXISTS capacity_snapshots_select ON capacity_snapshots;
CREATE POLICY capacity_snapshots_select ON capacity_snapshots
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (has_permission('ai', 'capacity') OR has_permission('ai', 'read'))
  );

DROP POLICY IF EXISTS capacity_snapshots_write ON capacity_snapshots;
CREATE POLICY capacity_snapshots_write ON capacity_snapshots
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND (has_permission('ai', 'refresh') OR has_permission('ai', 'capacity') OR has_permission('ai', 'read'))
  );
