import {
  BLOCK_FACTORY_SKUS,
  applyBlockCuringComplete,
  applyBlockProductionPhase1,
} from "@/lib/block-factory/inventory-sync";
import {
  BLOCK_YIELDS,
  calculateMaterialConsumption,
  finishedGoodsSku,
  parseBlockSizeCm,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import { FACTORY_IDS } from "@/types";
import type { ProductionBatch, ProductionCount } from "@/types";

export type PlannedBlockMovement = {
  factory_id: string;
  item_id: string;
  movement_type: string;
  quantity: number;
  notes?: string;
  reason?: string;
  source_module?: string;
};

type ItemRow = { id: string; sku: string; factory_id: string };

export async function batchHasRawMaterialConsumption(
  supabase: { from: (t: string) => unknown },
  batchId: string
): Promise<boolean> {
  return batchHasBatchMovement(supabase, batchId, "production_consumption");
}

export async function referenceHasMovement(
  supabase: { from: (t: string) => unknown },
  referenceType: string,
  referenceId: string,
  reason: string
): Promise<boolean> {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string, o?: { count: string; head: boolean }) => {
        eq: (a: string, v: string) => {
          eq: (a: string, v: string) => {
            eq: (a: string, v: string) => Promise<{ count: number | null }>;
          };
        };
      };
    };
  };

  const { count } = await client
    .from("inventory_movements")
    .select("*", { count: "exact", head: true })
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .eq("reason", reason);

  return (count ?? 0) > 0;
}

export async function batchHasBatchMovement(
  supabase: { from: (t: string) => unknown },
  batchId: string,
  reason: string
): Promise<boolean> {
  return referenceHasMovement(supabase, "production_batches", batchId, reason);
}

/** Net quantity posted for a batch movement reason (wip_intake is positive, curing_complete is negative). */
export async function batchMovementNetQuantity(
  supabase: { from: (t: string) => unknown },
  referenceId: string,
  reason: string,
  referenceType = "production_batches"
): Promise<number> {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, v: string) => {
          eq: (a: string, v: string) => {
            eq: (a: string, v: string) => Promise<{ data: Array<{ quantity: number }> | null }>;
          };
        };
      };
    };
  };

  const { data } = await client
    .from("inventory_movements")
    .select("quantity")
    .eq("reference_type", referenceType)
    .eq("reference_id", referenceId)
    .eq("reason", reason);

  return (data ?? []).reduce((sum, row) => sum + Number(row.quantity ?? 0), 0);
}

