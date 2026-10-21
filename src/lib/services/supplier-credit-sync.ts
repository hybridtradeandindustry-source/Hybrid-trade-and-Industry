import { createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { purchaseCreditAmount, splitPurchasePayment } from "@/lib/purchasing/credit-utils";
import type { PaymentMethod, PurchasePaymentMethod, PurchasePaymentStatus } from "@/types";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export { purchaseCreditAmount, splitPurchasePayment };

export async function adjustSupplierBalance(
  supabase: ServiceClient,
  supplierId: string,
  delta: number
): Promise<void> {
  if (!delta) return;

  const { data: supplier, error: fetchError } = await supabase
    .from("suppliers")
    .select("id, balance")
    .eq("id", supplierId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!supplier) throw new Error("Supplier not found");

  const nextBalance = Math.max(0, Number(supplier.balance) + delta);

  const { error: updateError } = await supabase
    .from("suppliers")
    .update({ balance: nextBalance })
    .eq("id", supplierId);

  if (updateError) throw new Error(updateError.message);
}

export async function recordSupplierPayment(
  input: {
    supplier_id: string;
    amount: number;
    payment_method: PaymentMethod;
    bank_account_id?: string;
    payment_date?: string;
    reference?: string;
    notes?: string;
    purchase_id?: string;
    /** When false, logs payment without reducing balance (deposit at receive). */
    affects_balance?: boolean;
  },
  user: ApiUser
) {
  if (input.amount <= 0) throw new Error("Payment amount must be greater than zero");
  const { assertBankAccountRequired, resolveBankAccount } = await import("@/lib/services/banks");
  assertBankAccountRequired(input.payment_method, input.bank_account_id, "Select the bank account used for this payment");
  const resolvedBank =
    input.payment_method === "bank" && input.bank_account_id
      ? await resolveBankAccount(input.bank_account_id, user.organization_id)
      : null;

  const supabase = await createServiceClient();

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("id, balance")
    .eq("id", input.supplier_id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (supplierError) throw new Error(supplierError.message);
  if (!supplier) throw new Error("Supplier not found");

  const { data, error } = await supabase
    .from("supplier_payments")
    .insert({
      organization_id: user.organization_id,
      supplier_id: input.supplier_id,
      purchase_id: input.purchase_id ?? null,
      amount: input.amount,
      payment_method: input.payment_method,
      bank_id: resolvedBank?.bank_id ?? null,
      bank_account_id: resolvedBank?.bank_account_id ?? null,
      payment_date: input.payment_date ?? new Date().toISOString().slice(0, 10),
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: user.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (input.affects_balance !== false) {
    await adjustSupplierBalance(supabase, input.supplier_id, -input.amount);
  }

  return {
    ...data,
    amount: Number(data.amount),
  };
}

export async function fetchSupplierPayments(orgId: string, supplierId?: string) {
  const supabase = await createServiceClient();
  let query = supabase
    .from("supplier_payments")
    .select(
      "*, banks(*), bank_accounts(*, banks(*)), supplier:suppliers(name), purchase:material_purchases(purchase_number)"
    )
    .eq("organization_id", orgId)
    .order("payment_date", { ascending: false });
  if (supplierId) query = query.eq("supplier_id", supplierId);
  const { data, error } = await query;

  if (error) {
    if (error.message.includes("supplier_payments")) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    bank: (row.banks as import("@/types").Bank | null) ?? null,
    banks: undefined,
    bank_account: (row.bank_accounts as import("@/types").BankAccount | null) ?? null,
    bank_accounts: undefined,
    supplier_name: (row.supplier as { name?: string } | null)?.name ?? null,
    supplier: undefined,
    purchase_number: (row.purchase as { purchase_number?: string } | null)?.purchase_number ?? null,
    purchase: undefined,
  }));
}

export function resolveReceivePayment(
  totalCost: number,
  input: {
    amount_paid?: number;
    pay_method?: PaymentMethod;
  }
): {
  paymentMethod: PurchasePaymentMethod;
  amountPaid: number;
  creditAmount: number;
  paymentStatus: PurchasePaymentStatus;
  payMethod: PaymentMethod | null;
} {
  const { amountPaid, creditAmount, paymentStatus } = splitPurchasePayment(
    totalCost,
    Number(input.amount_paid ?? 0)
  );

  let paymentMethod: PurchasePaymentMethod = "credit";
  if (amountPaid >= totalCost) {
    paymentMethod = input.pay_method ?? "cash";
  }

  return {
    paymentMethod,
    amountPaid,
    creditAmount,
    paymentStatus,
    payMethod: amountPaid > 0 ? input.pay_method ?? "cash" : null,
  };
}
