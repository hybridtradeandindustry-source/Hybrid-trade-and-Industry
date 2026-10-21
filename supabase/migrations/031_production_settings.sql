-- Org-level production settings (block factory): admin-editable default daily target.

CREATE TABLE production_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  default_daily_target_plates NUMERIC NOT NULL DEFAULT 650,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE production_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_settings_org ON production_settings FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE TRIGGER trg_production_settings_updated BEFORE UPDATE ON production_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO production_settings (organization_id, default_daily_target_plates)
SELECT id, 650 FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

COMMENT ON TABLE production_settings IS 'Org-level production configuration for the block factory (e.g. default daily plate target used when a daily log has no per-day override).';
