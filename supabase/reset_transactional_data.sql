

BEGIN;
-- Inventory activity (item catalog itself is kept; its history is not).
-- Trigger disabled for the bulk delete: the per-row AFTER DELETE trigger that
-- decrements inventory_items.quantity as each movement is removed would walk
-- balances negative mid-delete (order isn't guaranteed) and trip the
-- quantity >= 0 check — the explicit zero-out below is the real reset anyway.
ALTER TABLE inventory_movements DISABLE TRIGGER USER;
DELETE FROM inventory_movements;
ALTER TABLE inventory_movements ENABLE TRIGGER USER;
DELETE FROM inventory_location_stock;
DELETE FROM inventory_lots;
DELETE FROM inventory_quarantine_holds;
DELETE FROM inventory_inter_factory_transfers;
DELETE FROM inventory_catalog_change_requests;
DELETE FROM inventory_custom_field_values;
DELETE FROM purchase_requisition_lines;
DELETE FROM purchase_requisitions;
DELETE FROM stock_counts;

DELETE FROM orders;
DELETE FROM customers;

-- Production
DELETE FROM production_daily_logs;
DELETE FROM production_counts;
DELETE FROM production_batches;

DELETE FROM supplier_payments;
DELETE FROM material_purchases;
DELETE FROM suppliers;

DELETE FROM bank_accounts;
DELETE FROM banks;

DELETE FROM attendance_records;
DELETE FROM leave_requests;
DELETE FROM leave_balances;
DELETE FROM employees;

DELETE FROM production_intelligence_snapshots;
DELETE FROM capacity_snapshots;
DELETE FROM ai_briefings;
DELETE FROM ai_alerts;
DELETE FROM ai_conversations;

DELETE FROM documents;
DELETE FROM notifications;
DELETE FROM offline_submissions;
DELETE FROM audit_logs;

DELETE FROM sage_sync_logs;
DELETE FROM sage_transactions;
DELETE FROM sage_invoices;
DELETE FROM sage_budgets;
DELETE FROM sage_accounts;
DELETE FROM reconciliation_records;

-- Zero out on-hand stock for the item catalog we're keeping
UPDATE inventory_items SET quantity = 0, updated_at = NOW();

COMMIT;
