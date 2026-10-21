-- Bank account number, so staff can confirm which specific account a payment landed in.

ALTER TABLE banks ADD COLUMN IF NOT EXISTS account_number TEXT;

COMMENT ON COLUMN banks.account_number IS 'The bank account number this record refers to, as it appears on statements.';
