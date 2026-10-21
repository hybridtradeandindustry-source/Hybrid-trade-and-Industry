import { createClient } from "@/lib/supabase/server";
import { batchMovementNetQuantity } from "@/lib/block-factory/supabase-sync";
import { getBatchSaleSummary, type BatchSaleSummary } from "@/lib/services/batch-sale-allocation";
import type { ProductionBatch, ProductionDailyLog } from "@/types";

export type BatchProductionSummary = { produced: number; sold: number };

/** Per-batch produced (sum of daily log output) and sold (FIFO sale allocations) totals — used for batch list columns. */
export async function getBatchProductionSummaries(
  orgId: string,
  factoryId: string
): Promise<Record<string, BatchProductionSummary>> {
  const supabase = await createClient();

  const [{ data: logs }, { data: allocations }] = await Promise.all([
    supabase
      .from("production_daily_logs")
      .select("batch_id, calculated_pieces")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId),
    supabase.from("batch_sale_allocations").select("batch_id, quantity").eq("organization_id", orgId),
  ]);

  const map: Record<string, BatchProductionSummary> = {};

  for (const row of logs ?? []) {
    const key = row.batch_id as string;
    if (!key) continue;
    if (!map[key]) map[key] = { produced: 0, sold: 0 };
    map[key].produced += Number(row.calculated_pieces ?? 0);
  }

  for (const row of allocations ?? []) {
    const key = row.batch_id as string;
    if (!key) continue;
    if (!map[key]) map[key] = { produced: 0, sold: 0 };
    map[key].sold += Number(row.quantity ?? 0);
  }

  return map;
}

export type BatchDetail = {
  batch: ProductionBatch;
  dailyLogs: ProductionDailyLog[];
  production: {
    totalPieces: number;
    totalPlates: number;
    wasteCost: number;
    daysLogged: number;
    daysBelowTarget: number;
  };
  finishedGoods: number;
  waste: number;
  linkedOrder: {
    id: string;
    order_number: string;
    status: string;
    total_amount: number;
    customerName: string | null;
  } | null;
  sales: BatchSaleSummary;
};

export async function getBatchDetail(batchId: string, orgId: string): Promise<BatchDetail> {
  const supabase = await createClient();

  const { data: batchRow, error } = await supabase
    .from("production_batches")
    .select("*")
    .eq("id", batchId)
    .eq("organization_id", orgId)
    .single();

  if (error || !batchRow) throw new Error("Batch not found");
  const batch = batchRow as ProductionBatch;

  const { data: logRows } = await supabase
    .from("production_daily_logs")
    .select("*")
    .eq("batch_id", batchId)
    .eq("organization_id", orgId)
    .order("log_date", { ascending: false });
  const dailyLogs = (logRows ?? []) as ProductionDailyLog[];

  const totalPieces = dailyLogs.reduce((sum, l) => sum + Number(l.calculated_pieces ?? 0), 0);
  const totalPlates = dailyLogs.reduce((sum, l) => sum + Number(l.actual_plates ?? 0), 0);
  const wasteCost = dailyLogs.reduce((sum, l) => sum + Number(l.waste_cost ?? 0), 0);
  const daysLogged = dailyLogs.filter((l) => l.calculated_pieces != null).length;
  const daysBelowTarget = dailyLogs.filter(
    (l) => l.calculated_pieces != null && Number(l.calculated_pieces) < Number(l.target_pieces)
  ).length;

  const [finishedGoods, waste] = await Promise.all([
    batchMovementNetQuantity(supabase, batchId, "finished_goods").then((n) => Math.max(0, n)),
    batchMovementNetQuantity(supabase, batchId, "production_waste").then((n) => Math.max(0, n)),
  ]);

  let linkedOrder: BatchDetail["linkedOrder"] = null;
  if (batch.order_id) {
    const { data: orderRow } = await supabase
      .from("orders")
      .select("id, order_number, status, total_amount, customers(name)")
      .eq("id", batch.order_id)
      .maybeSingle();

    if (orderRow) {
      const customer = orderRow.customers as unknown as { name: string } | null;
      linkedOrder = {
        id: orderRow.id,
        order_number: orderRow.order_number,
        status: orderRow.status,
        total_amount: Number(orderRow.total_amount ?? 0),
        customerName: customer?.name ?? null,
      };
    }
  }

  const sales = await getBatchSaleSummary(batchId, orgId);

  return {
    batch,
    dailyLogs,
    production: { totalPieces, totalPlates, wasteCost, daysLogged, daysBelowTarget },
    finishedGoods,
    waste,
    linkedOrder,
    sales,
  };
}
