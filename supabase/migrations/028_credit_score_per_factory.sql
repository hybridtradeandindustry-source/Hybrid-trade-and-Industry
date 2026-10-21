-- Split customer credit scoring into three views: Block Factory, Plastic
-- Recycling, and Overall/Combined (matching the navbar's factory switcher).
-- The existing credit_score/credit_limit/credit_risk_tier/
-- credit_score_updated_at/credit_score_factors columns (025_ai_intelligence)
-- keep their meaning as the Overall/Combined score — additive only.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_score_block int CHECK (credit_score_block IS NULL OR credit_score_block BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS credit_limit_block numeric,
  ADD COLUMN IF NOT EXISTS credit_risk_tier_block text CHECK (
    credit_risk_tier_block IS NULL OR credit_risk_tier_block IN ('low', 'medium', 'high', 'blocked')
  ),
  ADD COLUMN IF NOT EXISTS credit_score_block_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_score_recycling int CHECK (credit_score_recycling IS NULL OR credit_score_recycling BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS credit_limit_recycling numeric,
  ADD COLUMN IF NOT EXISTS credit_risk_tier_recycling text CHECK (
    credit_risk_tier_recycling IS NULL OR credit_risk_tier_recycling IN ('low', 'medium', 'high', 'blocked')
  ),
  ADD COLUMN IF NOT EXISTS credit_score_recycling_updated_at timestamptz;
