import { createClient } from "@/lib/supabase/server";
import { FACTORY_IDS, type Customer, type CustomerPayment, type Order, type ViewScope } from "@/types";

export interface CreditInvoiceRow {
  order_id: string;
  order_number: string;
  customer_id: string;
  customer_name: string;
  credit_amount: number;
  amount_paid: number;
  remaining_balance: number;
  due_date: string | null;
  payment_status: "unpaid" | "partial" | "paid";
  is_overdue: boolean;
  last_payment_date: string | null;
}

export interface CreditDashboardData {
  invoices: CreditInvoiceRow[];
  totalOutstandingCredit: number;
  overdueCount: number;
  overdueAmount: number;
  customersWithBalance: { customer_id: string; customer_name: string; balance: number }[];
  recentlyPaid: CreditInvoiceRow[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Credit view scoped to the selected factory ("block" or "recycling"), or both
 * combined. Computed directly from order-level fields (total_amount/amount_paid,
 * both factory-scoped) plus the customer_payments ledger filtered by order_id —
 * deliberately avoids customers.balance, which is a shared pool across both
 * factories and can't be split by factory.
 */
export async function fetchCreditDashboard(
  orgId: string,
  scope: ViewScope = "combined"
): Promise<CreditDashboardData> {
  const supabase = await createClient();

  let ordersQuery = supabase
    .from("orders")
    .select("*, customers(*)")
    .eq("organization_id", orgId)
    .neq("status", "cancelled");

  if (scope === "block") {
    ordersQuery = ordersQuery.eq("factory_id", FACTORY_IDS.block);
  } else if (scope === "recycling") {
    ordersQuery = ordersQuery.eq("factory_id", FACTORY_IDS.recycling);
  }

  const { data: orderRows, error: orderError } = await ordersQuery.order("created_at", {
    ascending: false,
  });

  if (orderError) throw new Error(orderError.message);

  const orders = (orderRows ?? []) as (Order & { customers: Customer | null })[];
  const orderIds = orders.map((o) => o.id);

  let payments: CustomerPayment[] = [];
  if (orderIds.length > 0) {
    const { data: paymentRows, error: paymentError } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("organization_id", orgId)
      .in("order_id", orderIds)
      .order("payment_date", { ascending: false });
    if (paymentError) throw new Error(paymentError.message);
    payments = (paymentRows ?? []) as CustomerPayment[];
  }

  // Only real payments count as cash paid — refund/store_credit_issue move money the
  // other way, and store_credit_apply is spending an existing wallet balance (its amount
  // is already captured separately via order.store_credit_applied below), not new cash.
  const actualPayments = payments.filter((p) => !p.kind || p.kind === "payment");

  const paymentsByOrder = new Map<string, CustomerPayment[]>();
  for (const p of actualPayments) {
    if (!p.order_id) continue;
    const list = paymentsByOrder.get(p.order_id) ?? [];
    list.push(p);
    paymentsByOrder.set(p.order_id, list);
  }

  const todayStr = today();

  const invoices: CreditInvoiceRow[] = orders.map((order) => {
    const orderPayments = paymentsByOrder.get(order.id) ?? [];
    // The deposit at order creation is recorded in BOTH orders.amount_paid
    // AND as a customer_payments row tied to this order_id — orderPayments
    // already includes it, so use that sum instead of adding amount_paid on
    // top (which would double-count the same money). Only fall back to
    // amount_paid when no payment row exists (e.g. it was edited directly).
    const amountPaid =
      orderPayments.length > 0
        ? orderPayments.reduce((s, p) => s + Number(p.amount), 0)
        : Number(order.amount_paid ?? 0);
    // Withholding and store credit applied at order time settle part of the total without
    // being "cash paid" — they're snapshotted directly on the order, not the payment ledger.
    const effectivePaid =
      amountPaid + Number(order.withholding_amount ?? 0) + Number(order.store_credit_applied ?? 0);
    const remaining = Math.max(0, Number(order.total_amount) - effectivePaid);
    const dueDate = order.delivery_date ? order.delivery_date.slice(0, 10) : null;
    const lastPaymentDate = orderPayments[0]?.payment_date ?? null;

    return {
      order_id: order.id,
      order_number: order.order_number,
      customer_id: order.customer_id,
      customer_name: order.customers?.name ?? "—",
      credit_amount: Number(order.total_amount),
      amount_paid: amountPaid,
      remaining_balance: remaining,
      due_date: dueDate,
      payment_status: remaining <= 0 ? "paid" : amountPaid > 0 ? "partial" : "unpaid",
      is_overdue: remaining > 0 && !!dueDate && dueDate < todayStr,
      last_payment_date: lastPaymentDate,
    };
  });

  const outstanding = invoices.filter((i) => i.remaining_balance > 0);
  const overdue = outstanding.filter((i) => i.is_overdue);

  const balanceByCustomer = new Map<string, { customer_name: string; balance: number }>();
  for (const inv of outstanding) {
    const existing = balanceByCustomer.get(inv.customer_id) ?? {
      customer_name: inv.customer_name,
      balance: 0,
    };
    existing.balance += inv.remaining_balance;
    balanceByCustomer.set(inv.customer_id, existing);
  }

  const recentlyPaid = invoices
    .filter((i) => i.payment_status === "paid" && i.amount_paid > 0)
    .sort((a, b) => (b.last_payment_date ?? "").localeCompare(a.last_payment_date ?? ""))
    .slice(0, 10);

  return {
    invoices,
    totalOutstandingCredit: outstanding.reduce((s, i) => s + i.remaining_balance, 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((s, i) => s + i.remaining_balance, 0),
    customersWithBalance: Array.from(balanceByCustomer.entries())
      .map(([customer_id, v]) => ({ customer_id, customer_name: v.customer_name, balance: v.balance }))
      .sort((a, b) => b.balance - a.balance),
    recentlyPaid,
  };
}
