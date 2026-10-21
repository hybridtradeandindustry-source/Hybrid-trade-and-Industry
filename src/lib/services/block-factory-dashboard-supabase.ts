import { createClient } from "@/lib/supabase/server";
import {
  BLOCK_YIELDS,
  DEFAULT_WASTE_RATE,
  analyzeWaste,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { computeBatchTrailStats, computeProductionStats } from "@/lib/production/stats";
import { getBatchProductionSummaries, type BatchProductionSummary } from "@/lib/services/production-batch-detail";
import { computeFinanceDashboard } from "@/lib/services/finance-dashboard";
import type { BlockFactoryDashboardData, BlockInventorySnapshot } from "@/lib/services/block-factory-dashboard";
import {
  FACTORY_IDS,
  type Customer,
  type Order,
  type ProductionBatch,
  type ProductionCount,
} from "@/types";

function fgSkuForSize(size: BlockSizeCm): string {
  return `BLK-FG-${BLOCK_YIELDS[size].skuSuffix}`;
}

function buildInventorySnapshot(
  items: Array<{
    sku: string;
    name: string;
    quantity: number;
    reserved_quantity?: number;
    low_stock_threshold: number;
    unit: string;
  }>,
  cementKgPerBag: number
): BlockInventorySnapshot {
  const cement = items.find((i) => i.sku === BLOCK_FACTORY_SKUS.cement);
  const poliche = items.find((i) => i.sku === BLOCK_FACTORY_SKUS.poliche);
  const wip = items.find((i) => i.sku === BLOCK_FACTORY_SKUS.wip);
  const waste = items.find((i) => i.sku === BLOCK_FACTORY_SKUS.waste);
  const spareParts = items.filter((i) => i.sku.startsWith("BLK-SP-"));

  const finishedBySize = {} as BlockInventorySnapshot["finishedBySize"];
  for (const size of [20, 15, 10, 24] as BlockSizeCm[]) {
    const item = items.find((i) => i.sku === fgSkuForSize(size));
    finishedBySize[size] = {
      blocks: item?.quantity ?? 0,
      lowStock: item ? item.quantity <= item.low_stock_threshold : false,
    };
  }

  const cementBags = cement?.quantity ?? 0;

  return {
    cement: {
      bags: cementBags,
      kg: cementBags * cementKgPerBag,
      lowStock: cement ? cement.quantity <= cement.low_stock_threshold : false,
    },
    poliche: {
      loads: poliche?.quantity ?? 0,
      lowStock: poliche ? poliche.quantity <= poliche.low_stock_threshold : false,
    },
    finishedBySize,
    spareParts: {
      items: spareParts.length,
      totalUnits: spareParts.reduce((s, i) => s + i.quantity, 0),
      lowStockCount: spareParts.filter((i) => i.quantity <= i.low_stock_threshold).length,
    },
    wipCuring: wip?.quantity ?? 0,
    wasteBlocks: waste?.quantity ?? 0,
  };
}

export function assembleBlockFactoryDashboard(
  input: {
    items: Array<{
      sku: string;
      name: string;
      quantity: number;
      reserved_quantity?: number;
      low_stock_threshold: number;
      unit: string;
      is_active?: boolean;
    }>;
    batches: ProductionBatch[];
    batchProduction: Record<string, BatchProductionSummary>;
    counts: ProductionCount[];
    orders: Order[];
    customers: Customer[];
    payments: Array<{ customer_id: string; amount: number; payment_date: string }>;
    supplierPayments?: Array<{
      amount: number;
      payment_date: string;
      purchase_factory_id?: string | null;
    }>;
    transactions: Array<{ amount: number; transaction_type?: string | null; transaction_date: string; factory_id?: string | null }>;
    reconciliation: Array<{ status: string; variance: number }>;
    dateFrom: string;
    dateTo: string;
    cementKgPerBag: number;
  }
): BlockFactoryDashboardData {
  const { items, batches, batchProduction, counts, orders, customers, dateFrom, dateTo, cementKgPerBag } = input;

  const stats = computeProductionStats(counts, "block", { dateFrom, dateTo, batches });
  const finance = computeFinanceDashboard({
    orders,
    payments: input.payments as import("@/types").CustomerPayment[],
    supplierPayments: input.supplierPayments ?? [],
    customers,
    transactions: input.transactions as import("@/types").SageTransaction[],
    reconciliation: input.reconciliation as import("@/types").ReconciliationRecord[],
    scope: "block",
    dateFrom,
    dateTo,
    periodLabel: "period",
  });

  // Batches are binary now — "in_progress" (active) or "completed" (finished). Legacy
  // statuses like curing/drying no longer occur and must not be treated as active.
  const activeBatches = batches.filter((b) => b.status === "in_progress");

  const lowStockAlerts = items
    .filter((i) => i.is_active !== false && i.quantity - (i.reserved_quantity ?? 0) <= i.low_stock_threshold)
    .map((i) => ({
      sku: i.sku,
      name: i.name,
      quantity: i.quantity,
      threshold: i.low_stock_threshold,
    }));

  const batchRows = activeBatches.slice(0, 8).map((batch) => {
    const size = (batch.block_size_cm ?? 20) as BlockSizeCm;
    const trail = computeBatchTrailStats(counts.filter((c) => c.batch_id === batch.id));
    const planned = batch.planned_quantity ?? 0;
    const actualProduced = trail?.total ?? batch.actual_output ?? planned;
    const actualWaste = trail ? Math.max(0, trail.total - trail.output) : batch.actual_waste ?? 0;
    const produced = batchProduction[batch.id]?.produced ?? 0;
    const sold = batchProduction[batch.id]?.sold ?? 0;

    return {
      ...batch,
      blockLabel: BLOCK_YIELDS[size]?.label ?? `${size}cm`,
      produced,
      available: Math.max(0, produced - sold),
      wasteAnalysis:
        planned > 0
          ? analyzeWaste(planned, actualProduced || planned, actualWaste, batch.expected_waste_rate ?? DEFAULT_WASTE_RATE)
          : undefined,
    };
  });

  const topDebtors = finance.customers
    .filter((c) => c.balance > 0 || c.pending_order_credit > 0)
    .slice(0, 5)
    .map((c) => ({
      name: c.customer_name,
      balance: c.balance,
      pendingPickup: c.pending_order_credit,
    }));

  const openOrders = orders.filter((o) => o.status === "ordered");
  const pickedOrders = orders.filter((o) => o.status === "picked");

  return {
    inventory: buildInventorySnapshot(items, cementKgPerBag),
    production: {
      activeBatches: activeBatches.length,
      todayOutput: stats.totalOutput,
      avgYieldRate: stats.yieldRate,
      avgDamageRate: stats.curingDamageRate,
    },
    sales: {
      periodRevenue: finance.metrics.revenue,
      activeOrders: openOrders.length,
      pickedValue: pickedOrders.reduce((s, o) => s + o.total_amount, 0),
    },
    customers: {
      totalCreditBalance: customers.reduce((s, c) => s + c.balance, 0),
      topDebtors,
    },
    finance: {
      revenue: finance.metrics.revenue,
      expenses: finance.metrics.expenses,
      collections: finance.metrics.collections,
      supplierPayments: finance.metrics.supplierPayments,
      cashFlow: finance.metrics.cashFlow,
      netProfit: finance.metrics.netProfit,
      outstandingBalance: finance.metrics.outstandingBalance,
    },
    batches: batchRows,
    lowStockAlerts,
  };
}

export async function fetchBlockFactoryDashboardFromSupabase(
  orgId: string,
  dateFrom: string,
  dateTo: string
): Promise<BlockFactoryDashboardData> {
  const supabase = await createClient();

  const [
    { data: items },
    { data: batches },
    { data: counts },
    { data: orders },
    { data: customers },
    { data: payments },
    { data: supplierPaymentRows },
    { data: transactions },
    { data: reconciliation },
    batchProduction,
  ] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("sku, name, quantity, reserved_quantity, low_stock_threshold, unit, is_active")
      .eq("organization_id", orgId)
      .eq("factory_id", FACTORY_IDS.block)
      .eq("is_active", true),
    supabase
      .from("production_batches")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", FACTORY_IDS.block)
      .order("created_at", { ascending: false }),
    supabase
      .from("production_counts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", FACTORY_IDS.block),
    supabase
      .from("orders")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", FACTORY_IDS.block),
    supabase.from("customers").select("*").eq("organization_id", orgId),
    supabase.from("customer_payments").select("*").eq("organization_id", orgId),
    supabase
      .from("supplier_payments")
      .select("amount, payment_date, purchase:material_purchases(factory_id)")
      .eq("organization_id", orgId),
    supabase
      .from("sage_transactions")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", FACTORY_IDS.block),
    supabase.from("reconciliation_records").select("*").eq("organization_id", orgId).eq("factory_id", FACTORY_IDS.block),
    getBatchProductionSummaries(orgId, FACTORY_IDS.block),
  ]);

  const { getProductionSettings } = await import("@/lib/services/production-settings");
  const productionSettings = await getProductionSettings(orgId);

  return assembleBlockFactoryDashboard({
    items: (items ?? []).map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      low_stock_threshold: Number(i.low_stock_threshold),
      reserved_quantity: Number(i.reserved_quantity ?? 0),
    })),
    batches: (batches ?? []) as ProductionBatch[],
    batchProduction,
    counts: (counts ?? []) as ProductionCount[],
    orders: ((orders ?? []) as Order[]).map((o) => ({ ...o, total_amount: Number(o.total_amount) })),
    customers: (customers ?? []) as Customer[],
    payments: (payments ?? []).map((p) => ({ ...p, amount: Number(p.amount) })),
    supplierPayments: (supplierPaymentRows ?? []).map((row) => ({
      amount: Number(row.amount),
      payment_date: row.payment_date as string,
      purchase_factory_id:
        (row.purchase as { factory_id?: string | null } | null)?.factory_id ?? null,
    })),
    transactions: (transactions ?? []).map((t) => ({ ...t, amount: Number(t.amount) })),
    reconciliation: (reconciliation ?? []).map((r) => ({ ...r, variance: Number(r.variance) })),
    dateFrom,
    dateTo,
    cementKgPerBag: productionSettings.cement_kg_per_bag,
  });
}
