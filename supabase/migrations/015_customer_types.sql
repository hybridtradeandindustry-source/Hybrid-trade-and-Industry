-- Customer types (regular vs walking) and order payment/invoice fields

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'regular'
    CHECK (customer_type IN ('regular', 'walking')),
  ADD COLUMN IF NOT EXISTS tin TEXT;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'bank')),
  ADD COLUMN IF NOT EXISTS requires_invoice BOOLEAN NOT NULL DEFAULT FALSE;
