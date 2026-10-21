import { createClient } from "@/lib/supabase/server";
import type { Bank, Customer, CustomerPayment, Order, SupplierPayment, ViewScope } from "@/types";
import { FACTORY_IDS } from "@/types";

export type FinanceReportData = {
  orders: Order[];
  customers: Customer[];
  payments: CustomerPayment[];
  supplierPayments: SupplierPayment[];
  banks: Bank[];
  transactions: import("@/types").SageTransaction[];
  reconciliation: import("@/types").ReconciliationRecord[];
};

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

export function filterOrdersByScope(orders: Order[], scope: ViewScope): Order[] {
  const factoryId = scopeFactoryId(scope);
  if (!factoryId) return orders;
  return orders.filter((o) => o.factory_id === factoryId);
}

function mapPaymentRow(
  row: Record<string, unknown>,
  banks: Bank[]
): CustomerPayment {
  const bankId = row.bank_id as string | null | undefined;
  return {
    ...(row as unknown as CustomerPayment),
    amount: Number(row.amount),
    bank_id: bankId ?? null,
    bank: bankId ? banks.find((b) => b.id === bankId) ?? null : null,
  };
}

export async function fetchFinanceReportData(
  scope: ViewScope,
  orgId?: string
): Promise<FinanceReportData> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  let ordersQuery = supabase.from("orders").select("*, customers(name, customer_type, phone, email)");
  if (orgId) ordersQuery = ordersQuery.eq("organization_id", orgId);
  if (factoryId) ordersQuery = ordersQuery.eq("factory_id", factoryId);
  const { data: orders } = await ordersQuery;

  let customersQuery = supabase.from("customers").select("*");
  if (orgId) customersQuery = customersQuery.eq("organization_id", orgId);
  const { data: customers } = await customersQuery;

  let banksQuery = supabase.from("banks").select("*").eq("is_active", true);
  if (orgId) banksQuery = banksQuery.eq("organization_id", orgId);
  const { data: banks } = await banksQuery;

  let paymentsQuery = supabase
    .from("customer_payments")
    .select("*, banks(id, name, code)");
  if (orgId) paymentsQuery = paymentsQuery.eq("organization_id", orgId);
  const { data: payments } = await paymentsQuery;

  let supplierPaymentsQuery = supabase
    .from("supplier_payments")
    .select("*, purchase:material_purchases(factory_id)");
  if (orgId) supplierPaymentsQuery = supplierPaymentsQuery.eq("organization_id", orgId);
  const { data: supplierPaymentRows } = await supplierPaymentsQuery;

  let txQuery = supabase.from("sage_transactions").select("*");
  if (orgId) txQuery = txQuery.eq("organization_id", orgId);
  if (factoryId) txQuery = txQuery.eq("factory_id", factoryId);
  const { data: transactions } = await txQuery;

  let recQuery = supabase.from("reconciliation_records").select("*");
  if (orgId) recQuery = recQuery.eq("organization_id", orgId);
  if (factoryId) recQuery = recQuery.eq("factory_id", factoryId);
  const { data: reconciliation } = await recQuery;

  const bankList = (banks ?? []) as Bank[];

  return {
    orders: ((orders ?? []) as Order[]).map((o) => ({
      ...o,
      total_amount: Number(o.total_amount),
      amount_paid: Number(o.amount_paid ?? 0),
      customer: (o as Order & { customers?: Customer }).customers ?? o.customer,
    })),
    customers: (customers ?? []) as Customer[],
    payments: (payments ?? []).map((row) =>
      mapPaymentRow(row as Record<string, unknown>, bankList)
    ),
    supplierPayments: (supplierPaymentRows ?? []).map((row) => ({
      ...(row as unknown as SupplierPayment),
      amount: Number(row.amount),
      purchase_factory_id:
        (row.purchase as { factory_id?: string | null } | null)?.factory_id ?? null,
    })),
    banks: bankList,
    transactions: (transactions ?? []) as import("@/types").SageTransaction[],
    reconciliation: (reconciliation ?? []) as import("@/types").ReconciliationRecord[],
  };
}
