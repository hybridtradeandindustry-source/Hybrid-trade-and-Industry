-- Daily production logs for block factory batches: per-day target vs. actual (in plates),
-- with required shortfall reason, and actual-vs-standard material usage/waste costing.

CREATE TABLE production_daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  target_plates NUMERIC NOT NULL,
  is_custom_target BOOLEAN NOT NULL DEFAULT FALSE,
  actual_plates NUMERIC,
  calculated_pieces NUMERIC,
  target_pieces NUMERIC NOT NULL,
  shortfall_reason TEXT,
  cement_bags_used NUMERIC,
  poliche_loads_used NUMERIC,
  standard_cement_bags NUMERIC NOT NULL DEFAULT 0,
  standard_poliche_loads NUMERIC NOT NULL DEFAULT 0,
  cement_waste_bags NUMERIC NOT NULL DEFAULT 0,
  poliche_waste_loads NUMERIC NOT NULL DEFAULT 0,
  waste_cost NUMERIC NOT NULL DEFAULT 0,
  entered_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, log_date)
);

CREATE INDEX idx_daily_logs_factory_date ON production_daily_logs(factory_id, log_date DESC);
CREATE INDEX idx_daily_logs_batch ON production_daily_logs(batch_id);

ALTER TABLE production_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_daily_logs_org ON production_daily_logs FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE TRIGGER trg_daily_logs_updated BEFORE UPDATE ON production_daily_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER audit_production_daily_logs AFTER INSERT OR UPDATE OR DELETE ON production_daily_logs
  FOR EACH ROW EXECUTE FUNCTION create_audit_log();

COMMENT ON TABLE production_daily_logs IS 'Per-batch, per-day production log: plates produced (converted to pieces via yield formula), target vs. actual, and actual-vs-standard cement/poliche usage with computed waste cost.';
