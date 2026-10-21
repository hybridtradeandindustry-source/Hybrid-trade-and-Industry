import type { InventoryItem, InventoryMovement } from "@/types";
import type {
  AbcClass,
  AbcAnalysisRow,
  DaysOfSupplyRow,
  DeadStockRow,
  InventoryIntelligence,
  InventorySkuRule,
  SmartReorderRow,
} from "@/types/inventory-enterprise";
import { getAvailableQuantity } from "@/lib/inventory/inventory-utils";

export function generateSkuFromRule(
  rule: InventorySkuRule,
  categorySlug?: string
): { sku: string; nextSequence: number } {
  const seq = String(rule.next_sequence).padStart(rule.sequence_pad, "0");
  const parts = [rule.prefix, categorySlug?.toUpperCase().slice(0, 3), seq].filter(Boolean);
  const sku = parts.join(rule.separator);
  return { sku, nextSequence: rule.next_sequence + 1 };
}

export function convertUnits(factor: number, qty: number, direction: "from" | "to"): number {
  return direction === "from" ? qty * factor : qty / factor;
}

export function computeAbcAnalysis(items: InventoryItem[], movements: InventoryMovement[]): AbcAnalysisRow[] {
  const active = items.filter((i) => i.is_active);
  const valueMap = active.map((item) => {
    const annualValue = item.quantity * (item.unit_cost ?? 0) * 12;
    const movement_count = movements.filter((m) => m.item_id === item.id).length;
    return { item, annualValue, movement_count };
  });
  const total = valueMap.reduce((s, r) => s + r.annualValue, 0) || 1;
  const sorted = [...valueMap].sort((a, b) => b.annualValue - a.annualValue);
  let cumulative = 0;
  return sorted.map(({ item, annualValue, movement_count }) => {
    cumulative += annualValue / total;
    let abc_class: AbcClass = "C";
    if (cumulative <= 0.8) abc_class = "A";
    else if (cumulative <= 0.95) abc_class = "B";
    return {
      item_id: item.id,
      sku: item.sku,
      name: item.name,
      abc_class,
      annual_value: annualValue,
      pct_of_total: (annualValue / total) * 100,
      movement_count,
    };
  });
}

export function computeDaysOfSupply(
  items: InventoryItem[],
  movements: InventoryMovement[],
  days = 30
): DaysOfSupplyRow[] {
  const since = Date.now() - days * 86400000;
  return items
    .filter((i) => i.is_active)
    .map((item) => {
      const recent = movements.filter(
        (m) => m.item_id === item.id && new Date(m.created_at).getTime() >= since && m.quantity < 0
      );
      const totalOut = recent.reduce((s, m) => s + Math.abs(m.quantity), 0);
      const avg_daily_usage = totalOut / days || 0.01;
      return {
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        avg_daily_usage: Math.round(avg_daily_usage * 100) / 100,
        days_of_supply: Math.round(item.quantity / avg_daily_usage),
      };
    })
    .sort((a, b) => a.days_of_supply - b.days_of_supply);
}

export function computeDeadStock(
  items: InventoryItem[],
  movements: InventoryMovement[],
  thresholdDays = 90
): DeadStockRow[] {
  const now = Date.now();
  return items
    .filter((i) => i.is_active && i.quantity > 0)
    .map((item) => {
      const last = movements
        .filter((m) => m.item_id === item.id)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      const days_since = last
        ? Math.floor((now - new Date(last.created_at).getTime()) / 86400000)
        : thresholdDays + 1;
      return {
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        quantity: item.quantity,
        value: item.quantity * (item.unit_cost ?? 0),
        days_since_last_movement: days_since,
      };
    })
    .filter((r) => r.days_since_last_movement >= thresholdDays)
    .sort((a, b) => b.value - a.value);
}

export function computeSmartReorder(items: InventoryItem[]): SmartReorderRow[] {
  return items
    .filter((i) => i.is_active)
    .map((item) => {
      const available = getAvailableQuantity(item);
      const lead = item.lead_time_days ?? 7;
      const reorderPoint = item.low_stock_threshold + (available > 0 ? 0 : 0);
      const needsReorder = available <= item.low_stock_threshold;
      const suggested_qty =
        item.reorder_quantity ??
        Math.max(item.low_stock_threshold * 2, item.max_stock_level ? item.max_stock_level - available : 100);
      return {
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        available,
        reorder_point: reorderPoint,
        suggested_qty,
        lead_time_days: lead,
        reason: needsReorder
          ? available <= 0
            ? "Out of stock"
            : "Below reorder point"
          : "OK",
      };
    })
    .filter((r) => r.reason !== "OK");
}

export function computeInventoryIntelligence(
  items: InventoryItem[],
  movements: InventoryMovement[]
): InventoryIntelligence {
  return {
    abcAnalysis: computeAbcAnalysis(items, movements),
    daysOfSupply: computeDaysOfSupply(items, movements),
    deadStock: computeDeadStock(items, movements),
    smartReorder: computeSmartReorder(items),
  };
}

export function shouldAutoApproveCount(
  systemQty: number,
  countedQty: number,
  rule: { max_variance_percent: number; max_variance_units?: number | null }
): boolean {
  const variance = Math.abs(countedQty - systemQty);
  if (rule.max_variance_units != null && variance <= rule.max_variance_units) return true;
  if (systemQty === 0) return variance === 0;
  const pct = (variance / systemQty) * 100;
  return pct <= rule.max_variance_percent;
}

export function generateBarcodeValue(sku: string, lotNumber?: string): string {
  return lotNumber ? `${sku}:${lotNumber}` : sku;
}

export function applyBomConsumption(
  lines: { component_item_id: string; quantity_required: number; scrap_factor: number }[],
  yieldQty: number,
  batchSize: number
): { item_id: string; quantity: number }[] {
  const multiplier = batchSize / yieldQty;
  return lines.map((line) => ({
    item_id: line.component_item_id,
    quantity: -(line.quantity_required * multiplier * (1 + line.scrap_factor)),
  }));
}
