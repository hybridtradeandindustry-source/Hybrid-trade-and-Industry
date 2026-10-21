-- Supplier credit / accounts payable for material purchasing

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier_type text NOT NULL DEFAULT 'credit';

ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_supplier_type_check;
ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_supplier_type_check
  CHECK (supplier_type IN ('credit', 'cash'));

COMMENT ON COLUMN suppliers.balance IS 'Amount owed to this supplier (accounts payable)';

ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'credit',
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bank_id uuid REFERENCES banks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';

ALTER TABLE material_purchases DROP CONSTRAINT IF EXISTS material_purchases_payment_method_check;
ALTER TABLE material_purchases
  ADD CONSTRAINT material_purchases_payment_method_check
  CHECK (payment_method IN ('cash', 'bank', 'credit'));

ALTER TABLE material_purchases DROP CONSTRAINT IF EXISTS material_purchases_payment_status_check;
ALTER TABLE material_purchases
  ADD CONSTRAINT material_purchases_payment_status_check
  CHECK (payment_status IN ('unpaid', 'partial', 'paid'));

CREATE TABLE IF NOT EXISTS supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  purchase_id uuid REFERENCES material_purchases(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'bank')),
  bank_id uuid REFERENCES banks(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_org ON supplier_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_material_purchases_payment ON material_purchases(payment_status);

ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_payments_org ON supplier_payments;
CREATE POLICY supplier_payments_org ON supplier_payments FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);
