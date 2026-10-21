-- Operating expenses module — track, post to Sage ledger, integrate with finance dashboard.

CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, code)
);

CREATE TABLE operating_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  vendor_name TEXT,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank')),
  bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
  reference TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'cancelled')),
  sage_transaction_id UUID REFERENCES sage_transactions(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_operating_expenses_org ON operating_expenses(organization_id);
CREATE INDEX idx_operating_expenses_factory ON operating_expenses(factory_id);
CREATE INDEX idx_operating_expenses_date ON operating_expenses(expense_date DESC);
CREATE INDEX idx_operating_expenses_status ON operating_expenses(status);
CREATE INDEX idx_expense_categories_org ON expense_categories(organization_id);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE operating_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY expense_categories_org ON expense_categories FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY operating_expenses_org ON operating_expenses FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

CREATE TRIGGER trg_operating_expenses_updated BEFORE UPDATE ON operating_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Default categories for existing orgs
INSERT INTO expense_categories (organization_id, code, name, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'utilities', 'Utilities', 1),
  ('11111111-1111-1111-1111-111111111111', 'fuel', 'Fuel & Transport', 2),
  ('11111111-1111-1111-1111-111111111111', 'maintenance', 'Maintenance & Repairs', 3),
  ('11111111-1111-1111-1111-111111111111', 'office', 'Office & Admin', 4),
  ('11111111-1111-1111-1111-111111111111', 'rent', 'Rent & Facilities', 5),
  ('11111111-1111-1111-1111-111111111111', 'marketing', 'Marketing', 6),
  ('11111111-1111-1111-1111-111111111111', 'insurance', 'Insurance', 7),
  ('11111111-1111-1111-1111-111111111111', 'misc', 'Miscellaneous', 99)
ON CONFLICT (organization_id, code) DO NOTHING;

INSERT INTO permissions (resource, action, description) VALUES
  ('finance', 'manage', 'Record and manage operating expenses')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333332', id FROM permissions
WHERE resource = 'finance' AND action = 'manage'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333333', id FROM permissions
WHERE resource = 'finance' AND action = 'manage'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE operating_expenses IS 'Operating expenses — posted entries create sage_transactions with transaction_type expense.';
