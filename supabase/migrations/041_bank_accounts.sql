-- Banks can now have multiple accounts. A bank is just a name/code; each account under it
-- has its own account number and is what payments actually get attributed to, so "how much
-- was received by this account" can be computed straight from transaction history.

CREATE TABLE bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
  account_number TEXT NOT NULL,
  account_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bank_id, account_number)
);

CREATE INDEX idx_bank_accounts_org ON bank_accounts(organization_id);
CREATE INDEX idx_bank_accounts_bank ON bank_accounts(bank_id);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_org_read ON bank_accounts
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY bank_accounts_org_write ON bank_accounts
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Backfill: every existing bank with an account_number gets one migrated account.
INSERT INTO bank_accounts (organization_id, bank_id, account_number, account_name)
SELECT organization_id, id, account_number, 'Primary'
FROM banks
WHERE account_number IS NOT NULL AND account_number <> '';

-- bank_account_id on every payment-carrying table, alongside the existing bank_id (kept in
-- sync by the app layer at write time) so existing bank-level reports/joins keep working
-- unchanged while new account-level reporting reads bank_account_id.
ALTER TABLE customer_payments
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_payments_bank_account ON customer_payments(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_orders_bank_account ON orders(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_material_purchases_bank_account ON material_purchases(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_bank_account ON supplier_payments(bank_account_id);

-- Backfill bank_account_id from the existing bank_id, via the account just migrated above —
-- deterministic since each bank had exactly one account_number before this migration.
UPDATE customer_payments cp
SET bank_account_id = ba.id
FROM bank_accounts ba
WHERE ba.bank_id = cp.bank_id AND cp.bank_id IS NOT NULL AND cp.bank_account_id IS NULL;

UPDATE orders o
SET bank_account_id = ba.id
FROM bank_accounts ba
WHERE ba.bank_id = o.bank_id AND o.bank_id IS NOT NULL AND o.bank_account_id IS NULL;

UPDATE material_purchases mp
SET bank_account_id = ba.id
FROM bank_accounts ba
WHERE ba.bank_id = mp.bank_id AND mp.bank_id IS NOT NULL AND mp.bank_account_id IS NULL;

UPDATE supplier_payments sp
SET bank_account_id = ba.id
FROM bank_accounts ba
WHERE ba.bank_id = sp.bank_id AND sp.bank_id IS NOT NULL AND sp.bank_account_id IS NULL;

-- banks.account_number is superseded by bank_accounts — the bank entity is now just name/code.
ALTER TABLE banks DROP COLUMN IF EXISTS account_number;
