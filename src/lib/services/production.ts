import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { generateBatchNumber } from "@/lib/utils";
import { isRecyclingFactory } from "@/lib/production/filters";
import { computeProductionStats } from "@/lib/production/stats";
import {
  FACTORY_IDS,
  type BlockCheckpoint,
  type ProductionBatch,
  type ProductionCount,
  type ViewScope,
} from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function normalizeCountInput(
  input: {
    factory_id: string;
    checkpoint?: BlockCheckpoint;
    good_count?: number;
    damaged_count?: number;
    material_received?: number;
    processed_output?: number;
    waste_rejected?: number;
    photo_url?: string;
    batch_id?: string;
    production_date?: string;
  },
  isUpdate = false
) {
  if (isRecyclingFactory(input.factory_id)) {
    if (!isUpdate) {
      if (
        input.material_received == null ||
        input.processed_output == null ||
        input.waste_rejected == null
      ) {
        throw new Error(
          "Material received, processed output, and waste rejected are required for recycling"
        );
      }
    }
    return {
      factory_id: input.factory_id,
      material_received: input.material_received ?? null,
      processed_output: input.processed_output ?? null,
      waste_rejected: input.waste_rejected ?? null,
      checkpoint: null,
      good_count: null,
      damaged_count: null,
      batch_id: null,
      photo_url: input.photo_url ?? null,
      production_date: input.production_date,
    };
  }

  if (
    !isUpdate &&
    (input.good_count == null || input.damaged_count == null || !input.checkpoint)
  ) {
    throw new Error("Checkpoint, good count, and damaged count are required for block factory");
  }

  return {
    factory_id: input.factory_id,
    batch_id: input.batch_id || null,
    checkpoint: input.checkpoint ?? null,
    good_count: input.good_count ?? null,
    damaged_count: input.damaged_count ?? null,
    material_received: null,
    processed_output: null,
    waste_rejected: null,
    photo_url: input.photo_url ?? null,
    production_date: input.production_date,
  };
}

export async function fetchProductionData(scope: ViewScope, orgId: string) {
  const supabase = await createClient();
  const scopedFactoryId = scopeFactoryId(scope);

  let countsQuery = supabase
    .from("production_counts")
    .select("*")
    .eq("organization_id", orgId)
    .order("production_date", { ascending: false })
    .order("created_at", { ascending: false });

  let batchesQuery = supabase
    .from("production_batches")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (scopedFactoryId) {
    countsQuery = countsQuery.eq("factory_id", scopedFactoryId);
    batchesQuery = batchesQuery.eq("factory_id", scopedFactoryId);
  } else {
    batchesQuery = batchesQuery.eq("factory_id", FACTORY_IDS.block);
  }

  const [{ data: counts }, { data: batches }] = await Promise.all([countsQuery, batchesQuery]);

  const countList = (counts ?? []) as ProductionCount[];
  const batchList = (batches ?? []) as ProductionBatch[];

  let monthlyLogSummary = null;
  let dailyLogs: { log_date: string; calculated_pieces: number | null }[] = [];
  if (scope === "block" || scope === "combined") {
    const { getDailyLogSummary } = await import("@/lib/services/production-daily-log");
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const today = now.toISOString().slice(0, 10);
    monthlyLogSummary = await getDailyLogSummary(orgId, FACTORY_IDS.block, monthStart, today);

    const { data: logRows } = await supabase
      .from("production_daily_logs")
      .select("log_date, calculated_pieces")
      .eq("organization_id", orgId)
      .eq("factory_id", FACTORY_IDS.block);
    dailyLogs = (logRows ?? []) as { log_date: string; calculated_pieces: number | null }[];
  }

  let batchProduction: Record<string, { produced: number; sold: number }> = {};
  if (scope === "block" || scope === "combined") {
    const { getBatchProductionSummaries } = await import(
      "@/lib/services/production-batch-detail"
    );
    batchProduction = await getBatchProductionSummaries(orgId, FACTORY_IDS.block);
  }

  return {
    counts: countList,
    batches: batchList,
    stats: computeProductionStats(countList, scope, { batches: batchList }),
    monthlyLogSummary,
    dailyLogs,
    batchProduction,
  };
}

