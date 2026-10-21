-- Cement kg-per-bag was a hardcoded constant (45kg) — make it an admin-editable org setting,
-- same as the daily plate target.

ALTER TABLE production_settings ADD COLUMN IF NOT EXISTS cement_kg_per_bag NUMERIC NOT NULL DEFAULT 45;

COMMENT ON COLUMN production_settings.cement_kg_per_bag IS 'Kg per cement bag, used to convert between kg and bags across purchasing and daily production logs.';
