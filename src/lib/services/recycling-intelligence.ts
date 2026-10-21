import { getInventoryData, getProductionData } from "@/lib/services";
import { computeRecyclingStats } from "@/lib/production/stats";
import { resolveDateRange } from "@/lib/production/filters";
import { FACTORY_IDS, type InventoryItem, type ProductionCount } from "@/types";

export interface RecyclingStockRow {
  sku: string;
  name: string;
  quantity_kg: number;
  unit: string;
  low_stock: boolean;
}

export interface RecyclingIntelligenceSummary {
  business: "plastic_recycling";
  today_output_kg: number;
  today_yield_rate: number;
  today_waste_rate: number;
  week_output_kg: number;
  week_yield_rate: number;
  week_waste_rate: number;
  month_output_kg: number;
  month_yield_rate: number;
  month_waste_rate: number;
  raw_material_stock: RecyclingStockRow[];
  finished_goods_stock: RecyclingStockRow[];
  has_low_raw_material: boolean;
  has_low_finished_stock: boolean;
  computed_at: string;
  note: string;
}

/**
 * Recycling equivalent of the block-only capacity/intelligence engine: real
 * output, yield, and waste computed live from production_counts, plus
 * current raw material / finished pellet stock from inventory_items. No
 * BOM-based capacity prediction exists for recycling — everything here is
 * derived directly from live records, not a learned/cached model.
 */
export async function getRecyclingIntelligenceSummary(
  orgId: string
): Promise<RecyclingIntelligenceSummary> {
  const [prod, inv] = await Promise.all([
    getProductionData("recycling", orgId),
    getInventoryData("recycling"),
  ]);

  const counts = (prod.counts ?? []) as ProductionCount[];
  const weekRange = resolveDateRange("weekly");
  const monthRange = resolveDateRange("monthly");
  const today = computeRecyclingStats(counts);
  const week = computeRecyclingStats(counts, { dateFrom: weekRange.from, dateTo: weekRange.to });
  const month = computeRecyclingStats(counts, { dateFrom: monthRange.from, dateTo: monthRange.to });

  const items = (inv.items ?? []) as InventoryItem[];
  const rawMaterial = items.filter(
    (i) => i.factory_id === FACTORY_IDS.recycling && i.category === "raw_material"
  );
  const finishedGoods = items.filter(
    (i) => i.factory_id === FACTORY_IDS.recycling && i.category === "finished_goods"
  );

  const stockRow = (i: InventoryItem): RecyclingStockRow => ({
    sku: i.sku,
    name: i.name,
    quantity_kg: i.quantity,
    unit: i.unit,
    low_stock: i.low_stock_threshold > 0 && i.quantity <= i.low_stock_threshold,
  });

  const rawMaterialRows = rawMaterial.map(stockRow);
  const finishedGoodsRows = finishedGoods.map(stockRow);

  return {
    business: "plastic_recycling",
    today_output_kg: today.totalOutput,
    today_yield_rate: today.yieldRate,
    today_waste_rate: today.curingDamageRate,
    week_output_kg: week.totalOutput,
    week_yield_rate: week.yieldRate,
    week_waste_rate: week.curingDamageRate,
    month_output_kg: month.totalOutput,
    month_yield_rate: month.yieldRate,
    month_waste_rate: month.curingDamageRate,
    raw_material_stock: rawMaterialRows,
    finished_goods_stock: finishedGoodsRows,
    has_low_raw_material: rawMaterialRows.some((r) => r.low_stock),
    has_low_finished_stock: finishedGoodsRows.some((r) => r.low_stock),
    computed_at: new Date().toISOString(),
    note: "Waste = material_received - processed_output. There is no batch/checkpoint or BOM-based capacity prediction for recycling — figures are computed directly from production records and current stock.",
  };
}
