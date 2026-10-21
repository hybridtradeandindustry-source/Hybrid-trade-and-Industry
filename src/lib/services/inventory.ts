import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { BLOCK_SIZE_OPTIONS, finishedGoodsSku } from "@/lib/block-factory/yields";
import { syncStockCountCogsExpense } from "@/lib/services/stock-count-expense";
import type { InventoryItem, StockCount } from "@/types";

type InventoryItemInput = {
  factory_id: string;
  name: string;
  sku: string;
  item_type_id?: string | null;
  category_id?: string | null;
  category?: "raw_material" | "work_in_process" | "finished_goods";
  unit: string;
  quantity?: number;
  reserved_quantity?: number;
  low_stock_threshold?: number;
  reorder_quantity?: number;
  max_stock_level?: number | null;
  unit_cost?: number;
  supplier?: string | null;
  location?: string | null;
};

export async function insertInventoryItem(
  input: InventoryItemInput,
  user: ApiUser
): Promise<InventoryItem> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id,
      name: input.name,
      sku: input.sku,
      item_type_id: input.item_type_id ?? null,
      category_id: input.category_id ?? null,
      category: input.category ?? "raw_material",
      unit: input.unit,
      quantity: input.quantity ?? 0,
      reserved_quantity: input.reserved_quantity ?? 0,
      low_stock_threshold: input.low_stock_threshold ?? 0,
      reorder_quantity: input.reorder_quantity ?? 0,
      max_stock_level: input.max_stock_level ?? null,
      unit_cost: input.unit_cost ?? 0,
      supplier: input.supplier ?? null,
      location: input.location ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryItem;
}

export async function updateInventoryItemRecord(
  id: string,
  input: Partial<InventoryItemInput> & { is_active?: boolean },
  user: ApiUser
): Promise<InventoryItem | null> {
  const supabase = await createClient();
  const fields: (keyof typeof input)[] = [
    "factory_id",
    "name",
    "sku",
    "item_type_id",
    "category_id",
    "category",
    "unit",
    "quantity",
    "reserved_quantity",
    "low_stock_threshold",
    "reorder_quantity",
    "max_stock_level",
    "unit_cost",
    "supplier",
    "location",
    "is_active",
  ];
  const update: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in input) update[field] = input[field];
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update(update)
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  if ("unit_cost" in update && data) {
    const { BLOCK_FACTORY_SKUS } = await import("@/lib/block-factory/inventory-sync");
    if (data.sku === BLOCK_FACTORY_SKUS.cement || data.sku === BLOCK_FACTORY_SKUS.poliche) {
      const { recalculateDailyLogWasteCosts } = await import(
        "@/lib/services/production-daily-log"
      );
      await recalculateDailyLogWasteCosts(user.organization_id);
    }
  }

  return (data as InventoryItem | null) ?? null;
}

/**
 * SKUs the block factory resolves by name rather than by id — deactivating one doesn't
 * remove a row, it makes every lookup for it come back empty, and the callers treat that
 * as "nothing to do" instead of an error. That has silently broken purchasing, daily-log
 * consumption and order creation before. Derived from the constants so the list can't
 * drift from the code that depends on it.
 */
const SYSTEM_CRITICAL_SKUS: ReadonlyMap<string, string> = new Map([
  [BLOCK_FACTORY_SKUS.cement, "cement purchases and daily-log consumption"],
  [BLOCK_FACTORY_SKUS.poliche, "poliche purchases and daily-log consumption"],
  [BLOCK_FACTORY_SKUS.wip, "work-in-process postings during production"],
  [BLOCK_FACTORY_SKUS.waste, "production waste postings"],
  ...BLOCK_SIZE_OPTIONS.map(
    (option) =>
      [
        finishedGoodsSku(option.value),
        `selling ${option.label} blocks — order lines resolve this SKU from the chosen batch`,
      ] as const
  ),
]);

export async function deactivateInventoryItem(id: string, user: ApiUser): Promise<boolean> {
  const supabase = await createClient();

  const { data: item } = await supabase
    .from("inventory_items")
    .select("sku, name")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  const dependency = item ? SYSTEM_CRITICAL_SKUS.get(item.sku) : undefined;
  if (item && dependency) {
    throw new Error(
      `"${item.name}" (${item.sku}) can't be deleted — the system looks it up by SKU for ${dependency}. Deleting it breaks that silently. Set its stock to zero instead if you no longer hold any.`
    );
  }

  const { error } = await supabase
    .from("inventory_items")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
  return true;
}

type StockCountRow = {
  id: string;
  organization_id: string;
  factory_id: string;
  item_id: string;
  system_quantity: number;
  counted_quantity: number;
  status?: string;
};

/**
 * Apply inventory movement + COGS expense when a stock count is approved.
 * Idempotent — skips duplicate movements/expenses for the same count.
 */
export async function executeStockCountApproval(
  stockCount: StockCountRow,
  user: ApiUser
): Promise<{ expensePosted: boolean; expenseAmount: number }> {
  const supabase = await createClient();
  const variance =
    Number(stockCount.counted_quantity) - Number(stockCount.system_quantity);

  if (variance !== 0) {
    const { data: existingMovement } = await supabase
      .from("inventory_movements")
      .select("id")
      .eq("organization_id", user.organization_id)
      .eq("reference_type", "stock_counts")
      .eq("reference_id", stockCount.id)
      .maybeSingle();

    if (!existingMovement) {
      const { error: movementError } = await supabase.from("inventory_movements").insert({
        organization_id: user.organization_id,
        factory_id: stockCount.factory_id,
        item_id: stockCount.item_id,
        movement_type: "stock_count",
        quantity: variance,
        reference_type: "stock_counts",
        reference_id: stockCount.id,
        notes: "Stock count adjustment",
        source_module: "stock_count",
        created_by: user.id,
      });
      if (movementError) throw new Error(movementError.message);
    }
  }

  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select("name, sku, unit, unit_cost")
    .eq("id", stockCount.item_id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (itemError) throw new Error(itemError.message);

  const expense = await syncStockCountCogsExpense({
    stockCountId: stockCount.id,
    organizationId: user.organization_id,
    factoryId: stockCount.factory_id,
    itemName: (item?.name as string) ?? "Inventory item",
    itemSku: (item?.sku as string) ?? "—",
    itemUnit: (item?.unit as string) ?? "units",
    systemQuantity: Number(stockCount.system_quantity),
    countedQuantity: Number(stockCount.counted_quantity),
    variance,
    unitCost: Number(item?.unit_cost ?? 0),
  });

  return { expensePosted: expense.posted, expenseAmount: expense.amount };
}

export type StockCountReviewResult = StockCount & {
  expensePosted?: boolean;
  expenseAmount?: number;
};

export async function reviewStockCountRecord(
  id: string,
  status: "approved" | "rejected",
  user: ApiUser
): Promise<StockCountReviewResult | null> {
  const supabase = await createClient();

  const { data: stockCount, error: fetchError } = await supabase
    .from("stock_counts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!stockCount) return null;
  if (stockCount.status !== "pending_review") {
    throw new Error("This count was already reviewed");
  }

  const { data, error } = await supabase
    .from("stock_counts")
    .update({
      status,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*, inventory_items(*)")
    .single();

  if (error) throw new Error(error.message);

  if (status === "approved") {
    const expenseResult = await executeStockCountApproval(stockCount as StockCountRow, user);
    return {
      ...(data as StockCount),
      expensePosted: expenseResult.expensePosted,
      expenseAmount: expenseResult.expenseAmount,
    };
  }

  return data as StockCountReviewResult;
}