export async function insertProductionCount(
  input: {
    factory_id: string;
    checkpoint?: BlockCheckpoint;
    good_count?: number;
    damaged_count?: number;
    material_received?: number;
    processed_output?: number;
    waste_rejected?: number;
    photo_url?: string;
    batch_id?: string;
  },
  user: ApiUser
): Promise<{
  count: ProductionCount;
  orderAdvanced: { orderId: string; orderNumber: string } | null;
}> {
  const supabase = await createClient();
  const payload = normalizeCountInput(input);

  const { data, error } = await supabase
    .from("production_counts")
    .insert({
      ...payload,
      organization_id: user.organization_id,
      entered_by: user.id,
      production_date: payload.production_date ?? new Date().toISOString().slice(0, 10),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const count = data as ProductionCount;

  const { syncProductionCountInventory } = await import(
    "@/lib/services/production-inventory-sync"
  );
  await syncProductionCountInventory(count, user.id);

  const { maybeAdvanceLinkedOrderToReady } = await import(
    "@/lib/services/order-inventory-sync"
  );
  const orderAdvanced = await maybeAdvanceLinkedOrderToReady(count, user.id);

  return { count, orderAdvanced };
}

export async function updateProductionCountRecord(
  id: string,
  input: {
    factory_id: string;
    checkpoint?: BlockCheckpoint;
    good_count?: number;
    damaged_count?: number;
    material_received?: number;
    processed_output?: number;
    waste_rejected?: number;
    photo_url?: string;
    batch_id?: string;
    production_date?: string;
  },
  user: ApiUser
): Promise<{
  count: ProductionCount;
  orderAdvanced: { orderId: string; orderNumber: string } | null;
}> {
  const supabase = await createClient();
  const payload = normalizeCountInput(input, true);

  const { data, error } = await supabase
    .from("production_counts")
    .update(payload)
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const count = data as ProductionCount;

  const { syncProductionCountInventory } = await import(
    "@/lib/services/production-inventory-sync"
  );
  await syncProductionCountInventory(count, user.id);

  const { maybeAdvanceLinkedOrderToReady } = await import(
    "@/lib/services/order-inventory-sync"
  );
  const orderAdvanced = await maybeAdvanceLinkedOrderToReady(count, user.id);

  return { count, orderAdvanced };
}

export async function deleteProductionCountRecord(id: string, user: ApiUser): Promise<boolean> {
  const supabase = await createClient();

  const { clearProductionCountInventory } = await import(
    "@/lib/services/production-inventory-sync"
  );
  await clearProductionCountInventory(id);

  const { error } = await supabase
    .from("production_counts")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
  return true;
}

export async function createProductionBatch(
  factoryId: string,
  user: ApiUser,
  input?: {
    block_size_cm?: number;
    planned_quantity?: number;
    operator_id?: string;
    expected_waste_rate?: number;
    name?: string;
  }
): Promise<ProductionBatch> {
  if (isRecyclingFactory(factoryId)) {
    throw new Error("Production batches apply to Block Factory only");
  }

  const { DEFAULT_BATCH_PLANNED_QTY, DEFAULT_WASTE_RATE, PRODUCTION_CYCLE_DAYS, predictProductionOutcome } =
    await import("@/lib/block-factory/yields");

  const blockSize = input?.block_size_cm ?? 20;
  const planned = input?.planned_quantity ?? DEFAULT_BATCH_PLANNED_QTY;
  const expectedWasteRate = input?.expected_waste_rate ?? DEFAULT_WASTE_RATE;
  const { expectedWastePieces } = predictProductionOutcome(planned, expectedWasteRate);
  const productionDate = new Date().toISOString().slice(0, 10);
  const expectedCompletion = new Date(`${productionDate}T12:00:00`);
  expectedCompletion.setDate(expectedCompletion.getDate() + PRODUCTION_CYCLE_DAYS);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_batches")
    .insert({
      organization_id: user.organization_id,
      factory_id: factoryId,
      batch_number: generateBatchNumber(),
      name: input?.name?.trim() || null,
      status: "in_progress",
      created_by: user.id,
      block_size_cm: blockSize,
      planned_quantity: planned,
      expected_waste_rate: expectedWasteRate,
      expected_waste_pieces: expectedWastePieces,
      operator_id: input?.operator_id ?? user.id,
      production_date: productionDate,
      expected_completion_date: expectedCompletion.toISOString().slice(0, 10),
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const batch = data as ProductionBatch;

  return batch;
}

export async function updateProductionBatchStatus(
  id: string,
  status: string,
  user: ApiUser
): Promise<ProductionBatch> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("production_batches")
    .update({ status })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const batch = data as ProductionBatch;

  if (status === "completed") {
    // Finish Batch is now just a lock on further daily logging — finished-goods stock is
    // already kept in sync per daily log, so no inventory movement happens here.

    // Refresh production intelligence + capacity after batch completion (fire-and-forget)
    void import("@/lib/services/production-intelligence")
      .then((m) => m.refreshProductionIntelligence(user.organization_id, batch.factory_id))
      .catch((err) => console.warn("[ai] post-complete intelligence refresh failed:", err));
    void import("@/lib/services/capacity")
      .then((m) =>
        m.getCurrentCapacity(user.organization_id, batch.factory_id, {
          live: true,
          persist: true,
        })
      )
      .catch((err) => console.warn("[ai] post-complete capacity refresh failed:", err));
  }

  return batch;
}

export async function deleteProductionBatchRecord(id: string, user: ApiUser): Promise<boolean> {
  const { clearBatchMaterialConsumption } = await import("@/lib/services/batch-inventory-sync");
  await clearBatchMaterialConsumption(id);

  const supabase = await createClient();
  const { error } = await supabase
    .from("production_batches")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
  return true;
}
