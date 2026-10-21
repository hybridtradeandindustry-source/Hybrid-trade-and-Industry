import { createClient } from "@/lib/supabase/server";
import { fetchSupplierPayments } from "@/lib/services/supplier-credit-sync";
import type { MaterialPurchase, Supplier, SupplierPayment, SupplierType } from "@/types";

export type SupplierDetail = {
  supplier: Supplier;
  purchases: MaterialPurchase[];
  payments: SupplierPayment[];
};

export async function getSupplierDetail(id: string, orgId: string): Promise<SupplierDetail> {
  const supabase = await createClient();

  const { data: supplierRow, error: supplierError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (supplierError || !supplierRow) throw new Error("Supplier not found");

  const { data: purchaseRows, error: purchasesError } = await supabase
    .from("material_purchases")
    .select("*, item:inventory_items(*)")
    .eq("organization_id", orgId)
    .eq("supplier_id", id)
    .order("purchase_date", { ascending: false });

  if (purchasesError) throw new Error(purchasesError.message);

  const payments = await fetchSupplierPayments(orgId, id);

  const supplierBase = supplierRow as unknown as Supplier;
  const supplier: Supplier = {
    ...supplierBase,
    supplier_type: (supplierBase.supplier_type ?? "credit") as SupplierType,
    balance: Number(supplierBase.balance ?? 0),
    total_purchases: Number(supplierBase.total_purchases ?? 0),
  };

  return {
    supplier,
    purchases: (purchaseRows ?? []) as MaterialPurchase[],
    payments: payments as unknown as SupplierPayment[],
  };
}
