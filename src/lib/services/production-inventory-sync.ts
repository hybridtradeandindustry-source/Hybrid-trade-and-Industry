import { createServiceClient } from "@/lib/supabase/server";
import { isRecyclingFactory } from "@/lib/production/filters";
import { planBlockFactoryMovements } from "@/lib/block-factory/supabase-sync";
import type { ProductionCount } from "@/types";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

interface PlannedMovement {
  factory_id: string;
  item_id: string;
  movement_type: string;
  quantity: number;
  notes?: string;
  reason?: string;
  source_module?: string;
}

async function findItemByCategory(
  supabase: ServiceClient,
  factoryId: string,
  category: "raw_material" | "finished_goods" | "work_in_process"
) {
  const { data } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("factory_id", factoryId)
    .eq("category", category)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data;
}

async function findActiveBom(supabase: ServiceClient, factoryId: string) {
  const { data: bom } = await supabase
    .from("inventory_bom")
    .select("id, factory_id, finished_item_id, name, yield_quantity")
    .eq("factory_id", factoryId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bom) return null;

  const { data: lines } = await supabase
    .from("inventory_bom_lines")
    .select("component_item_id, quantity_required, scrap_factor")
    .eq("bom_id", bom.id)
    .order("sort_order", { ascending: true });

  return { ...bom, lines: lines ?? [] };
}

function planBomMovements(
  bom: {
    factory_id: string;
    finished_item_id: string;
    name: string;
    yield_quantity: number;
    lines: Array<{
      component_item_id: string;
      quantity_required: number;
      scrap_factor: number;
    }>;
  },
  outputQty: number
): PlannedMovement[] {
  if (bom.yield_quantity <= 0 || outputQty <= 0) return [];

  const scale = outputQty / Number(bom.yield_quantity);
  const movements: PlannedMovement[] = [];

  for (const line of bom.lines) {
    const qty =
      -Number(line.quantity_required) * scale * (1 + Number(line.scrap_factor ?? 0));
    if (qty === 0) continue;
    movements.push({
      factory_id: bom.factory_id,
      item_id: line.component_item_id,
      movement_type: "production_out",
      quantity: qty,
      notes: `BOM consumption: ${bom.name}`,
    });
  }

  movements.push({
    factory_id: bom.factory_id,
    item_id: bom.finished_item_id,
    movement_type: "production_in",
    quantity: outputQty,
    notes: `BOM output: ${bom.name}`,
  });

  return movements;
}

export async function planProductionMovements(
  supabase: ServiceClient,
  count: ProductionCount
): Promise<PlannedMovement[]> {
  const isBlock = !isRecyclingFactory(count.factory_id);

  if (isBlock) {
    const blockMovements = await planBlockFactoryMovements(supabase, count);
    if (blockMovements.length > 0) return blockMovements;
  }

  const movements: PlannedMovement[] = [];

  if (isBlock && count.damaged_count && count.damaged_count > 0) {
    const raw = await findItemByCategory(supabase, count.factory_id, "raw_material");
    if (raw) {
      movements.push({
        factory_id: count.factory_id,
        item_id: raw.id,
        movement_type: "damage_return",
        quantity: count.damaged_count,
        notes: count.checkpoint
          ? `Damaged units at ${count.checkpoint.replace(/_/g, " ")}`
          : "Damaged units from production",
      });
    }
  }

  if (
    isBlock &&
    count.checkpoint === "after_curing" &&
    count.good_count &&
    count.good_count > 0
  ) {
    const bom = await findActiveBom(supabase, count.factory_id);
    if (bom && bom.lines.length > 0) {
      movements.push(...planBomMovements(bom, count.good_count));
    } else {
      const fg = await findItemByCategory(supabase, count.factory_id, "finished_goods");
      if (fg) {
        movements.push({
          factory_id: count.factory_id,
          item_id: fg.id,
          movement_type: "production_in",
          quantity: count.good_count,
          notes: "Finished goods from curing",
        });
      }
    }
  }

  if (!isBlock) {
    const raw = await findItemByCategory(supabase, count.factory_id, "raw_material");

    // The full amount received leaves raw material stock — waste/loss during
    // sorting & production is discarded, not returned as usable raw material,
    // so it must NOT be added back here (that would only net out to
    // processed_output instead of the true material_received consumption).
    if (count.material_received && count.material_received > 0 && raw) {
      movements.push({
        factory_id: count.factory_id,
        item_id: raw.id,
        movement_type: "production_out",
        quantity: -count.material_received,
        notes: "Material consumed for recycling",
      });
    }

    // Raw material consumption is already fully accounted for above via
    // material_received (the whole amount received leaves raw stock, per
    // the actual recycling business flow) — deliberately NOT using the BOM
    // here, because a recycling BOM's component line would consume the raw
    // material item a SECOND time on top of that, double-deducting stock.
    // Only the finished-goods side is posted for the output.
    if (count.processed_output && count.processed_output > 0) {
      const fg = await findItemByCategory(supabase, count.factory_id, "finished_goods");
      if (fg) {
        movements.push({
          factory_id: count.factory_id,
          item_id: fg.id,
          movement_type: "production_in",
          quantity: count.processed_output,
          notes: "Recycled output posted to inventory",
        });
      }
    }
  }

  return movements;
}

async function clearProductionCountMovements(
  supabase: ServiceClient,
  countId: string
): Promise<void> {
  const { error } = await supabase
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "production_counts")
    .eq("reference_id", countId);

  if (error) throw new Error(error.message);
}

export async function syncProductionCountInventory(
  count: ProductionCount,
  userId: string | null
): Promise<void> {
  const supabase = await createServiceClient();
  await clearProductionCountMovements(supabase, count.id);

  const planned = await planProductionMovements(supabase, count);
  if (planned.length === 0) return;

  const rows = planned.map((movement) => ({
    organization_id: count.organization_id,
    factory_id: movement.factory_id,
    item_id: movement.item_id,
    movement_type: movement.movement_type,
    quantity: movement.quantity,
    reference_type: "production_counts",
    reference_id: count.id,
    notes: movement.notes ?? null,
    reason: movement.reason ?? null,
    source_module: movement.source_module ?? null,
    created_by: userId,
  }));

  const { error } = await supabase.from("inventory_movements").insert(rows);
  if (error) throw new Error(error.message);
}

export async function clearProductionCountInventory(countId: string): Promise<void> {
  const supabase = await createServiceClient();
  await clearProductionCountMovements(supabase, countId);
}
