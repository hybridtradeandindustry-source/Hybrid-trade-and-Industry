import type { BlockSizeCm } from "@/lib/block-factory/yields";

export type CreditRiskTier = "low" | "medium" | "high" | "blocked";

export type CapacityLimitingFactor = "cement" | "poliche" | "balanced" | "none";

export interface BlockSizeIntelligence {
  completed_batches: number;
  avg_waste_rate: number;
  avg_yield_rate: number;
  avg_cement_bags_per_1000_blocks: number;
  avg_poliche_loads_per_1000_blocks: number;
  avg_cycle_days: number;
  last_batch_waste_rate: number;
  waste_rate_std_dev: number;
  avg_drying_loss: number;
  avg_curing_loss: number;
  best_batch_waste_rate: number;
  worst_batch_waste_rate: number;
  confidence: number;
}

export interface ProductionIntelligenceGlobal {
  avg_waste_rate: number;
  total_completed_batches: number;
  avg_yield_rate: number;
}

export interface ProductionIntelligenceMetrics {
  by_block_size: Partial<Record<string, BlockSizeIntelligence>>;
  global: ProductionIntelligenceGlobal;
  supplier_flags?: Array<{
    supplier_hint: string;
    note: string;
  }>;
}

export interface ProductionIntelligence {
  organization_id: string;
  factory_id: string;
  computed_at: string;
  sample_batches: number;
  metrics: ProductionIntelligenceMetrics;
  from_snapshot: boolean;
}

export interface IntelligenceSnapshot {
  id: string;
  organization_id: string;
  factory_id: string;
  computed_at: string;
  sample_batches: number;
  metrics: ProductionIntelligenceMetrics;
}

export interface CapacityPrediction {
  block_size_cm: BlockSizeCm;
  label: string;
  max_blocks: number;
  max_pallets: number;
  expected_waste_pct: number;
  expected_waste_pieces: number;
  cement_required_bags: number;
  poliche_required_loads: number;
  remaining_cement_bags: number;
  remaining_poliche_loads: number;
  estimated_production_days: number;
  limiting_factor: CapacityLimitingFactor;
}

export interface CapacityInventorySnapshot {
  cementBags: number;
  cementKg: number;
  policheLoads: number;
}

export interface CapacityResult {
  organization_id: string;
  factory_id: string;
  computed_at: string;
  inventory: CapacityInventorySnapshot;
  predictions: CapacityPrediction[];
  limiting_factor: CapacityLimitingFactor | string | null;
  confidence: number;
  sample_batches: number;
  from_snapshot: boolean;
}

export interface CreditScoreFactors {
  balance_to_lifetime_sales_ratio: number;
  avg_days_to_pay: number;
  payment_count_90d: number;
  open_order_exposure: number;
  pct_orders_with_deposit: number;
  account_age_days: number;
  total_picked_sales: number;
  avg_monthly_sales: number;
  deductions: Record<string, number>;
  bonuses: Record<string, number>;
}

export interface CreditScoreResult {
  customer_id: string;
  credit_score: number;
  credit_risk_tier: CreditRiskTier;
  credit_limit: number;
  credit_score_updated_at: string;
  credit_score_factors: CreditScoreFactors;
}

export interface CreditRiskEvaluation {
  allowed: boolean;
  requires_override: boolean;
  score: number;
  tier: CreditRiskTier;
  credit_limit: number;
  balance: number;
  projected_exposure: number;
  reason: string;
}
