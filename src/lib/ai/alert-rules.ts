import type { AiRole } from "@/types";
import type { ProductionBatch, ProductionCount, Order, Customer } from "@/types";
import type {
  CapacityResult,
  ProductionIntelligence,
  CreditScoreResult,
} from "@/types/production-intelligence";
import { parseBlockSizeCm } from "@/lib/block-factory/yields";
import { computeBatchTrailStats } from "@/lib/production/stats";
import type { RecyclingIntelligenceSummary } from "@/lib/services/recycling-intelligence";
import type { CreditDashboardData } from "@/lib/services/credit-dashboard";

export type AlertSeverity = "info" | "warning" | "critical" | "high" | "medium" | "low";

export type AlertRuleResult = {
  shouldFire: boolean;
  rule_id: string;
  alert_type: string;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  severity: AlertSeverity;
  role: AiRole;
};

export function evaluateAlertRules(input: {
  intelligence: ProductionIntelligence;
  capacity: CapacityResult;
  batches: ProductionBatch[];
  counts: ProductionCount[];
  orders: Order[];
  customers: Array<Customer & { credit_score?: number | null; credit_risk_tier?: string | null; credit_limit?: number | null; credit_score_factors?: unknown }>;
  creditScores?: CreditScoreResult[];
  cementBags: number;
  policheLoads: number;
}): AlertRuleResult[] {
  const results: AlertRuleResult[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // waste_spike — last completed batch waste > avg + 2σ
  for (const [sizeKey, intel] of Object.entries(input.intelligence.metrics.by_block_size)) {
    if (!intel || intel.completed_batches < 3) continue;
    const threshold = intel.avg_waste_rate + 2 * intel.waste_rate_std_dev;
    if (intel.last_batch_waste_rate > threshold && intel.waste_rate_std_dev > 0) {
      results.push({
        shouldFire: true,
        rule_id: "waste_spike",
        alert_type: "production_anomaly",
        title: `Waste spike on ${sizeKey}cm blocks`,
        message: `Last batch waste ${(intel.last_batch_waste_rate * 100).toFixed(1)}% exceeds threshold ${(threshold * 100).toFixed(1)}% (avg ${(intel.avg_waste_rate * 100).toFixed(1)}% ± 2σ).`,
        severity: "warning",
        role: "production",
        entity_type: "production_batches",
      });
    }
  }

  // yield_drop
  for (const [sizeKey, intel] of Object.entries(input.intelligence.metrics.by_block_size)) {
    if (!intel || intel.completed_batches < 3) continue;
    if (intel.avg_yield_rate < 0.9) {
      results.push({
        shouldFire: true,
        rule_id: "yield_drop",
        alert_type: "production_anomaly",
        title: `Yield below 90% for ${sizeKey}cm`,
        message: `Average trail yield is ${(intel.avg_yield_rate * 100).toFixed(1)}% across ${intel.completed_batches} batches.`,
        severity: "warning",
        role: "production",
      });
    }
  }

  // batch_overdue
  for (const batch of input.batches) {
    if (batch.status === "completed" || batch.status === "cancelled") continue;
    if (!batch.expected_completion_date) continue;
    const expected = new Date(batch.expected_completion_date);
    expected.setHours(0, 0, 0, 0);
    const overdueDays = Math.floor((today.getTime() - expected.getTime()) / (1000 * 60 * 60 * 24));
    if (overdueDays >= 2) {
      results.push({
        shouldFire: true,
        rule_id: "batch_overdue",
        alert_type: "production_anomaly",
        title: `Batch ${batch.batch_number} overdue`,
        message: `Expected completion was ${batch.expected_completion_date.slice(0, 10)} (${overdueDays} days overdue). Status: ${batch.status}.`,
        entity_type: "production_batches",
        entity_id: batch.id,
        severity: "critical",
        role: "production",
      });
    }
  }

  // capacity_shortfall — open order qty vs capacity for size
  const openOrders = input.orders.filter((o) => o.status === "ordered");
  for (const pred of input.capacity.predictions) {
    // Without line items per size in this context, flag when capacity is zero and there are open orders
    if (pred.max_blocks <= 0 && openOrders.length > 0 && pred.block_size_cm === 20) {
      results.push({
        shouldFire: true,
        rule_id: "capacity_shortfall",
        alert_type: "capacity_warning",
        title: "No production capacity for open orders",
        message: `Open orders: ${openOrders.length}. Current ${pred.label} capacity is 0 blocks (limiting: ${pred.limiting_factor}).`,
        severity: "warning",
        role: "production",
      });
    }
  }

  // credit_limit_breach / credit_score_drop
  for (const customer of input.customers) {
    const limit = Number(customer.credit_limit ?? 0);
    const balance = Number(customer.balance ?? 0);
    if (limit > 0 && balance > limit) {
      results.push({
        shouldFire: true,
        rule_id: "credit_limit_breach",
        alert_type: "credit_risk",
        title: `Credit limit breached: ${customer.name}`,
        message: `Balance ${balance.toFixed(0)} Birr exceeds limit ${limit.toFixed(0)} Birr (score ${customer.credit_score ?? "n/a"}, tier ${customer.credit_risk_tier ?? "n/a"}).`,
        entity_type: "customers",
        entity_id: customer.id,
        severity: "critical",
        role: "finance",
      });
    }
  }

  for (const score of input.creditScores ?? []) {
    const prev = (score.credit_score_factors as { previous_score?: number }).previous_score;
    if (typeof prev === "number" && prev - score.credit_score >= 15) {
      results.push({
        shouldFire: true,
        rule_id: "credit_score_drop",
        alert_type: "credit_risk",
        title: "Customer credit score dropped",
        message: `Score fell from ${prev} to ${score.credit_score} (tier ${score.credit_risk_tier}).`,
        entity_type: "customers",
        entity_id: score.customer_id,
        severity: "warning",
        role: "finance",
      });
    }
  }

  // low_stock_production
  const nextBatchNeedBags = 800; // rough default for 50k @ 20cm
  const nextBatchNeedLoads = 45;
  if (input.cementBags < nextBatchNeedBags || input.policheLoads < nextBatchNeedLoads) {
    results.push({
      shouldFire: true,
      rule_id: "low_stock_production",
      alert_type: "inventory_critical",
      title: "Raw materials too low for next batch",
      message: `Cement ${input.cementBags} bags / Poliche ${input.policheLoads} loads. Need ~${nextBatchNeedBags} bags and ~${nextBatchNeedLoads} loads for a standard 50k 20cm batch.`,
      severity: "critical",
      role: "warehouse",
    });
  }

  // Active batch yield check vs history
  for (const batch of input.batches.filter((b) => b.status !== "completed")) {
    const size = parseBlockSizeCm(batch.block_size_cm);
    if (!size) continue;
    const intel = input.intelligence.metrics.by_block_size[String(size)];
    if (!intel || intel.completed_batches < 3) continue;
    const trail = computeBatchTrailStats(input.counts.filter((c) => c.batch_id === batch.id));
    if (trail.total > 0 && trail.yield < intel.avg_yield_rate * 0.9) {
      results.push({
        shouldFire: true,
        rule_id: "yield_drop",
        alert_type: "production_anomaly",
        title: `Yield drop on batch ${batch.batch_number}`,
        message: `Current trail yield ${(trail.yield * 100).toFixed(1)}% is below 90% of historical ${(intel.avg_yield_rate * 100).toFixed(1)}%.`,
        entity_type: "production_batches",
        entity_id: batch.id,
        severity: "warning",
        role: "production",
      });
    }
  }

  return results.filter((r) => r.shouldFire);
}

// RecyclingIntelligenceSummary rates are already on a 0-100 scale (from
// calculateDamageRate/calculateYieldRate in lib/utils.ts), not a 0-1
// fraction — do not multiply by 100 again when using these values.
const RECYCLING_HIGH_WASTE_RATE = 15; // 15%
const RECYCLING_ORDER_STUCK_DAYS = 5;

/**
 * Plastic Recycling has no batches/checkpoints/BOM-based capacity, so its
 * alert rules are shaped around what actually exists for this business:
 * raw material / finished pellet stock, live waste rate, recycling-scoped
 * credit overdue, and orders stuck in the workflow.
 */
export function evaluateRecyclingAlertRules(input: {
  summary: RecyclingIntelligenceSummary;
  credit: CreditDashboardData;
  orders: Order[];
}): AlertRuleResult[] {
  const results: AlertRuleResult[] = [];

  if (input.summary.has_low_raw_material) {
    const items = input.summary.raw_material_stock.filter((r) => r.low_stock);
    results.push({
      shouldFire: true,
      rule_id: "recycling_low_raw_material",
      alert_type: "inventory_critical",
      title: "Raw plastic stock running low",
      message: items
        .map((i) => `${i.name}: ${i.quantity_kg.toFixed(0)} ${i.unit}`)
        .join(", "),
      severity: "critical",
      role: "warehouse",
    });
  }

  if (input.summary.has_low_finished_stock) {
    const items = input.summary.finished_goods_stock.filter((r) => r.low_stock);
    results.push({
      shouldFire: true,
      rule_id: "recycling_low_finished_stock",
      alert_type: "inventory_critical",
      title: "Recycled pellet stock running low",
      message: items
        .map((i) => `${i.name}: ${i.quantity_kg.toFixed(0)} ${i.unit}`)
        .join(", "),
      severity: "warning",
      role: "warehouse",
    });
  }

  if (input.summary.week_waste_rate > RECYCLING_HIGH_WASTE_RATE) {
    results.push({
      shouldFire: true,
      rule_id: "recycling_high_waste_rate",
      alert_type: "production_anomaly",
      title: "Recycling waste rate above 15%",
      message: `This week's waste rate is ${input.summary.week_waste_rate.toFixed(1)}% (output ${input.summary.week_output_kg.toFixed(0)} kg).`,
      severity: "warning",
      role: "production",
    });
  }

  if (input.credit.overdueCount > 0) {
    const top = input.credit.invoices
      .filter((i) => i.is_overdue)
      .slice(0, 3)
      .map((i) => `${i.customer_name} (${i.order_number}): ${i.remaining_balance.toFixed(0)} Birr`)
      .join(", ");
    results.push({
      shouldFire: true,
      rule_id: "recycling_credit_overdue",
      alert_type: "credit_risk",
      title: `${input.credit.overdueCount} overdue recycling invoice(s)`,
      message: `Total overdue ${input.credit.overdueAmount.toFixed(0)} Birr. ${top}`,
      severity: "critical",
      role: "finance",
    });
  }

  const today = new Date();
  const stuckOrders = input.orders.filter((o) => {
    if (!o.recycling_stage || o.recycling_stage === "delivered" || o.recycling_stage === "cancelled") {
      return false;
    }
    const created = new Date(o.created_at);
    const ageDays = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return ageDays >= RECYCLING_ORDER_STUCK_DAYS;
  });
  for (const order of stuckOrders.slice(0, 5)) {
    results.push({
      shouldFire: true,
      rule_id: "recycling_order_stuck",
      alert_type: "capacity_warning",
      title: `Order ${order.order_number} stuck at "${order.recycling_stage}"`,
      message: `Created ${order.created_at.slice(0, 10)}, still "${order.recycling_stage}" after ${RECYCLING_ORDER_STUCK_DAYS}+ days.`,
      entity_type: "orders",
      entity_id: order.id,
      severity: "warning",
      role: "sales",
    });
  }

  return results.filter((r) => r.shouldFire);
}
