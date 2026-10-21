-- VAT on sales orders: admin-configurable default rate, snapshotted per order when applied.

ALTER TABLE finance_settings
  ADD COLUMN IF NOT EXISTS vat_rate_percent NUMERIC NOT NULL DEFAULT 15;

COMMENT ON COLUMN finance_settings.vat_rate_percent IS
  'Default VAT rate applied to orders when "sell with VAT" is selected (Ethiopian standard 15%).';

ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_applied BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_rate_percent NUMERIC;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS vat_amount DECIMAL(15, 2) NOT NULL DEFAULT 0
  CHECK (vat_amount >= 0);

COMMENT ON COLUMN orders.vat_applied IS 'Whether VAT was included in this order total at creation.';
COMMENT ON COLUMN orders.vat_rate_percent IS 'VAT rate snapshotted from finance_settings at order creation; null when not applied.';
COMMENT ON COLUMN orders.vat_amount IS 'VAT portion added on top of the discounted subtotal at creation.';

UPDATE finance_settings SET vat_rate_percent = 15 WHERE vat_rate_percent IS NULL;
