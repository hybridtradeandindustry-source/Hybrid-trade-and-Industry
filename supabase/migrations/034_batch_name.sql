-- Optional human-friendly name for a production batch, shown alongside its auto-generated code.

ALTER TABLE production_batches ADD COLUMN IF NOT EXISTS name TEXT;

COMMENT ON COLUMN production_batches.name IS 'Optional operator-given name shown alongside the auto-generated batch_number code.';
