-- Traces which production batch(es) a sale drew finished-goods stock from, FIFO by batch.
-- Additive/parallel to inventory_movements — does not change existing stock quantities,
-- only records provenance so a batch's "amount sold" can be computed accurately.

CREATE TABLE batch_sale_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES order_items(id) ON DELETE SET NULL,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batch_sale_allocations_batch ON batch_sale_allocations(batch_id);
CREATE INDEX idx_batch_sale_allocations_order ON batch_sale_allocations(order_id);

ALTER TABLE batch_sale_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY batch_sale_allocations_org ON batch_sale_allocations FOR ALL USING (
  organization_id = get_user_organization_id()
);

COMMENT ON TABLE batch_sale_allocations IS 'FIFO allocation of order sales against the production batch(es) that produced the finished-goods stock — lets a batch detail page report accurate "amount sold" even after stock is pooled by SKU.';
