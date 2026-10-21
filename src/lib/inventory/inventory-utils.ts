import type { InventoryConfig, InventoryItem, InventoryMetrics, InventoryMovement, ViewScope } from "@/types";
import { APP_CONFIG } from "@/lib/config";
import { FACTORY_IDS } from "@/types";
import { resolveCategoryName, resolveItemTypeName } from "@/lib/inventory/inventory-config";

const STOCK_CLASS_LABELS: Record<string, string> = {
  raw_material: "Raw Materials",
  work_in_process: "Work in Progress",
  finished_goods: "Finished Goods",
  other: "Other",
};

export function resolveItemStockClass(
  item: InventoryItem,
  config?: InventoryConfig
): keyof typeof STOCK_CLASS_LABELS {
  if (item.category && item.category in STOCK_CLASS_LABELS) {
    return item.category;
  }
  if (item.sku.includes("-FG-")) return "finished_goods";
  if (item.sku.includes("-WIP-")) return "work_in_process";
  if (item.sku.includes("-RM-")) return "raw_material";
  if (config && item.item_type_id) {
    const typeName = resolveItemTypeName(config, item.item_type_id).toLowerCase();
    if (typeName.includes("finished")) return "finished_goods";
    if (typeName.includes("raw")) return "raw_material";
    if (typeName.includes("work") || typeName.includes("progress")) return "work_in_process";
  }
  return "other";
}

function itemValue(item: InventoryItem): number {
  return Math.max(0, item.quantity) * (item.unit_cost ?? 0);
}

function buildByItemType(
  active: InventoryItem[],
  config?: InventoryConfig
): InventoryMetrics["byItemType"] {
  const typedIds = [
    ...new Set(active.map((i) => i.item_type_id).filter((id) => id && config?.itemTypes?.some((t) => t.id === id))),
  ];

  if (typedIds.length > 0 && config) {
    return typedIds.reduce(
      (acc, typeId) => {
        const typeItems = active.filter((i) => i.item_type_id === typeId);
        acc[typeId] = {
          count: typeItems.length,
          units: typeItems.reduce((s, i) => s + i.quantity, 0),
          value: typeItems.reduce((s, i) => s + itemValue(i), 0),
          label: resolveItemTypeName(config, typeId),
        };
        return acc;
      },
      {} as InventoryMetrics["byItemType"]
    );
  }

  return (["raw_material", "work_in_process", "finished_goods", "other"] as const).reduce(
    (acc, stockClass) => {
      const typeItems = active.filter((i) => resolveItemStockClass(i, config) === stockClass);
      if (typeItems.length === 0) return acc;
      acc[`class:${stockClass}`] = {
        count: typeItems.length,
        units: typeItems.reduce((s, i) => s + i.quantity, 0),
        value: typeItems.reduce((s, i) => s + itemValue(i), 0),
        label: STOCK_CLASS_LABELS[stockClass],
      };
      return acc;
    },
    {} as InventoryMetrics["byItemType"]
  );
}

export function computeInventoryMetrics(
  items: InventoryItem[],
  config?: InventoryConfig,
  options?: { pendingCounts?: number }
): InventoryMetrics {
  const active = items.filter((i) => i.is_active);
  const byItemType = buildByItemType(active, config);

  const byCategory = active.reduce(
    (acc, item) => {
      const key = item.category_id || resolveItemStockClass(item, config);
      if (!acc[key]) acc[key] = { count: 0, units: 0, value: 0 };
      acc[key].count += 1;
      acc[key].units += item.quantity;
      acc[key].value += itemValue(item);
      return acc;
    },
    {} as InventoryMetrics["byCategory"]
  );

  const blockItems = active.filter((i) => i.factory_id === FACTORY_IDS.block);
  const recyclingItems = active.filter((i) => i.factory_id === FACTORY_IDS.recycling);

  const sumFactory = (list: InventoryItem[]) => {
    const fg = list.filter((i) => resolveItemStockClass(i, config) === "finished_goods");
    return {
      skus: list.length,
      units: fg.reduce((s, i) => s + Math.max(0, i.quantity), 0),
      value: list.reduce((s, i) => s + itemValue(i), 0),
    };
  };

  const finishedGoods = active.filter((i) => resolveItemStockClass(i, config) === "finished_goods");
  const rawMaterials = active.filter((i) => resolveItemStockClass(i, config) === "raw_material");
  const finishedGoodsUnits = finishedGoods.reduce((s, i) => s + Math.max(0, i.quantity), 0);
  const rawMaterialUnits = rawMaterials.reduce((s, i) => s + i.quantity, 0);

  return {
    totalSkus: active.length,
    totalUnits: finishedGoodsUnits,
    finishedGoodsUnits,
    rawMaterialUnits,
    totalValue: active.reduce((s, i) => s + itemValue(i), 0),
    negativeStockCount: active.filter((i) => i.quantity < 0).length,
    lowStockCount: active.filter(
      (i) => needsReorder(i) && i.quantity > 0
    ).length,
    outOfStockCount: active.filter((i) => i.quantity <= 0 && needsReorder(i)).length,
    pendingCounts: options?.pendingCounts ?? 0,
    blockFactory: sumFactory(blockItems),
    recyclingFactory: sumFactory(recyclingItems),
    byItemType,
    byCategory,
  };
}

export function getStockHealth(item: InventoryItem): "critical" | "low" | "ok" | "overstock" {
  if (item.quantity <= 0) return "critical";
  if (item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold) return "low";
  if (item.max_stock_level && item.quantity > item.max_stock_level) return "overstock";
  return "ok";
}

export function getAvailableQuantity(item: InventoryItem): number {
  return Math.max(0, item.quantity - (item.reserved_quantity ?? 0));
}

