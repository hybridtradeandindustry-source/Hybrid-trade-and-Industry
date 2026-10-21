-- Prepaid advance orders: customer pays for more than the batch has produced yet and
-- picks up incrementally as production continues.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS prepaid_advance BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS quantity_fulfilled NUMERIC NOT NULL DEFAULT 0
  CHECK (quantity_fulfilled >= 0);

COMMENT ON COLUMN orders.prepaid_advance IS
  'Customer paid upfront for quantity beyond current batch production; fulfilled via partial pickups.';

COMMENT ON COLUMN order_items.quantity_fulfilled IS
  'Pieces already picked up / deducted from stock for this line. Remaining = quantity - quantity_fulfilled.';
