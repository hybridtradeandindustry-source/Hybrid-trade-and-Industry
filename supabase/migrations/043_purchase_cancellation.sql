-- Cancelling a purchase needs a place to note why (mirrors delivery_notes' free-text style).
ALTER TABLE material_purchases
  ADD COLUMN IF NOT EXISTS cancellation_reason text;
