-- Credit vs pay is per-order, not customer type. Keep regular/walking on customers.

ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_customer_type_check;
UPDATE customers SET customer_type = 'regular' WHERE customer_type IN ('credit', 'regular');
UPDATE customers SET customer_type = 'walking' WHERE customer_type IN ('cash', 'walking');
ALTER TABLE customers
  ALTER COLUMN customer_type SET DEFAULT 'regular';
ALTER TABLE customers
  ADD CONSTRAINT customers_customer_type_check
  CHECK (customer_type IN ('regular', 'walking'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'paid'
  CHECK (sale_type IN ('credit', 'paid'));