/** Move batch output from WIP to finished goods (and waste) when batch is completed. */
export async function planBatchCompletionMovements(
  supabase: { from: (t: string) => unknown },
  batch: {
    id: string;
    batch_number: string;
    block_size_cm?: number | null;
  },
  output: { good: number; damaged: number }
): Promise<PlannedBlockMovement[]> {
  const good = Math.max(0, output.good);
  const damaged = Math.max(0, output.damaged);
  const removed = good + damaged;
  if (removed <= 0) return [];

  const alreadyLeftWip = await batchHasBatchMovement(supabase, batch.id, "curing_complete");
  const alreadyFinished = await batchHasBatchMovement(supabase, batch.id, "finished_goods");
  if (alreadyFinished) return [];

  const wipIntake = Math.max(0, await batchMovementNetQuantity(supabase, batch.id, "wip_intake"));
  const alreadyRemoved = Math.abs(
    await batchMovementNetQuantity(supabase, batch.id, "curing_complete")
  );
  const remainingInWip = Math.max(0, wipIntake - alreadyRemoved);

  let cappedGood = good;
  let cappedDamaged = damaged;
  let removeFromWip = removed;

  if (alreadyLeftWip) {
    removeFromWip = 0;
  } else if (remainingInWip > 0 && removed > remainingInWip) {
    const scale = remainingInWip / removed;
    cappedGood = Math.floor(good * scale);
    cappedDamaged = remainingInWip - cappedGood;
    removeFromWip = remainingInWip;
  } else if (remainingInWip <= 0 && wipIntake > 0) {
    // WIP was already drained (e.g. via production count) — post FG only.
    removeFromWip = 0;
  } else if (remainingInWip <= 0 && wipIntake === 0 && removed > 0) {
    // No WIP ledger for this batch — post finished goods directly.
    removeFromWip = 0;
  } else if (remainingInWip <= 0) {
    return [];
  }

  if (cappedGood <= 0 && cappedDamaged <= 0) return [];

  const blockSize = parseBlockSizeCm(batch.block_size_cm) ?? 20;
  const movements: PlannedBlockMovement[] = [];
  const wip = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.wip);
  const fg = await findItemBySku(supabase, FACTORY_IDS.block, finishedGoodsSku(blockSize));
  const waste = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.waste);

  if (wip && removeFromWip > 0) {
    movements.push({
      factory_id: FACTORY_IDS.block,
      item_id: wip.id,
      movement_type: "production_out",
      quantity: -removeFromWip,
      notes: `Batch ${batch.batch_number} completed — ${removeFromWip} blocks leave curing`,
      reason: "curing_complete",
      source_module: "production",
    });
  }
  if (fg && cappedGood > 0) {
    movements.push({
      factory_id: FACTORY_IDS.block,
      item_id: fg.id,
      movement_type: "production_in",
      quantity: cappedGood,
      notes: `Batch ${batch.batch_number} ready to ship: ${cappedGood} × ${blockSize}cm`,
      reason: "finished_goods",
      source_module: "production",
    });
  }
  if (waste && cappedDamaged > 0) {
    movements.push({
      factory_id: FACTORY_IDS.block,
      item_id: waste.id,
      movement_type: "damage_return",
      quantity: cappedDamaged,
      notes: `Batch ${batch.batch_number} waste`,
      reason: "production_waste",
      source_module: "production",
    });
  }

  return movements;
}

/** WIP intake when a batch enters production. */
export async function planBatchWipIntakeMovement(
  supabase: { from: (t: string) => unknown },
  batch: {
    batch_number: string;
    block_size_cm?: number | null;
  },
  quantity: number
): Promise<PlannedBlockMovement | null> {
  if (quantity <= 0) return null;

  const wip = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.wip);
  if (!wip) return null;

  const blockSize = parseBlockSizeCm(batch.block_size_cm) ?? 20;
  return {
    factory_id: FACTORY_IDS.block,
    item_id: wip.id,
    movement_type: "production_in",
    quantity,
    notes: `Batch ${batch.batch_number}: ${quantity} × ${blockSize}cm blocks enter drying/curing`,
    reason: "wip_intake",
    source_module: "production",
  };
}

/** Cement + poliche deductions from yield rules (no WIP/FG). */
export async function planRawMaterialConsumptionMovements(
  supabase: { from: (t: string) => unknown },
  input: {
    blockSize: BlockSizeCm;
    blockQuantity: number;
    batchNumber: string;
    referenceType: string;
    referenceId: string;
  }
): Promise<PlannedBlockMovement[]> {
  const consumption = calculateMaterialConsumption(input.blockSize, input.blockQuantity);
  const movements: PlannedBlockMovement[] = [];

  const cement = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.cement);
  const poliche = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.poliche);

  if (cement && consumption.cementBags > 0) {
    movements.push({
      factory_id: FACTORY_IDS.block,
      item_id: cement.id,
      movement_type: "production_out",
      quantity: -consumption.cementBags,
      notes: `Production ${input.batchNumber}: ${consumption.cementBags} bags cement (${consumption.cementKg} kg)`,
      reason: "production_consumption",
      source_module: "production",
    });
  }
  if (poliche && consumption.policheLoads > 0) {
    movements.push({
      factory_id: FACTORY_IDS.block,
      item_id: poliche.id,
      movement_type: "production_out",
      quantity: -consumption.policheLoads,
      notes: `Production ${input.batchNumber}: ${consumption.policheLoads} poliche load(s)`,
      reason: "production_consumption",
      source_module: "production",
    });
  }

  return movements;
}

