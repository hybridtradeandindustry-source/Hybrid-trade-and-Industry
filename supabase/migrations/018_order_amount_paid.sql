-- Partial pay at order: amount_paid now, remainder becomes credit when picked

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(15, 2) NOT NULL DEFAULT 0
  CHECK (amount_paid >= 0);

UPDATE orders
SET amount_paid = CASE
  WHEN sale_type = 'paid' THEN total_amount
  ELSE 0
END
WHERE sale_type IS NOT NULL;

ALTER TABLE orders DROP COLUMN IF EXISTS sale_type;
