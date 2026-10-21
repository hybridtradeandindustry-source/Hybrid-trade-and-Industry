import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import {
  BLOCK_YIELDS,
  calculateMaterialConsumption,
  finishedGoodsSku,
  parseBlockSizeCm,
  roundPolicheLoads,
} from "@/lib/block-factory/yields";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { findItemBySku } from "@/lib/block-factory/supabase-sync";
import { getProductionSettings } from "@/lib/services/production-settings";
import type { ProductionBatch, ProductionDailyLog } from "@/types";
import { FACTORY_IDS } from "@/types";

const DAILY_LOG_MOVEMENT_REASON = "daily_log_consumption";

export type DailyLogInput = {
  batch_id: string;
  factory_id: string;
  log_date?: string;
  target_plates?: number | null;
  actual_plates?: number | null;
  shortfall_reason?: string | null;
  cement_bags_used?: number | null;
  poliche_loads_used?: number | null;
};

async function assertSufficientStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  itemLabel: string,
  needed: number
): Promise<void> {
  if (itemLabel === "poliche") return; // Poliche is allowed to go negative
  const { data: item } = await supabase
    .from("inventory_items")
    .select("quantity")
    .eq("id", itemId)
    .maybeSingle();

  const available = Number(item?.quantity ?? 0);
  if (needed > available) {
    throw new Error(
      `Not enough ${itemLabel} in stock — ${available} available, ${needed} needed`
    );
  }
}

/**
 * Gate the log on raw material *before* the row is written. The consumption sync runs after
 * the upsert has already committed, so a shortfall discovered there leaves the day recorded
 * with nothing deducted — and skips the finished-goods posting that follows it. Checking up
 * front means a day that can't be paid for in cement and poliche is simply not logged.
 *
 * Re-saving an existing day replaces its movements rather than adding to them, so whatever
 * that day already consumes is credited back before comparing against stock.
 */
async function assertMaterialsAvailableForLog(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    cementBags: number | null;
    policheLoads: number | null;
    existingLogId: string | null;
  }
): Promise<void> {
  const needs = [
    { sku: BLOCK_FACTORY_SKUS.cement, label: "cement", needed: Number(input.cementBags ?? 0) },
    { sku: BLOCK_FACTORY_SKUS.poliche, label: "poliche", needed: Number(input.policheLoads ?? 0) },
  ].filter((n) => n.needed > 0);

  if (needs.length === 0) return;

  const creditedBack = new Map<string, number>();
  if (input.existingLogId) {
    const { data: rows } = await supabase
      .from("inventory_movements")
      .select("item_id, quantity")
      .eq("reference_type", "production_daily_logs")
      .eq("reference_id", input.existingLogId);

    for (const row of rows ?? []) {
      const itemId = row.item_id as string;
      creditedBack.set(
        itemId,
        (creditedBack.get(itemId) ?? 0) + Math.abs(Number(row.quantity ?? 0))
      );
    }
  }

  for (const need of needs) {
    if (need.label === "poliche") continue; // Poliche is allowed to go negative
    const item = await findItemBySku(supabase, FACTORY_IDS.block, need.sku);
    // A missing item used to mean the deduction was skipped in silence — production got
    // logged for free. Refuse instead, and name what has to be restored.
    if (!item) {
      throw new Error(
        `No active "${need.sku}" item in Block Factory inventory — restore it before logging ${need.label} usage`
      );
    }

    const { data: row } = await supabase
      .from("inventory_items")
      .select("quantity, unit")
      .eq("id", item.id)
      .maybeSingle();

    const available = Number(row?.quantity ?? 0) + (creditedBack.get(item.id) ?? 0);
    if (need.needed > available) {
      const unit = row?.unit ? ` ${row.unit}` : "";
      throw new Error(
        `Not enough ${need.label} in stock — ${available}${unit} available, ${need.needed}${unit} needed. Record the purchase first, then log this day.`
      );
    }
  }
}

async function resolveMaterialUnitCosts(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ cement: number; poliche: number }> {
  const { data: items } = await supabase
    .from("inventory_items")
    .select("sku, unit_cost")
    .in("sku", [BLOCK_FACTORY_SKUS.cement, BLOCK_FACTORY_SKUS.poliche]);

  const bySku = new Map((items ?? []).map((i) => [i.sku, Number(i.unit_cost ?? 0)]));
  return {
    cement: bySku.get(BLOCK_FACTORY_SKUS.cement) ?? 0,
    poliche: bySku.get(BLOCK_FACTORY_SKUS.poliche) ?? 0,
  };
}

/**
 * Raw material deduction now happens per daily log entry (actual cement/poliche used that
 * day), not at batch creation — the old planned-quantity-based deduction relied on the
 * hidden 50,000-piece default, which isn't a real reported number. Re-syncing on every
 * upsert (delete-then-reinsert keyed by the log's id) keeps edits idempotent.
 */
