import { convertCementWeight } from "@/lib/calculator/engine";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import type { MaterialPurchaseType } from "@/types";

export function isCementPurchase(
  materialType: MaterialPurchaseType | string,
  itemSku?: string | null
): boolean {
  return materialType === "cement" || itemSku === BLOCK_FACTORY_SKUS.cement;
}

/**
 * Converts a purchase-line quantity to inventory stock units.
 * Cement inventory is always tracked in bags; kg purchases are divided by kg-per-bag.
 */
export function purchaseQuantityToStockUnits(
  quantity: number,
  unit: string,
  materialType: MaterialPurchaseType | string,
  itemSku: string | null | undefined,
  cementKgPerBag: number
): number {
  if (!isCementPurchase(materialType, itemSku)) return quantity;
  if (unit === "kg") {
    if (!(cementKgPerBag > 0)) {
      throw new Error("Cement kg per bag must be configured before purchasing cement in kg");
    }
    return convertCementWeight(quantity, "kg", "bags", cementKgPerBag);
  }
  return quantity;
}
