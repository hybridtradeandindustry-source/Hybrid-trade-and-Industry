import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { BLOCK_YIELDS, CEMENT_KG_PER_BAG, type BlockSizeCm } from "@/lib/block-factory/yields";

type ItemRow = {
  id: string;
  sku: string;
  name?: string;
  quantity: number;
  low_stock_threshold?: number;
  unit?: string;
};

type MovementRow = {
  item_id: string;
  quantity: number;
  movement_type: string;
  reason?: string | null;
};

export type StockLine = {
  onHand: number;
  used: number;
  received: number;
  unit: string;
  lowStock: boolean;
  label: string;
};

export type BlockStockView = {
  cement: StockLine & { kg: number };
  poliche: StockLine;
  finishedBySize: Record<
    BlockSizeCm,
    { onHand: number; produced: number; sold: number; unit: string; lowStock: boolean; label: string }
  >;
  wip: StockLine & { label: string };
  waste: { onHand: number; unit: string; label: string };
  spareParts: { items: number; totalUnits: number };
  totalFinishedBlocks: number;
};

function fgSku(size: BlockSizeCm): string {
  return `BLK-FG-${BLOCK_YIELDS[size].skuSuffix}`;
}

function itemBySku(items: ItemRow[], sku: string): ItemRow | undefined {
  return items.find((i) => i.sku === sku);
}

function sumMovements(
  movements: MovementRow[],
  itemId: string,
  predicate: (m: MovementRow) => boolean
): number {
  return movements
    .filter((m) => m.item_id === itemId && predicate(m))
    .reduce((sum, m) => sum + Math.abs(Number(m.quantity)), 0);
}

function stockLine(
  item: ItemRow | undefined,
  movements: MovementRow[],
  label: string,
  defaultUnit: string
): StockLine {
  const onHand = Number(item?.quantity ?? 0);
  const threshold = Number(item?.low_stock_threshold ?? 0);
  const itemId = item?.id;

  const used =
    itemId != null
      ? sumMovements(
          movements,
          itemId,
          (m) =>
            Number(m.quantity) < 0 &&
            (m.reason === "production_consumption" ||
              m.movement_type === "production_out" ||
              m.movement_type === "issue" ||
              m.movement_type === "sale")
        )
      : 0;

  const received =
    itemId != null
      ? sumMovements(
          movements,
          itemId,
          (m) =>
            Number(m.quantity) > 0 &&
            (m.reason === "purchase_receipt" ||
              m.reason === "opening_stock" ||
              m.movement_type === "receipt" ||
              m.movement_type === "production_in")
        )
      : 0;

  return {
    onHand,
    used,
    received,
    unit: item?.unit ?? defaultUnit,
    lowStock: item != null && threshold > 0 && onHand <= threshold,
    label,
  };
}

export function buildBlockStockView(
  items: ItemRow[],
  movements: MovementRow[],
  cementKgPerBag: number = CEMENT_KG_PER_BAG
): BlockStockView {
  const cementItem = itemBySku(items, BLOCK_FACTORY_SKUS.cement);
  const policheItem = itemBySku(items, BLOCK_FACTORY_SKUS.poliche);
  const wipItem = itemBySku(items, BLOCK_FACTORY_SKUS.wip);
  const wasteItem = itemBySku(items, BLOCK_FACTORY_SKUS.waste);
  const spareParts = items.filter((i) => i.sku.startsWith("BLK-SP-"));

  const cement = stockLine(cementItem, movements, "Cement", "bags");
  const poliche = stockLine(policheItem, movements, "Poliche", "loads");

  const wipOnHand = Number(wipItem?.quantity ?? 0);
  const wipUsed =
    wipItem != null
      ? sumMovements(
          movements,
          wipItem.id,
          (m) => Number(m.quantity) < 0 && m.reason === "curing_complete"
        )
      : 0;
  const wipReceived =
    wipItem != null
      ? sumMovements(
          movements,
          wipItem.id,
          (m) => Number(m.quantity) > 0 && m.reason === "wip_intake"
        )
      : 0;

  const finishedBySize = {} as BlockStockView["finishedBySize"];
  let totalFinishedBlocks = 0;

  for (const size of [20, 15, 10, 24] as BlockSizeCm[]) {
    const item = itemBySku(items, fgSku(size));
    const onHand = Number(item?.quantity ?? 0);
    totalFinishedBlocks += onHand;

    const produced =
      item != null
        ? sumMovements(
            movements,
            item.id,
            (m) => Number(m.quantity) > 0 && m.reason === "finished_goods"
          )
        : 0;

    const sold =
      item != null
        ? sumMovements(
            movements,
            item.id,
            (m) => Number(m.quantity) < 0 && (m.movement_type === "sale" || m.movement_type === "issue")
          )
        : 0;

    finishedBySize[size] = {
      onHand,
      produced,
      sold,
      unit: "blocks",
      lowStock: item != null && onHand <= Number(item.low_stock_threshold ?? 0),
      label: BLOCK_YIELDS[size].label,
    };
  }

  return {
    cement: { ...cement, kg: cement.onHand * cementKgPerBag },
    poliche,
    finishedBySize,
    wip: {
      onHand: wipOnHand,
      used: wipUsed,
      received: wipReceived,
      unit: wipItem?.unit ?? "blocks",
      lowStock: wipItem != null && wipOnHand <= Number(wipItem.low_stock_threshold ?? 0),
      label: "In drying / curing",
    },
    waste: {
      onHand: Number(wasteItem?.quantity ?? 0),
      unit: wasteItem?.unit ?? "blocks",
      label: "Production waste",
    },
    spareParts: {
      items: spareParts.length,
      totalUnits: spareParts.reduce((s, i) => s + Number(i.quantity), 0),
    },
    totalFinishedBlocks,
  };
}

export const BLOCK_STOCK_SKUS = [
  BLOCK_FACTORY_SKUS.cement,
  BLOCK_FACTORY_SKUS.poliche,
  BLOCK_FACTORY_SKUS.wip,
  BLOCK_FACTORY_SKUS.waste,
  "BLK-FG-20",
  "BLK-FG-15",
  "BLK-FG-10",
  "BLK-FG-24",
] as const;

export function isBlockStockSku(sku: string): boolean {
  return (
    BLOCK_STOCK_SKUS.includes(sku as (typeof BLOCK_STOCK_SKUS)[number]) ||
    sku.startsWith("BLK-SP-")
  );
}