async function syncDailyLogMaterialConsumption(
  supabase: Awaited<ReturnType<typeof createClient>>,
  log: ProductionDailyLog,
  batchNumber: string,
  unitCosts: { cement: number; poliche: number },
  userId: string
): Promise<void> {
  await supabase
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "production_daily_logs")
    .eq("reference_id", log.id);
  await supabase.from("sage_transactions").delete().eq("reference", log.id);

  const cementBags = Number(log.cement_bags_used ?? 0);
  const policheLoads = Number(log.poliche_loads_used ?? 0);
  if (cementBags <= 0 && policheLoads <= 0) return;

  const rows: Record<string, unknown>[] = [];

  if (cementBags > 0) {
    const cementItem = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.cement);
    // upsertDailyLog already refused a missing item up front; anything else reaching here
    // must fail loudly rather than log production that consumed nothing.
    if (!cementItem) {
      throw new Error(
        `No active "${BLOCK_FACTORY_SKUS.cement}" item in Block Factory inventory — cement usage cannot be deducted`
      );
    }
    {
      await assertSufficientStock(supabase, cementItem.id, "cement", cementBags);
      rows.push({
        organization_id: log.organization_id,
        factory_id: FACTORY_IDS.block,
        item_id: cementItem.id,
        movement_type: "production_out",
        quantity: -cementBags,
        reference_type: "production_daily_logs",
        reference_id: log.id,
        notes: `Daily log ${log.log_date}: ${cementBags} cement bag(s) for batch ${batchNumber}`,
        reason: DAILY_LOG_MOVEMENT_REASON,
        source_module: "production_daily_log",
        created_by: userId,
      });
    }
  }

  if (policheLoads > 0) {
    const policheItem = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.poliche);
    if (!policheItem) {
      throw new Error(
        `No active "${BLOCK_FACTORY_SKUS.poliche}" item in Block Factory inventory — poliche usage cannot be deducted`
      );
    }
    {
      await assertSufficientStock(supabase, policheItem.id, "poliche", policheLoads);
      rows.push({
        organization_id: log.organization_id,
        factory_id: FACTORY_IDS.block,
        item_id: policheItem.id,
        movement_type: "production_out",
        quantity: -policheLoads,
        reference_type: "production_daily_logs",
        reference_id: log.id,
        notes: `Daily log ${log.log_date}: ${policheLoads} poliche load(s) for batch ${batchNumber}`,
        reason: DAILY_LOG_MOVEMENT_REASON,
        source_module: "production_daily_log",
        created_by: userId,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("inventory_movements").insert(rows);
    if (error) throw new Error(error.message);
  }

  const totalCost = cementBags * unitCosts.cement + policheLoads * unitCosts.poliche;
  if (totalCost > 0) {
    const { error } = await supabase.from("sage_transactions").insert({
      organization_id: log.organization_id,
      factory_id: FACTORY_IDS.block,
      sage_id: `COGS-DAILYLOG-${batchNumber}-${log.log_date}-${Date.now()}`,
      transaction_date: log.log_date,
      description: `Production COGS — ${batchNumber} daily log ${log.log_date} (cement + poliche)`,
      amount: -totalCost,
      transaction_type: "cogs",
      reference: log.id,
    });
    if (error) throw new Error(error.message);
  }
}

/**
 * Editing or deleting a daily log recomputes this batch's total recorded output — if that
 * total would drop below what's already been sold from this batch (FIFO-allocated via
 * batch_sale_allocations), the edit/delete is rejected rather than letting finished-goods
 * stock go negative.
 */
async function assertBatchProductionNotOversold(
  batchId: string,
  orgId: string,
  newTotalPieces: number
): Promise<void> {
  const { getBatchSaleSummary } = await import("@/lib/services/batch-sale-allocation");
  const { totalSold } = await getBatchSaleSummary(batchId, orgId);
  if (newTotalPieces < totalSold) {
    throw new Error(
      `Cannot reduce this batch's recorded output below what's already been sold — ${totalSold} pieces already sold from this batch, only ${newTotalPieces} would remain recorded`
    );
  }
}

/**
 * Finished-goods stock is posted directly from daily logs (recompute-and-replace, keyed by
 * batch) rather than at "Finish Batch" time — the old completion-time posting relied on the
 * hidden 50,000-piece default / checkpoint counts, neither of which reflect real output
 * anymore. This keeps "how much of this batch is left to sell" accurate the moment a day is
 * logged, without waiting for the batch to be finished.
 */
async function syncBatchFinishedGoodsFromDailyLogs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batch: ProductionBatch,
  userId: string | null
): Promise<void> {
  const blockSize = parseBlockSizeCm(batch.block_size_cm) ?? 20;

  const { data: logs } = await supabase
    .from("production_daily_logs")
    .select("calculated_pieces")
    .eq("batch_id", batch.id);
  const totalPieces = (logs ?? []).reduce(
    (sum, r) => sum + Number(r.calculated_pieces ?? 0),
    0
  );

  await assertBatchProductionNotOversold(batch.id, batch.organization_id, totalPieces);

  await supabase
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "production_batches")
    .eq("reference_id", batch.id)
    .eq("reason", "finished_goods");

  if (totalPieces <= 0) return;

  const fgItem = await findItemBySku(supabase, FACTORY_IDS.block, finishedGoodsSku(blockSize));
  if (!fgItem) return;

  const { error } = await supabase.from("inventory_movements").insert({
    organization_id: batch.organization_id,
    factory_id: FACTORY_IDS.block,
    item_id: fgItem.id,
    movement_type: "production_in",
    quantity: totalPieces,
    reference_type: "production_batches",
    reference_id: batch.id,
    notes: `Finished goods from daily logs — batch ${batch.batch_number}: ${totalPieces} pieces`,
    reason: "finished_goods",
    source_module: "production_daily_log",
    created_by: userId,
  });
  if (error) throw new Error(error.message);
}