export function needsReorder(item: InventoryItem): boolean {
  if (item.quantity < 0) return true;
  if (item.quantity <= 0) {
    return item.low_stock_threshold > 0 || (item.reorder_quantity ?? 0) > 0;
  }
  return item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold;
}

export function getReorderRecommendation(item: InventoryItem): string | null {
  if (!needsReorder(item)) {
    if (getStockHealth(item) === "overstock") {
      return "Over maximum stock level — consider redistribution";
    }
    return null;
  }

  const available = getAvailableQuantity(item);
  const reorderQty = item.reorder_quantity ?? item.low_stock_threshold;

  if (item.quantity <= 0) {
    return `Out of stock — reorder ${formatNumber(reorderQty)} ${item.unit}`;
  }
  if (available <= item.low_stock_threshold && item.reorder_quantity) {
    return `Below threshold (${formatNumber(item.quantity)} on hand) — suggested order: ${formatNumber(item.reorder_quantity)} ${item.unit}`;
  }
  if (item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold) {
    return `Low stock (${formatNumber(item.quantity)} on hand) — reorder ${formatNumber(reorderQty)} ${item.unit}`;
  }
  return null;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat(APP_CONFIG.locale).format(n);
}

export function filterInventoryItems(
  items: InventoryItem[],
  filters: {
    search?: string;
    category?: string;
    itemType?: string;
    factoryId?: string;
    health?: string;
  }
): InventoryItem[] {
  let result = items.filter((i) => i.is_active);
  if (filters.factoryId) result = result.filter((i) => i.factory_id === filters.factoryId);
  if (filters.category && filters.category !== "all") {
    result = result.filter((i) => i.category_id === filters.category);
  }
  if (filters.itemType && filters.itemType !== "all") {
    result = result.filter((i) => i.item_type_id === filters.itemType);
  }
  if (filters.health && filters.health !== "all") {
    result = result.filter((i) => getStockHealth(i) === filters.health);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.supplier?.toLowerCase().includes(q) ?? false) ||
        (i.location?.toLowerCase().includes(q) ?? false)
    );
  }
  return result;
}

export function scopeToFactoryId(scope: ViewScope): string | undefined {
  if (scope === "block") return APP_CONFIG.factoryIds.block;
  if (scope === "recycling") return APP_CONFIG.factoryIds.recycling;
  return undefined;
}

export function exportInventoryCsv(items: InventoryItem[], config?: InventoryConfig): string {
  const headers = [
    "SKU",
    "Name",
    "Factory",
    "Item Type",
    "Category",
    "Quantity",
    "Reserved",
    "Available",
    "Unit",
    "Unit Cost",
    "Total Value",
    "Threshold",
    "Location",
    "Supplier",
    "Health",
  ];
  const rows = items.map((i) => [
    i.sku,
    i.name,
    i.factory_id === FACTORY_IDS.block ? "Block Factory" : "Plastic Recycling",
    config ? resolveItemTypeName(config, i.item_type_id) : i.item_type_id,
    config ? resolveCategoryName(config, i.category_id) : i.category_id,
    i.quantity,
    i.reserved_quantity ?? 0,
    getAvailableQuantity(i),
    i.unit,
    i.unit_cost ?? 0,
    (i.quantity * (i.unit_cost ?? 0)).toFixed(2),
    i.low_stock_threshold,
    i.location ?? "",
    i.supplier ?? "",
    getStockHealth(i),
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function seedMovements(items: InventoryItem[]): InventoryMovement[] {
  const now = Date.now();
  const samples: Omit<InventoryMovement, "id">[] = [
    {
      organization_id: APP_CONFIG.orgId,
      factory_id: FACTORY_IDS.block,
      item_id: "inv-1",
      movement_type: "receipt",
      quantity: 500,
      balance_after: 4850,
      notes: "Cement delivery — PO-4421",
      created_at: new Date(now - 86400000 * 2).toISOString(),
    },
    {
      organization_id: APP_CONFIG.orgId,
      factory_id: FACTORY_IDS.block,
      item_id: "inv-fg-20",
      movement_type: "production_in",
      quantity: 455,
      balance_after: 1180,
      reference_type: "production_counts",
      notes: "Batch curing complete — Checkpoint 3",
      created_at: new Date(now - 86400000).toISOString(),
    },
    {
      organization_id: APP_CONFIG.orgId,
      factory_id: FACTORY_IDS.block,
      item_id: "inv-fg-20",
      movement_type: "sale",
      quantity: -200,
      balance_after: 980,
      reference_type: "orders",
      notes: "Order ORD-1041 shipment",
      created_at: new Date(now - 43200000).toISOString(),
    },
    {
      organization_id: APP_CONFIG.orgId,
      factory_id: FACTORY_IDS.recycling,
      item_id: "inv-3",
      movement_type: "receipt",
      quantity: 800,
      balance_after: 2750,
      notes: "Plastic waste intake — Truck #882",
      created_at: new Date(now - 86400000 * 3).toISOString(),
    },
    {
      organization_id: APP_CONFIG.orgId,
      factory_id: FACTORY_IDS.recycling,
      item_id: "inv-4",
      movement_type: "production_in",
      quantity: 320,
      balance_after: 720,
      notes: "Recycling cycle output",
      created_at: new Date(now - 86400000).toISOString(),
    },
    {
      organization_id: APP_CONFIG.orgId,
      factory_id: FACTORY_IDS.recycling,
      item_id: "inv-10",
      movement_type: "damage_return",
      quantity: 45,
      balance_after: 180,
      notes: "Processing waste returned to raw stock",
      created_at: new Date(now - 21600000).toISOString(),
    },
  ];

  return samples.map((s, i) => ({
    ...s,
    id: `mov-seed-${i}`,
    item: items.find((it) => it.id === s.item_id),
  }));
}
