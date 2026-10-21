-- Simplified order lifecycle + credit/cash customers + payment tracking

-- Rename customer types: regular -> credit, walking -> cash
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_type_check;
UPDATE customers SET customer_type = 'credit' WHERE customer_type = 'regular';
UPDATE customers SET customer_type = 'cash' WHERE customer_type = 'walking';
ALTER TABLE customers
  ALTER COLUMN customer_type SET DEFAULT 'credit';
ALTER TABLE customers
  ADD CONSTRAINT customers_customer_type_check
  CHECK (customer_type IN ('credit', 'cash'));

-- Simplify order_status enum to ordered / picked / cancelled
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN status TYPE TEXT USING status::TEXT;

DROP TYPE IF EXISTS order_status;
CREATE TYPE order_status AS ENUM ('ordered', 'picked', 'cancelled');

UPDATE orders SET status = CASE
  WHEN status IN ('pending', 'confirmed', 'in_production', 'ready') THEN 'ordered'
  WHEN status IN ('delivered', 'invoiced') THEN 'picked'
  WHEN status = 'cancelled' THEN 'cancelled'
  ELSE 'ordered'
END;

ALTER TABLE orders
  ALTER COLUMN status TYPE order_status USING status::order_status,
  ALTER COLUMN status SET DEFAULT 'ordered';

-- Customer payment ledger (partial payments against credit balance)
CREATE TABLE customer_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bank')),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX idx_customer_payments_org ON customer_payments(organization_id);

ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_payments_org_read ON customer_payments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY customer_payments_org_write ON customer_payments
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );
