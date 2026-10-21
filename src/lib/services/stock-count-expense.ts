import { createServiceClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

export type StockCountExpenseInput = {
  stockCountId: string;
  organizationId: string;
  factoryId: string;
  itemName: string;
  itemSku: string;
  itemUnit: string;
  systemQuantity: number;
  countedQuantity: number;
  variance: number;
  unitCost: number;
};

export type StockCountExpenseResult = {
  amount: number;
  posted: boolean;
  description?: string;
};

/**
 * When a cycle count is approved, book purchased inventory cost to COGS/expenses:
 * - Count down (e.g. 7 → 0): variance negative → expense increases (material was bought but is gone).
 * - Count up (e.g. -7 → 0 for poliche): variance positive → expense decreases (corrects over-consumption).
 *
 * Uses sage_transactions (transaction_type cogs) so Expense Analytics and finance stay in sync.
 */
export async function syncStockCountCogsExpense(
  input: StockCountExpenseInput
): Promise<StockCountExpenseResult> {
  if (input.variance === 0) {
    return { amount: 0, posted: false };
  }

  const unitCost = Number(input.unitCost) || 0;
  if (unitCost <= 0) {
    return { amount: 0, posted: false };
  }

  const costAmount = input.variance * unitCost;
  if (Math.abs(costAmount) < 0.005) {
    return { amount: 0, posted: false };
  }

  const service = await createServiceClient();

  await service
    .from("sage_transactions")
    .delete()
    .eq("organization_id", input.organizationId)
    .eq("reference", input.stockCountId)
    .eq("transaction_type", "cogs");

  const absQty = Math.abs(input.variance);
  const description =
    input.variance < 0
      ? `Cycle count — ${input.itemName} (${input.itemSku}): ${absQty} ${input.itemUnit} not found @ ${formatCurrency(unitCost)} each. System had ${input.systemQuantity}, counted ${input.countedQuantity}. Purchased cost expensed.`
      : `Cycle count — ${input.itemName} (${input.itemSku}): ${absQty} ${input.itemUnit} restored @ ${formatCurrency(unitCost)} each. System had ${input.systemQuantity}, counted ${input.countedQuantity}. Prior COGS reduced.`;

  const { error } = await service.from("sage_transactions").insert({
    organization_id: input.organizationId,
    factory_id: input.factoryId,
    sage_id: `COGS-STOCKCOUNT-${input.stockCountId.slice(0, 8)}-${Date.now()}`,
    transaction_date: new Date().toISOString().slice(0, 10),
    description,
    amount: costAmount,
    transaction_type: "cogs",
    reference: input.stockCountId,
  });

  if (error) throw new Error(error.message);

  return { amount: costAmount, posted: true, description };
}
