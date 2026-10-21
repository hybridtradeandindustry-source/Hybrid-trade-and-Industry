-- Orders ↔ inventory ↔ production integration

ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_batches_order ON production_batches(order_id);

-- Link seeded orders to finished goods SKUs
INSERT INTO order_items (order_id, item_id, description, quantity, unit_price)
SELECT
  o.id,
  fg.id,
  fg.name,
  CASE o.order_number
    WHEN 'ORD-1051' THEN 500
    WHEN 'ORD-1052' THEN 350
    WHEN 'ORD-1049' THEN 1200
    WHEN 'ORD-1044' THEN 200
    ELSE 100
  END,
  CASE fg.sku
    WHEN 'BLK-FG-001' THEN 4.50
    WHEN 'REC-FG-001' THEN 1.20
    ELSE 1.00
  END
FROM orders o
JOIN inventory_items fg ON fg.factory_id = o.factory_id AND fg.sku IN ('BLK-FG-001', 'REC-FG-001')
WHERE NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id);

-- Align header totals with line items
UPDATE orders o
SET total_amount = sub.line_total
FROM (
  SELECT order_id, SUM(total_price) AS line_total
  FROM order_items
  GROUP BY order_id
) sub
WHERE o.id = sub.order_id;