export async function upsertDailyLog(
  input: DailyLogInput,
  user: ApiUser
): Promise<ProductionDailyLog> {
  const supabase = await createClient();

  const { data: batchRow, error: batchError } = await supabase
    .from("production_batches")
    .select("*")
    .eq("id", input.batch_id)
    .eq("organization_id", user.organization_id)
    .single();

  if (batchError || !batchRow) throw new Error("Batch not found");
  const batch = batchRow as ProductionBatch;

  const blockSize = parseBlockSizeCm(batch.block_size_cm) ?? 20;
  const spec = BLOCK_YIELDS[blockSize];
  const logDate = input.log_date ?? new Date().toISOString().slice(0, 10);

  const [{ data: existingRow }, settings] = await Promise.all([
    supabase
      .from("production_daily_logs")
      .select("*")
      .eq("batch_id", input.batch_id)
      .eq("log_date", logDate)
      .maybeSingle(),
    getProductionSettings(user.organization_id),
  ]);
  const existing = existingRow as ProductionDailyLog | null;

  let targetPlates = input.target_plates != null ? Number(input.target_plates) : null;
  let isCustomTarget = targetPlates != null;
  if (targetPlates == null || !Number.isFinite(targetPlates) || targetPlates <= 0) {
    if (existing) {
      targetPlates = existing.target_plates;
      isCustomTarget = existing.is_custom_target;
    } else {
      targetPlates = settings.default_daily_target_plates;
      isCustomTarget = false;
    }
  }
  const targetPieces = targetPlates * spec.blocksPerPlate;

  const actualProvided = input.actual_plates != null;
  const actualPlates = actualProvided ? Number(input.actual_plates) : existing?.actual_plates ?? null;
  if (actualProvided && (!Number.isFinite(actualPlates as number) || (actualPlates as number) < 0)) {
    throw new Error("Actual plates must be a non-negative number");
  }

  const calculatedPieces = actualPlates != null ? actualPlates * spec.blocksPerPlate : null;

  const shortfallReason = input.shortfall_reason?.trim() || existing?.shortfall_reason || null;
  if (calculatedPieces != null && calculatedPieces < targetPieces && !shortfallReason) {
    throw new Error("A reason is required when the daily count falls short of the target");
  }

  const cementBagsUsed =
    input.cement_bags_used != null ? Number(input.cement_bags_used) : existing?.cement_bags_used ?? null;
  const policheLoadsUsed =
    input.poliche_loads_used != null
      ? Number(input.poliche_loads_used)
      : existing?.poliche_loads_used ?? null;

  const standard = calculateMaterialConsumption(
    blockSize,
    calculatedPieces ?? 0,
    BLOCK_YIELDS,
    settings.cement_kg_per_bag
  );
  const cementWaste =
    cementBagsUsed != null && calculatedPieces != null
      ? Math.max(0, cementBagsUsed - standard.cementBags)
      : 0;
  const policheWaste =
    policheLoadsUsed != null && calculatedPieces != null
      ? roundPolicheLoads(Math.max(0, policheLoadsUsed - standard.policheLoads))
      : 0;

  const unitCosts = await resolveMaterialUnitCosts(supabase);
  const wasteCost = cementWaste * unitCosts.cement + policheWaste * unitCosts.poliche;

  await assertMaterialsAvailableForLog(supabase, {
    cementBags: cementBagsUsed,
    policheLoads: policheLoadsUsed,
    existingLogId: existing?.id ?? null,
  });

  const { data, error } = await supabase
    .from("production_daily_logs")
    .upsert(
      {
        organization_id: user.organization_id,
        factory_id: input.factory_id,
        batch_id: input.batch_id,
        log_date: logDate,
        target_plates: targetPlates,
        is_custom_target: isCustomTarget,
        actual_plates: actualPlates,
        calculated_pieces: calculatedPieces,
        target_pieces: targetPieces,
        shortfall_reason: shortfallReason,
        cement_bags_used: cementBagsUsed,
        poliche_loads_used: policheLoadsUsed,
        standard_cement_bags: calculatedPieces != null ? standard.cementBags : existing?.standard_cement_bags ?? 0,
        standard_poliche_loads: calculatedPieces != null ? standard.policheLoads : existing?.standard_poliche_loads ?? 0,
        cement_waste_bags: cementWaste,
        poliche_waste_loads: policheWaste,
        waste_cost: wasteCost,
        entered_by: user.id,
      },
      { onConflict: "batch_id,log_date" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const log = data as ProductionDailyLog;

  await syncDailyLogMaterialConsumption(supabase, log, batch.batch_number, unitCosts, user.id);
  await syncBatchFinishedGoodsFromDailyLogs(supabase, batch, user.id);

  return log;
}

export async function listDailyLogsForBatch(
  batchId: string,
  orgId: string
): Promise<ProductionDailyLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_daily_logs")
    .select("*")
    .eq("batch_id", batchId)
    .eq("organization_id", orgId)
    .order("log_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as ProductionDailyLog[];
}

/**
 * Re-derives waste_cost for every daily log in the org from its already-stored waste
 * quantities (cement_waste_bags, poliche_waste_loads), against current unit costs.
 * Called whenever the cement or poliche item's unit_cost changes, so historical waste
 * cost stays priced at today's rate rather than whatever was current when each log
 * was originally saved.
 */
export async function recalculateDailyLogWasteCosts(orgId: string): Promise<void> {
  const supabase = await createClient();
  const unitCosts = await resolveMaterialUnitCosts(supabase);

  const { data: logs, error } = await supabase
    .from("production_daily_logs")
    .select("id, cement_waste_bags, poliche_waste_loads")
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);

  for (const log of logs ?? []) {
    const wasteCost =
      Number(log.cement_waste_bags ?? 0) * unitCosts.cement +
      Number(log.poliche_waste_loads ?? 0) * unitCosts.poliche;

    await supabase
      .from("production_daily_logs")
      .update({ waste_cost: wasteCost })
      .eq("id", log.id);
  }
}

export type DailyLogSummary = {
  outputPieces: number;
  wasteCost: number;
  daysLogged: number;
};

export async function getDailyLogSummary(
  orgId: string,
  factoryId: string,
  from: string,
  to: string
): Promise<DailyLogSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_daily_logs")
    .select("calculated_pieces, waste_cost")
    .eq("organization_id", orgId)
    .eq("factory_id", factoryId)
    .gte("log_date", from)
    .lte("log_date", to);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  return {
    outputPieces: rows.reduce((sum, r) => sum + Number(r.calculated_pieces ?? 0), 0),
    wasteCost: rows.reduce((sum, r) => sum + Number(r.waste_cost ?? 0), 0),
    daysLogged: rows.length,
  };
}

