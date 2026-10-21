-- Recreate inventory quantity floor constraint to exempt Poliche (BLK-RM-POL) from being non-negative
ALTER TABLE inventory_items DROP CONSTRAINT IF EXISTS inventory_items_quantity_non_negative;
ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_quantity_non_negative CHECK (quantity >= 0 OR sku = 'BLK-RM-POL') NOT VALID;
