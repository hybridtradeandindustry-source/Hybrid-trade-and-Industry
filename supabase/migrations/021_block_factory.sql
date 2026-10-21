-- Block factory production batch fields and cement unit support

ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS block_size_cm integer,
  ADD COLUMN IF NOT EXISTS planned_quantity numeric,
  ADD COLUMN IF NOT EXISTS cement_bags_consumed numeric,
  ADD COLUMN IF NOT EXISTS cement_kg_consumed numeric,
  ADD COLUMN IF NOT EXISTS poliche_loads_consumed numeric,
  ADD COLUMN IF NOT EXISTS expected_waste_rate numeric DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS expected_waste_pieces numeric,
  ADD COLUMN IF NOT EXISTS actual_output numeric,
  ADD COLUMN IF NOT EXISTS actual_waste numeric,
  ADD COLUMN IF NOT EXISTS operator_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS production_date date;

COMMENT ON COLUMN production_batches.block_size_cm IS 'Block size in cm: 20, 15, 10, or 24';
