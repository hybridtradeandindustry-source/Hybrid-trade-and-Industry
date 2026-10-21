-- ============================================================================
--  Remove all sales-order data, and everything downstream of it.
--
--  Run the PREVIEW section first to see exactly what will change, then run the
--  RESET section. The reset is wrapped in a transaction: if any statement fails,
--  nothing is applied.
--
--  What goes automatically (foreign keys handle these):
--    order_items             ON DELETE CASCADE
--    deliveries              ON DELETE CASCADE
--    batch_sale_allocations  ON DELETE CASCADE  -> batch "sold" counts reset,
--                                                  so batch availability returns
--                                                  to full recorded production
--    production_batches.order_id  ON DELETE SET NULL
--
--  What does NOT go automatically, and is why this script exists:
--    * inventory_movements rows for sales have no foreign key to orders, so
--      nothing removes them.
--    * Deleting a movement does NOT give the stock back. The quantity trigger
--      (trg_inventory_movement_quantity) fires AFTER INSERT only, so inventory_items
--      .quantity has to be corrected explicitly or stock stays permanently short.
--    * customer_payments.order_id is ON DELETE SET NULL, so payment rows survive
--      as orphans that still count against the customer.
--    * customers.balance and .store_credit_balance were moved by these orders and
--      have to be moved back.
--
--  Deletions on inventory_movements are captured by the audit_inventory_movements
--  trigger, so the removal itself stays on record in audit_logs.
--
--  To scope this to one organisation, replace `TRUE` in the WHERE clauses with
--  `organization_id = '<uuid>'`.
-- ============================================================================


-- ============================================================================
--  PREVIEW — read-only, safe to run on its own
-- ============================================================================

-- Orders that will be deleted
SELECT order_number, status, total_amount, amount_paid, store_credit_applied
FROM orders
WHERE TRUE
ORDER BY created_at;

-- Stock that will be returned to inventory
SELECT i.sku, i.name, i.quantity AS quantity_now,
       SUM(-m.quantity) AS returning,
       i.quantity + SUM(-m.quantity) AS quantity_after
FROM inventory_movements m
JOIN inventory_items i ON i.id = m.item_id
WHERE m.reference_type = 'orders'
GROUP BY i.id, i.sku, i.name, i.quantity
ORDER BY i.sku;

-- Customer balances that will be reversed
SELECT c.name,
       c.balance AS balance_now,
       COALESCE(SUM(GREATEST(o.total_amount - COALESCE(o.amount_paid, 0), 0)), 0) AS credit_reversed,
       c.store_credit_balance AS wallet_now,
       COALESCE(SUM(COALESCE(o.store_credit_applied, 0)), 0) AS wallet_returned
FROM customers c
JOIN orders o ON o.customer_id = c.id AND o.status = 'picked'
GROUP BY c.id, c.name, c.balance, c.store_credit_balance
ORDER BY c.name;


-- ============================================================================
--  RESET — destructive, not reversible
-- ============================================================================

BEGIN;

-- 1. Give the stock back. Must happen before the movements are deleted, and must
--    be an explicit UPDATE because the quantity trigger only fires on INSERT.
WITH sold AS (
  SELECT item_id, SUM(-quantity) AS qty
  FROM inventory_movements
  WHERE reference_type = 'orders'
    AND item_id IS NOT NULL
  GROUP BY item_id
)
UPDATE inventory_items i
SET quantity   = i.quantity + sold.qty,
    updated_at = NOW()
FROM sold
WHERE i.id = sold.item_id;

-- 2. Reverse the credit these orders put on customer accounts, and return any
--    store credit they spent. Floored at zero so a balance that was already
--    settled elsewhere can't go negative.
WITH moved AS (
  SELECT customer_id,
         SUM(GREATEST(total_amount - COALESCE(amount_paid, 0), 0)) AS credit,
         SUM(COALESCE(store_credit_applied, 0))                    AS wallet
  FROM orders
  WHERE TRUE
    AND customer_id IS NOT NULL
    AND status = 'picked'
  GROUP BY customer_id
)
UPDATE customers c
SET balance              = GREATEST(c.balance - moved.credit, 0),
    store_credit_balance = c.store_credit_balance + moved.wallet
FROM moved
WHERE c.id = moved.customer_id;

-- 3. Payments taken against these orders. The FK would null the link and leave
--    the row behind, still counted against the customer.
DELETE FROM customer_payments
WHERE order_id IN (SELECT id FROM orders WHERE TRUE);

-- 4. The sale movements. No foreign key reaches these, so they must go by hand.
DELETE FROM inventory_movements
WHERE reference_type = 'orders';

-- 5. The orders themselves. order_items, deliveries and batch_sale_allocations
--    follow via ON DELETE CASCADE.
DELETE FROM orders
WHERE TRUE;

COMMIT;


-- ============================================================================
--  VERIFY — all four counts should be 0, and stock should match the preview
-- ============================================================================

SELECT
  (SELECT COUNT(*) FROM orders)                                              AS orders_left,
  (SELECT COUNT(*) FROM order_items)                                         AS order_items_left,
  (SELECT COUNT(*) FROM batch_sale_allocations)                              AS allocations_left,
  (SELECT COUNT(*) FROM inventory_movements WHERE reference_type = 'orders') AS sale_movements_left;

SELECT sku, name, quantity FROM inventory_items WHERE is_active ORDER BY sku;

SELECT name, balance, store_credit_balance FROM customers ORDER BY name;
