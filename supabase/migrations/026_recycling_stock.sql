-- Plastic Recycling — Module 4: additive, recycling-only order stage column.
-- Block-factory order flow never reads or writes this column; it stays NULL
-- for every block-factory order. Only recycling-scoped order code paths set it.
--
-- Module 1 (Stock Management) deliberately has no schema here: the real
-- business flow (Supplier -> Raw Material Inventory -> Production -> Finished
-- Inventory -> Sales) is already implemented end-to-end via production_counts
-- (material_received/processed_output/waste_rejected) -> inventory_movements
-- -> inventory_items.quantity (via existing DB triggers) -> order fulfillment.
-- A separate stock ledger would duplicate and drift from that real data, so
-- Module 1 reads directly from inventory_items + production_counts instead.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS recycling_stage text
  CHECK (recycling_stage IS NULL OR recycling_stage IN (
    'pending', 'accepted', 'in_production', 'ready', 'delivered', 'cancelled'
  ));
