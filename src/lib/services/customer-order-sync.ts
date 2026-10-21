import { createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { orderCreditAmount } from "@/types";
import type { OrderStatus, PaymentMethod } from "@/types";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

const OPEN_ORDER_STATUSES: OrderStatus[] = ["ordered"];

export async function adjustCustomerBalance(
  supabase: ServiceClient,
  customerId: string,
  delta: number
): Promise<void> {
  if (!delta) return;

  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("id, balance")
    .eq("id", customerId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!customer) throw new Error("Customer not found");

  const nextBalance = Math.max(0, Number(customer.balance) + delta);

  const { error: updateError } = await supabase
    .from("customers")
    .update({ balance: nextBalance })
    .eq("id", customerId);

  if (updateError) throw new Error(updateError.message);
}

/** On pick, unpaid portion (total − amount_paid) is added to customer balance. */
export async function applyCustomerOrderSideEffects(
  customerId: string,
  previousStatus: OrderStatus,
  nextStatus: OrderStatus,
  order: { total_amount: number; amount_paid?: number | null }
): Promise<void> {
  const creditAmount = orderCreditAmount(order);
  if (!customerId || creditAmount <= 0) return;

  const supabase = await createServiceClient();

  if (previousStatus !== "picked" && nextStatus === "picked") {
    await adjustCustomerBalance(supabase, customerId, creditAmount);
    return;
  }

  if (previousStatus === "picked" && nextStatus === "cancelled") {
    await adjustCustomerBalance(supabase, customerId, -creditAmount);
  }
}

export async function countOpenOrdersForCustomer(
  supabase: ServiceClient,
  customerId: string,
  orgId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .in("status", OPEN_ORDER_STATUSES);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export function aggregateCustomerOrderStats(
  orders: Array<{
    customer_id: string;
    status: OrderStatus;
    total_amount: number;
    amount_paid?: number | null;
  }>
) {
  const byCustomer = new Map<
    string,
    {
      order_count: number;
      pipeline_value: number;
      picked_value: number;
      pending_order_credit: number;
    }
  >();

  for (const order of orders) {
    const stats = byCustomer.get(order.customer_id) ?? {
      order_count: 0,
      pipeline_value: 0,
      picked_value: 0,
      pending_order_credit: 0,
    };

    stats.order_count += 1;

    if (order.status === "cancelled") {
      byCustomer.set(order.customer_id, stats);
      continue;
    }

    if (order.status === "picked") {
      stats.picked_value += Number(order.total_amount);
    } else if (order.status === "ordered") {
      stats.pipeline_value += Number(order.total_amount);
      stats.pending_order_credit += orderCreditAmount(order);
    }

    byCustomer.set(order.customer_id, stats);
  }

  return byCustomer;
}

/** Sums only actual payments — excludes refund/store_credit_issue/store_credit_apply ledger rows. */
export function aggregateCustomerPayments(
  payments: Array<{ customer_id: string; amount: number; kind?: string | null }>
) {
  const byCustomer = new Map<string, number>();
  for (const payment of payments) {
    if (payment.kind && payment.kind !== "payment") continue;
    byCustomer.set(
      payment.customer_id,
      (byCustomer.get(payment.customer_id) ?? 0) + Number(payment.amount)
    );
  }
  return byCustomer;
}

/** Sums only refund ledger rows (cash refunds issued for cancelled paid orders). */
export function aggregateCustomerRefunds(
  payments: Array<{ customer_id: string; amount: number; kind?: string | null }>
) {
  const byCustomer = new Map<string, number>();
  for (const payment of payments) {
    if (payment.kind !== "refund") continue;
    byCustomer.set(
      payment.customer_id,
      (byCustomer.get(payment.customer_id) ?? 0) + Number(payment.amount)
    );
  }
  return byCustomer;
}

export async function recordCustomerPayment(
  input: {
    customer_id: string;
    amount: number;
    payment_method: PaymentMethod;
    bank_account_id?: string;
    payment_date?: string;
    reference?: string;
    notes?: string;
    order_id?: string;
    /** When false, logs payment without reducing balance (order deposit at creation). */
    affects_balance?: boolean;
  },
  user: ApiUser
) {
  if (input.amount <= 0) throw new Error("Payment amount must be greater than zero");
  const { assertBankAccountRequired, resolveBankAccount } = await import("@/lib/services/banks");
  assertBankAccountRequired(input.payment_method, input.bank_account_id);
  const resolvedBank =
    input.payment_method === "bank" && input.bank_account_id
      ? await resolveBankAccount(input.bank_account_id, user.organization_id)
      : null;

  const supabase = await createServiceClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, balance")
    .eq("id", input.customer_id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (customerError) throw new Error(customerError.message);
  if (!customer) throw new Error("Customer not found");

  const { data, error } = await supabase
    .from("customer_payments")
    .insert({
      organization_id: user.organization_id,
      customer_id: input.customer_id,
      order_id: input.order_id ?? null,
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
    await adjustCustomerBalance(supabase, input.customer_id, -input.amount);
  }

  return {
    ...data,
    amount: Number(data.amount),
  };
}

async function adjustStoreCreditBalance(
  supabase: ServiceClient,
  customerId: string,
  delta: number
): Promise<void> {
  const { data: customer, error: fetchError } = await supabase
    .from("customers")
    .select("id, store_credit_balance")
    .eq("id", customerId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!customer) throw new Error("Customer not found");

  const next = Math.max(0, Number(customer.store_credit_balance ?? 0) + delta);

  const { error: updateError } = await supabase
    .from("customers")
    .update({ store_credit_balance: next })
    .eq("id", customerId);

  if (updateError) throw new Error(updateError.message);
}

/** Spend store credit toward a new order's payment — decrements the wallet, logs the ledger entry. */
export async function applyStoreCreditToOrder(
  customerId: string,
  orderId: string,
  orderNumber: string,
  amount: number,
  user: ApiUser
): Promise<void> {
  if (amount <= 0) return;
  const supabase = await createServiceClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("store_credit_balance")
    .eq("id", customerId)
    .maybeSingle();
  const available = Number(customer?.store_credit_balance ?? 0);
  if (amount > available) {
    throw new Error("Store credit applied exceeds the customer's available balance");
  }

  await adjustStoreCreditBalance(supabase, customerId, -amount);

  const { error } = await supabase.from("customer_payments").insert({
    organization_id: user.organization_id,
    customer_id: customerId,
    order_id: orderId,
    amount,
    payment_method: "cash",
    kind: "store_credit_apply",
    payment_date: new Date().toISOString().slice(0, 10),
    notes: `Store credit applied at order ${orderNumber}`,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
}

/**
 * Settle a paid, never-picked-up order's payment on cancel: split it between a cash refund
 * (bookkeeping only), paying down the customer's existing balance from other orders, and/or
 * store credit (added to the wallet). The refund and store-credit portions never touch
 * customers.balance — an 'ordered' order never incremented it in the first place — but the
 * balance-payment portion does, exactly like a normal payment against the customer's account.
 */
export async function issueOrderRefundSettlement(
  customerId: string,
  orderId: string,
  orderNumber: string,
  settlement: { refundAmount: number; creditAmount: number; balancePaymentAmount: number },
  user: ApiUser
): Promise<void> {
  const supabase = await createServiceClient();
  const paymentDate = new Date().toISOString().slice(0, 10);

  if (settlement.refundAmount > 0) {
    const { error } = await supabase.from("customer_payments").insert({
      organization_id: user.organization_id,
      customer_id: customerId,
      order_id: orderId,
      amount: settlement.refundAmount,
      payment_method: "cash",
      kind: "refund",
      payment_date: paymentDate,
      notes: `Refund for cancelled order ${orderNumber}`,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
  }

  if (settlement.balancePaymentAmount > 0) {
    await adjustCustomerBalance(supabase, customerId, -settlement.balancePaymentAmount);

    const { error } = await supabase.from("customer_payments").insert({
      organization_id: user.organization_id,
      customer_id: customerId,
      order_id: orderId,
      amount: settlement.balancePaymentAmount,
      payment_method: "cash",
      kind: "payment",
      payment_date: paymentDate,
      notes: `Applied to previous balance from cancelled order ${orderNumber}`,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
  }

  if (settlement.creditAmount > 0) {
    await adjustStoreCreditBalance(supabase, customerId, settlement.creditAmount);

    const { error } = await supabase.from("customer_payments").insert({
      organization_id: user.organization_id,
      customer_id: customerId,
      order_id: orderId,
      amount: settlement.creditAmount,
      payment_method: "cash",
      kind: "store_credit_issue",
      payment_date: paymentDate,
      notes: `Store credit issued for cancelled order ${orderNumber}`,
      created_by: user.id,
    });
    if (error) throw new Error(error.message);
  }
}

export async function fetchCustomerPayments(
  customerId: string,
  orgId: string
) {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("customer_payments")
    .select("*, banks(*), bank_accounts(*, banks(*))")
    .eq("organization_id", orgId)
    .eq("customer_id", customerId)
    .order("payment_date", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    ...row,
    amount: Number(row.amount),
    bank: (row.banks as import("@/types").Bank | null) ?? null,
    banks: undefined,
    bank_account: (row.bank_accounts as import("@/types").BankAccount | null) ?? null,
    bank_accounts: undefined,
  }));
}
