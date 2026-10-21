import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  computeBlockProductionIntelligenceFromDailyLogs,
  computeProductionIntelligence,
} from "@/lib/ai/production-intelligence";
import type { ProductionBatch, ProductionCount, ProductionDailyLog } from "@/types";
import type { ProductionIntelligence } from "@/types/production-intelligence";
import { FACTORY_IDS } from "@/types";

export async function fetchCompletedBatchesWithCounts(
  orgId: string,
  factoryId: string,
  limit = 200
): Promise<{ batches: ProductionBatch[]; counts: ProductionCount[] }> {
  const supabase = await createClient();

  const { data: batches, error } = await supabase
    .from("production_batches")
    .select("*")
    .eq("organization_id", orgId)
    .eq("factory_id", factoryId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const batchIds = (batches ?? []).map((b) => b.id);
  let counts: ProductionCount[] = [];
  if (batchIds.length > 0) {
    const { data: countRows, error: countError } = await supabase
      .from("production_counts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .in("batch_id", batchIds);
    if (countError) throw new Error(countError.message);
    counts = (countRows ?? []) as ProductionCount[];
  }

  return { batches: (batches ?? []) as ProductionBatch[], counts };
}

/**
 * Block Factory's real production trail — every batch (in progress or finished) plus all
 * of its daily logs. Unlike fetchCompletedBatchesWithCounts, this isn't filtered to
 * "completed" batches: a batch's daily logs are real data the moment they're entered.
 */
export async function fetchBlockBatchesWithDailyLogs(
  orgId: string,
  factoryId: string,
  limit = 200
): Promise<{ batches: ProductionBatch[]; dailyLogs: ProductionDailyLog[] }> {
  const supabase = await createClient();

  const { data: batches, error } = await supabase
    .from("production_batches")
    .select("*")
    .eq("organization_id", orgId)
    .eq("factory_id", factoryId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const batchIds = (batches ?? []).map((b) => b.id);
  let dailyLogs: ProductionDailyLog[] = [];
  if (batchIds.length > 0) {
    const { data: logRows, error: logError } = await supabase
      .from("production_daily_logs")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .in("batch_id", batchIds);
    if (logError) throw new Error(logError.message);
    dailyLogs = (logRows ?? []) as ProductionDailyLog[];
  }

  return { batches: (batches ?? []) as ProductionBatch[], dailyLogs };
}

export async function getProductionIntelligence(
  orgId: string,
  factoryId: string = FACTORY_IDS.block,
  options?: { live?: boolean }
): Promise<ProductionIntelligence> {
  if (!options?.live) {
    const supabase = await createClient();
    const { data: snapshot } = await supabase
      .from("production_intelligence_snapshots")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .maybeSingle();

    if (snapshot?.metrics) {
      return {
        organization_id: orgId,
        factory_id: factoryId,
        computed_at: snapshot.computed_at,
        sample_batches: snapshot.sample_batches ?? 0,
        metrics: snapshot.metrics as ProductionIntelligence["metrics"],
        from_snapshot: true,
      };
    }
  }

  return refreshProductionIntelligence(orgId, factoryId);
}

export async function refreshProductionIntelligence(
  orgId: string,
  factoryId: string = FACTORY_IDS.block
): Promise<ProductionIntelligence> {
  // Block Factory's real trail is daily logs now (no drying/curing checkpoints exist
  // anymore) — everything else (Recycling) still reports through production_counts.
  const intelligence =
    factoryId === FACTORY_IDS.block
      ? computeBlockProductionIntelligenceFromDailyLogs({
          organizationId: orgId,
          factoryId,
          ...(await fetchBlockBatchesWithDailyLogs(orgId, factoryId)),
        })
      : computeProductionIntelligence({
          organizationId: orgId,
          factoryId,
          ...(await fetchCompletedBatchesWithCounts(orgId, factoryId)),
        });

  const service = await createServiceClient();
  const { error } = await service.from("production_intelligence_snapshots").upsert(
    {
      organization_id: orgId,
      factory_id: factoryId,
      computed_at: intelligence.computed_at,
      sample_batches: intelligence.sample_batches,
      metrics: intelligence.metrics,
    },
    { onConflict: "organization_id,factory_id" }
  );

  if (error) {
    // Snapshot write may fail if migration not applied — still return live compute
    console.warn("[ai] failed to upsert production intelligence snapshot:", error.message);
  }

  return { ...intelligence, from_snapshot: false };
}
