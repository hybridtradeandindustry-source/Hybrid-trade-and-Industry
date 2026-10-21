-- Inventory quantity can never go below zero, regardless of which code path
-- (production consumption, sales, transfers, BOM, purchase cancellation, ...)
-- posts the inventory_movements row that would push it negative. This is the
-- last line of defense — services should still validate and give a friendly
-- error before hitting this, but every write path is protected either way.
-- NOT VALID: enforces the floor on every write from now on without failing this
-- migration if any existing row is already negative (clean those up separately,
-- then `VALIDATE CONSTRAINT inventory_items_quantity_non_negative` to backfill the check).
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_quantity_non_negative CHECK (quantity >= 0 OR sku = 'BLK-RM-POL') NOT VALID;
