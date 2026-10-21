-- production_daily_logs.actual_plates/calculated_pieces must allow NULL so a daily
-- target can be set before the actual count for that day is logged.

ALTER TABLE production_daily_logs ALTER COLUMN actual_plates DROP NOT NULL;
ALTER TABLE production_daily_logs ALTER COLUMN calculated_pieces DROP NOT NULL;
