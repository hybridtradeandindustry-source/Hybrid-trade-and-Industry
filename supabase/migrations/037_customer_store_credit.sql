-- Store-credit wallet: a separate pool of money a customer has already paid but not yet used,
-- distinct from customers.balance (which is a receivable — money the customer owes us).
-- Created when a paid, not-yet-picked-up order is cancelled and the payment is kept as credit
-- instead of refunded, and spendable against a future order's amount_paid.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit_balance DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (store_credit_balance >= 0);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_credit_applied DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (store_credit_applied >= 0);

ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'payment'
  CHECK (kind IN ('payment', 'refund', 'store_credit_issue', 'store_credit_apply'));

COMMENT ON COLUMN customers.store_credit_balance IS 'Wallet balance from cancelled paid orders kept as credit instead of refunded; spendable toward a future order via orders.store_credit_applied.';
COMMENT ON COLUMN orders.store_credit_applied IS 'Amount of this order''s payment sourced from the customer''s store-credit wallet rather than fresh cash/bank payment.';
COMMENT ON COLUMN customer_payments.kind IS 'payment = normal payment; refund = cash returned to customer; store_credit_issue = payment converted to wallet credit; store_credit_apply = wallet credit spent on an order.';
