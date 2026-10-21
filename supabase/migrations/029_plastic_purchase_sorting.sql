-- Plastic Module: two-stage weight capture for recycling raw-material purchases.
--
-- Stage 1 (receive): gross weight as delivered by the supplier, captured in
-- initial_received_weight. Inventory is NOT updated yet — contaminated/
-- unrecyclable plastic hasn't been removed, so it isn't usable raw material.
-- Stage 2 (finalize sorting): net_recyclable_weight is captured after sorting;
-- THIS is what increments inventory_items.quantity. waste_quantity is derived
-- and stored so purchase details, inventory, and reports can read it directly.
--
-- Additive only: block-factory purchases and non-raw-material recycling
-- purchases (spare parts, other) keep sorting_status = 'not_applicable' and
-- never touch initial_received_weight / net_recyclable_weight / waste_quantity,
-- so the existing single-step receive flow is unchanged for them.

ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS initial_received_weight numeric,
  ADD COLUMN IF NOT EXISTS net_recyclable_weight numeric,
  ADD COLUMN IF NOT EXISTS waste_quantity numeric
    GENERATED ALWAYS AS (initial_received_weight - net_recyclable_weight) STORED,
  ADD COLUMN IF NOT EXISTS sorting_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS sorted_at timestamptz,
  ADD COLUMN IF NOT EXISTS sorted_by uuid REFERENCES auth.users(id);

ALTER TABLE material_purchases
  DROP CONSTRAINT IF EXISTS material_purchases_sorting_status_check;
ALTER TABLE material_purchases
  ADD CONSTRAINT material_purchases_sorting_status_check
  CHECK (sorting_status IN ('not_applicable', 'pending_sorting', 'sorted'));

ALTER TABLE material_purchases
  DROP CONSTRAINT IF EXISTS material_purchases_net_le_initial;
ALTER TABLE material_purchases
  ADD CONSTRAINT material_purchases_net_le_initial
  CHECK (
    net_recyclable_weight IS NULL
    OR initial_received_weight IS NULL
    OR net_recyclable_weight <= initial_received_weight
  );

ALTER TABLE material_purchases
  DROP CONSTRAINT IF EXISTS material_purchases_net_nonnegative;
ALTER TABLE material_purchases
  ADD CONSTRAINT material_purchases_net_nonnegative
  CHECK (net_recyclable_weight IS NULL OR net_recyclable_weight >= 0);

ALTER TABLE material_purchases
  DROP CONSTRAINT IF EXISTS material_purchases_initial_nonnegative;
ALTER TABLE material_purchases
  ADD CONSTRAINT material_purchases_initial_nonnegative
  CHECK (initial_received_weight IS NULL OR initial_received_weight >= 0);
