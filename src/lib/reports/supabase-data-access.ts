import { createClient } from "@/lib/supabase/server";
import { FACTORY_IDS, type ViewScope } from "@/types";
import type {
  Customer,
  HrDepartment,
  HrPosition,
  InventoryItem,
  ProductionBatch,
  ProductionCount,
  SageTransaction,
  ReconciliationRecord,
} from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

export async function fetchProductionReportData(scope: ViewScope, orgId: string) {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  let batchesQuery = supabase.from("production_batches").select("*").eq("organization_id", orgId);
  let countsQuery = supabase.from("production_counts").select("*").eq("organization_id", orgId);
  if (factoryId) {
    batchesQuery = batchesQuery.eq("factory_id", factoryId);
    countsQuery = countsQuery.eq("factory_id", factoryId);
  }

  const [{ data: batches }, { data: counts }] = await Promise.all([batchesQuery, countsQuery]);
  return {
    batches: (batches ?? []) as ProductionBatch[],
    counts: (counts ?? []) as ProductionCount[],
  };
}

export async function fetchInventoryReportData(scope: ViewScope, orgId: string) {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  let query = supabase.from("inventory_items").select("*").eq("organization_id", orgId).eq("is_active", true);
  if (factoryId) query = query.eq("factory_id", factoryId);
  const { data: items } = await query;

  let movQuery = supabase.from("inventory_movements").select("*").eq("organization_id", orgId);
  if (factoryId) movQuery = movQuery.eq("factory_id", factoryId);
  const { data: movements } = await movQuery.order("created_at", { ascending: false }).limit(500);

  const { data: itemTypes } = await supabase
    .from("inventory_item_types")
    .select("*")
    .eq("organization_id", orgId);
  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("*")
    .eq("organization_id", orgId);

  return {
    items: (items ?? []) as InventoryItem[],
    movements: movements ?? [],
    itemTypes: itemTypes ?? [],
    categories: categories ?? [],
  };
}

export async function fetchOrdersReportData(scope: ViewScope, orgId: string) {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);
  let query = supabase.from("orders").select("*, customers(name, phone, email)").eq("organization_id", orgId);
  if (factoryId) query = query.eq("factory_id", factoryId);
  const { data: orders } = await query;
  const { data: customers } = await supabase.from("customers").select("*").eq("organization_id", orgId);
  return { orders: orders ?? [], customers: (customers ?? []) as Customer[] };
}

export async function fetchFinanceExtras(orgId: string, scope: ViewScope) {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);
  let txQuery = supabase.from("sage_transactions").select("*").eq("organization_id", orgId);
  let recQuery = supabase.from("reconciliation_records").select("*").eq("organization_id", orgId);
  if (factoryId) {
    txQuery = txQuery.eq("factory_id", factoryId);
    recQuery = recQuery.eq("factory_id", factoryId);
  }
  const [{ data: transactions }, { data: reconciliation }] = await Promise.all([txQuery, recQuery]);
  return {
    transactions: (transactions ?? []) as SageTransaction[],
    reconciliation: (reconciliation ?? []) as ReconciliationRecord[],
  };
}

export async function fetchHrReportData(scope: ViewScope, orgId: string) {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);
  let empQuery = supabase.from("employees").select("*").eq("organization_id", orgId);
  if (factoryId) empQuery = empQuery.eq("factory_id", factoryId);
  const [{ data: employees }, { data: departments }, { data: positions }, { data: leaveRequests }, { data: attendance }] =
    await Promise.all([
      empQuery,
      supabase.from("hr_departments").select("*").eq("organization_id", orgId),
      supabase.from("hr_positions").select("*").eq("organization_id", orgId),
      supabase.from("leave_requests").select("*").eq("organization_id", orgId),
      supabase.from("attendance_records").select("*").eq("organization_id", orgId),
    ]);
  return {
    employees: employees ?? [],
    departments: (departments ?? []) as HrDepartment[],
    positions: (positions ?? []) as HrPosition[],
    leaveRequests: leaveRequests ?? [],
    attendance: attendance ?? [],
  };
}

export async function fetchDocumentsReportData(orgId: string) {
  const supabase = await createClient();
  const { data: documents } = await supabase.from("documents").select("*").eq("organization_id", orgId);
  return { documents: documents ?? [] };
}
