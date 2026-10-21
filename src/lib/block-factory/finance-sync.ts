import type { SageTransaction } from "@/types";
import { FACTORY_IDS } from "@/types";
import { v4 as uuidv4 } from "uuid";

export type FinanceEntryInput = {
  description: string;
  amount: number;
  transaction_type: "expense" | "revenue" | "cogs" | "inventory_value";
  factory_id?: string;
  reference_type?: string;
  reference_id?: string;
  transaction_date?: string;
};

type FinanceStore = {
  sageTransactions: SageTransaction[];
};

export function postFinanceEntry(
  store: FinanceStore,
  input: FinanceEntryInput,
  orgId: string
): SageTransaction {
  const tx: SageTransaction = {
    id: uuidv4(),
    organization_id: orgId,
    sage_id: `AUTO-${Date.now()}`,
    transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
    description: input.description,
    amount: input.amount,
    transaction_type: input.transaction_type,
    factory_id: input.factory_id ?? FACTORY_IDS.block,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
  };
  store.sageTransactions.unshift(tx);
  return tx;
}

export function postProductionCogs(
  store: FinanceStore,
  input: {
    batchNumber: string;
    batchId: string;
    cementCost: number;
    policheCost: number;
    orgId: string;
  }
): void {
  const total = input.cementCost + input.policheCost;
  if (total <= 0) return;

  postFinanceEntry(
    store,
    {
      description: `Production COGS — ${input.batchNumber} (cement + poliche)`,
      amount: -total,
      transaction_type: "cogs",
      factory_id: FACTORY_IDS.block,
      reference_type: "production_batches",
      reference_id: input.batchId,
    },
    input.orgId
  );
}

export function postPurchaseExpense(
  store: FinanceStore,
  input: {
    purchaseNumber: string;
    purchaseId: string;
    supplierName: string;
    materialLabel: string;
    totalCost: number;
    orgId: string;
  }
): void {
  if (input.totalCost <= 0) return;

  postFinanceEntry(
    store,
    {
      description: `${input.materialLabel} purchase — ${input.supplierName} (${input.purchaseNumber})`,
      amount: -input.totalCost,
      transaction_type: "expense",
      factory_id: FACTORY_IDS.block,
      reference_type: "material_purchases",
      reference_id: input.purchaseId,
    },
    input.orgId
  );
}

export function computeMaterialCost(
  items: Array<{ id: string; unit_cost?: number | null }>,
  itemId: string,
  quantity: number
): number {
  const item = items.find((i) => i.id === itemId);
  return Number((item?.unit_cost ?? 0) * quantity);
}
