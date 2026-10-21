import {
  BLOCK_YIELDS,
  analyzeWaste,
  calculateMaterialConsumption,
  predictProductionOutcome,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { fetchBlockFactoryDashboardFromSupabase } from "@/lib/services/block-factory-dashboard-supabase";
import type { ProductionBatch } from "@/types";

export type BlockInventorySnapshot = {
  cement: { bags: number; kg: number; lowStock: boolean };
  poliche: { loads: number; lowStock: boolean };
  finishedBySize: Record<BlockSizeCm, { blocks: number; lowStock: boolean }>;
  spareParts: { items: number; totalUnits: number; lowStockCount: number };
  wipCuring: number;
  wasteBlocks: number;
};

export type BlockFactoryDashboardData = {
  inventory: BlockInventorySnapshot;
  production: {
    activeBatches: number;
    todayOutput: number;
    avgYieldRate: number;
    avgDamageRate: number;
  };
  sales: {
    periodRevenue: number;
    activeOrders: number;
    pickedValue: number;
  };
  customers: {
    totalCreditBalance: number;
    topDebtors: Array<{ name: string; balance: number; pendingPickup: number }>;
  };
  finance: {
    revenue: number;
    expenses: number;
    collections: number;
    supplierPayments: number;
    cashFlow: number;
    netProfit: number;
    outstandingBalance: number;
  };
  batches: Array<
    ProductionBatch & {
      blockLabel: string;
      produced: number;
      available: number;
      wasteAnalysis?: ReturnType<typeof analyzeWaste>;
    }
  >;
  lowStockAlerts: Array<{ sku: string; name: string; quantity: number; threshold: number }>;
};

export async function fetchBlockFactoryDashboard(
  orgId: string,
  dateFrom: string,
  dateTo: string
): Promise<BlockFactoryDashboardData> {
  return fetchBlockFactoryDashboardFromSupabase(orgId, dateFrom, dateTo);
}

export { calculateMaterialConsumption, predictProductionOutcome, analyzeWaste, BLOCK_YIELDS, BLOCK_FACTORY_SKUS };
