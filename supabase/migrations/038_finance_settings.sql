-- Org-level finance settings: admin-editable withholding tax rate (default 3%, Ethiopian WHT).

CREATE TABLE finance_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  withholding_tax_rate_percent NUMERIC NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY finance_settings_org ON finance_settings FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE TRIGGER trg_finance_settings_updated BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO finance_settings (organization_id, withholding_tax_rate_percent)
SELECT id, 3 FROM organizations
ON CONFLICT (organization_id) DO NOTHING;

COMMENT ON TABLE finance_settings IS 'Org-level finance configuration — currently just the default withholding tax rate applied to orders when withholding is toggled on.';
