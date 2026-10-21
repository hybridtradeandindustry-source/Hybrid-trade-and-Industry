-- Let an order line be tied to a specific production batch (block factory), so a customer's
-- order can be picked against a named batch's remaining stock instead of only pooled SKU stock.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES production_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_batch ON order_items(batch_id);

COMMENT ON COLUMN order_items.batch_id IS 'Optional — the specific production batch this line was ordered against (block factory finished goods only). NULL for recycling lines or pooled-stock orders.';