export async function findItemBySku(
  supabase: { from: (t: string) => unknown },
  factoryId: string,
  sku: string
): Promise<ItemRow | null> {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, v: string) => {
          eq: (a: string, v: string) => {
            eq: (a: string, v: boolean) => {
              maybeSingle: () => Promise<{ data: ItemRow | null }>;
            };
          };
        };
      };
    };
  };

  const { data } = await client
    .from("inventory_items")
    .select("id, sku, factory_id")
    .eq("factory_id", factoryId)
    .eq("sku", sku)
    .eq("is_active", true)
    .maybeSingle();

  return data;
}

export async function getBatchForCount(
  supabase: { from: (t: string) => unknown },
  batchId: string
): Promise<ProductionBatch | null> {
  const client = supabase as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (a: string, v: string) => { maybeSingle: () => Promise<{ data: ProductionBatch | null }> };
      };
    };
  };
  const { data } = await client.from("production_batches").select("*").eq("id", batchId).maybeSingle();
  return data;
}

/** Plan block-factory inventory movements using yield rules (Supabase path). */
export async function planBlockFactoryMovements(
  supabase: { from: (t: string) => unknown },
  count: ProductionCount,
  batch?: ProductionBatch | null
): Promise<PlannedBlockMovement[]> {
  if (count.factory_id !== FACTORY_IDS.block) return [];

  const resolvedBatch =
    batch ?? (count.batch_id ? await getBatchForCount(supabase, count.batch_id) : null);
  const blockSize =
    parseBlockSizeCm(resolvedBatch?.block_size_cm) ?? (20 as BlockSizeCm);
  const batchNumber = resolvedBatch?.batch_number ?? count.id;
  const movements: PlannedBlockMovement[] = [];

  const wip = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.wip);
  const waste = await findItemBySku(supabase, FACTORY_IDS.block, BLOCK_FACTORY_SKUS.waste);
  const fg = await findItemBySku(supabase, FACTORY_IDS.block, finishedGoodsSku(blockSize));

  if (count.checkpoint === "batch_count") {
    const total = (count.good_count ?? 0) + (count.damaged_count ?? 0);
    const batchId = count.batch_id ?? resolvedBatch?.id;
    const alreadyConsumed =
      batchId != null ? await batchHasRawMaterialConsumption(supabase, batchId) : false;
    const alreadyWipIntake =
      batchId != null ? await batchHasBatchMovement(supabase, batchId, "wip_intake") : false;

    if (!alreadyConsumed && total > 0) {
      movements.push(
        ...(await planRawMaterialConsumptionMovements(supabase, {
          blockSize,
          blockQuantity: total,
          batchNumber,
          referenceType: "production_counts",
          referenceId: count.id,
        }))
      );
    }

    if (wip && (count.good_count ?? 0) > 0 && !alreadyWipIntake) {
      movements.push({
        factory_id: FACTORY_IDS.block,
        item_id: wip.id,
        movement_type: "production_in",
        quantity: count.good_count ?? 0,
        notes: `Production ${batchNumber}: blocks entering curing`,
        reason: "wip_intake",
        source_module: "production",
      });
    }
  }

  if (count.checkpoint === "after_curing") {
    const good = count.good_count ?? 0;
    const damaged = count.damaged_count ?? 0;
    const removed = good + damaged;

    if (wip && removed > 0) {
      movements.push({
        factory_id: FACTORY_IDS.block,
        item_id: wip.id,
        movement_type: "production_out",
        quantity: -removed,
        notes: `Curing complete ${batchNumber}`,
        reason: "curing_complete",
        source_module: "production",
      });
    }
    if (fg && good > 0) {
      movements.push({
        factory_id: FACTORY_IDS.block,
        item_id: fg.id,
        movement_type: "production_in",
        quantity: good,
        notes: `Curing complete ${batchNumber}: ${good} × ${blockSize}cm`,
        reason: "finished_goods",
        source_module: "production",
      });
    }
    if (waste && damaged > 0) {
      movements.push({
        factory_id: FACTORY_IDS.block,
        item_id: waste.id,
        movement_type: "damage_return",
        quantity: damaged,
        notes: `Curing waste ${batchNumber}`,
        reason: "production_waste",
        source_module: "production",
      });
    }
  }

  return movements;
}

export { BLOCK_YIELDS };