export async function deleteDailyLog(id: string, orgId: string): Promise<boolean> {
  const supabase = await createClient();

  const { data: logRow } = await supabase
    .from("production_daily_logs")
    .select("batch_id, calculated_pieces")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!logRow) throw new Error("Daily log not found");

  if (logRow.batch_id) {
    const { data: otherLogs } = await supabase
      .from("production_daily_logs")
      .select("calculated_pieces")
      .eq("batch_id", logRow.batch_id)
      .neq("id", id);
    const remainingTotal = (otherLogs ?? []).reduce(
      (sum, r) => sum + Number(r.calculated_pieces ?? 0),
      0
    );
    await assertBatchProductionNotOversold(logRow.batch_id, orgId, remainingTotal);
  }

  await supabase
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "production_daily_logs")
    .eq("reference_id", id);
  await supabase.from("sage_transactions").delete().eq("reference", id);

  const { error } = await supabase
    .from("production_daily_logs")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);

  if (error) throw new Error(error.message);

  if (logRow?.batch_id) {
    const { data: batchRow } = await supabase
      .from("production_batches")
      .select("*")
      .eq("id", logRow.batch_id)
      .maybeSingle();
    if (batchRow) {
      await syncBatchFinishedGoodsFromDailyLogs(supabase, batchRow as ProductionBatch, null);
    }
  }

  return true;
}
