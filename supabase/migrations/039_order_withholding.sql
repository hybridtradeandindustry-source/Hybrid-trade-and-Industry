-- Withholding tax on orders: total_amount always stays the full/gross sale value. When
-- withholding is applied, the withheld portion is treated as effectively settled (like a
-- payment) for receivable/credit-due purposes, even though no cash changed hands for it.
-- The rate is snapshotted onto the order at creation so later rate changes don't rewrite history.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS withholding_applied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS withholding_rate_percent NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS withholding_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (withholding_amount >= 0);

COMMENT ON COLUMN orders.withholding_applied IS 'Whether withholding tax was applied to this order at creation.';
COMMENT ON COLUMN orders.withholding_rate_percent IS 'Withholding rate snapshotted from finance_settings at order creation time; null when not applied.';
COMMENT ON COLUMN orders.withholding_amount IS 'total_amount * withholding_rate_percent / 100, computed at creation; counts toward effective payment for credit-due purposes.';
