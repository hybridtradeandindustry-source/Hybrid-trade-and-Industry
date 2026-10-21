import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { generateOrderNumber } from "@/lib/utils";
import {
  applyNewOrderPickSideEffects,
  applyOrderStatusSideEffects,
  evaluateOrderRisk,
  fetchOrderItems,
  releaseOrderInventory,
  type OrderLineInput,
} from "@/lib/services/order-inventory-sync";
import {
  FACTORY_IDS,
  computeOrderGrandTotal,
  computeWithholdingAmount,
  type InventoryItem,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type RecyclingOrderStage,
  type ViewScope,
} from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

async function validateBatchLineQuantities(
  orgId: string,
  lines: OrderLineInput[],
  options?: { excludeOrderId?: string; prepaidAdvance?: boolean }
): Promise<void> {
  if (options?.prepaidAdvance) return;

  const batchLines = lines.filter((l) => l.batch_id);
  if (batchLines.length === 0) return;

  const { getBatchProductionSummaries } = await import("@/lib/services/production-batch-detail");
  const summaries = await getBatchProductionSummaries(orgId, FACTORY_IDS.block);

  const service = await createServiceClient();
  for (const line of batchLines) {
    const summary = summaries[line.batch_id as string] ?? { produced: 0, sold: 0 };
    let alreadyReservedByThisOrder = 0;
    if (options?.excludeOrderId) {
      const { data: existingLine } = await service
        .from("order_items")
        .select("quantity")
        .eq("order_id", options.excludeOrderId)
        .eq("batch_id", line.batch_id as string)
        .maybeSingle();
      alreadyReservedByThisOrder = Number(existingLine?.quantity ?? 0);
    }
    const available = Math.max(0, summary.produced - summary.sold) + alreadyReservedByThisOrder;
    if (line.quantity > available) {
      throw new Error(
        `Only ${available} left in the selected batch for "${line.description}" (requested ${line.quantity})`
      );
    }
  }
}

function mapOrderRow(row: Record<string, unknown>, items?: Order["items"]): Order {
  const order = row as unknown as Order;
  return {
    ...order,
    total_amount: Number(order.total_amount),
    amount_paid: Number(order.amount_paid ?? 0),
    discount_percent: Number(order.discount_percent ?? 0),
    bank_id: (order.bank_id as string | null) ?? null,
    bank_account_id: (order.bank_account_id as string | null) ?? null,
    customer: row.customers as Order["customer"],
    items,
    production_batch_id: (row.production_batch_id as string | null) ?? null,
    store_credit_applied: Number(order.store_credit_applied ?? 0),
    withholding_applied: Boolean(order.withholding_applied),
    withholding_rate_percent:
      order.withholding_rate_percent != null ? Number(order.withholding_rate_percent) : null,
    withholding_amount: Number(order.withholding_amount ?? 0),
    vat_applied: Boolean(order.vat_applied),
    vat_rate_percent: order.vat_rate_percent != null ? Number(order.vat_rate_percent) : null,
    vat_amount: Number(order.vat_amount ?? 0),
    prepaid_advance: Boolean(order.prepaid_advance),
  };
}

export async function fetchOrdersData(scope: ViewScope, orgId: string): Promise<Order[]> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  let query = supabase
    .from("orders")
    .select("*, customers(*), order_items(*, inventory_items(*))")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (factoryId) query = query.eq("factory_id", factoryId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const batchLinks = await supabase
    .from("production_batches")
    .select("id, order_id")
    .eq("organization_id", orgId)
    .not("order_id", "is", null);

  const batchByOrder = new Map(
    (batchLinks.data ?? []).map((b) => [b.order_id as string, b.id as string])
  );

  return (data ?? []).map((row) => {
    const items = ((row.order_items as Record<string, unknown>[]) ?? []).map((line) => ({
      id: line.id as string,
      order_id: line.order_id as string,
      item_id: line.item_id as string | null,
      batch_id: (line.batch_id as string | null) ?? null,
      description: line.description as string,
      quantity: Number(line.quantity),
      unit_price: Number(line.unit_price),
      total_price: Number(line.total_price ?? Number(line.quantity) * Number(line.unit_price)),
      quantity_fulfilled: Number(line.quantity_fulfilled ?? 0),
      inventory_item: (line.inventory_items as InventoryItem | null) ?? null,
    }));

    return mapOrderRow(
      { ...row, production_batch_id: batchByOrder.get(row.id as string) ?? null },
      items
    );
  });
}

async function replaceOrderItems(orderId: string, lines: OrderLineInput[]) {
  const supabase = await createClient();
  await supabase.from("order_items").delete().eq("order_id", orderId);

  if (lines.length === 0) return;

  const { error } = await supabase.from("order_items").insert(
    lines.map((line) => ({
      order_id: orderId,
      item_id: line.item_id,
      batch_id: line.batch_id ?? null,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
    }))
  );

  if (error) throw new Error(error.message);
}

export async function insertOrder(
  input: {
    factory_id: string;
    customer_id: string;
    delivery_date?: string;
    payment_method?: PaymentMethod;
    bank_account_id?: string;
    amount_paid?: number;
    discount_percent?: number;
    requires_invoice?: boolean;
    pending_pickup?: boolean;
    prepaid_advance?: boolean;
    withholding_applied?: boolean;
    vat_applied?: boolean;
    store_credit_applied?: number;
    lines: OrderLineInput[];
  },
  user: ApiUser
): Promise<Order> {
  const supabase = await createClient();

  if (input.lines.length === 0) {
    throw new Error("At least one order line linked to an inventory SKU is required");
  }

  const seen = new Set<string>();
  for (const line of input.lines) {
    const key = `${line.item_id}:${line.batch_id ?? ""}`;
    if (seen.has(key)) {
      throw new Error("Each SKU/batch combination can only appear once per order");
    }
    seen.add(key);
  }

  const { assertCustomerIsActive } = await import("@/lib/services/customers");
  await assertCustomerIsActive(input.customer_id, user.organization_id);

  const prepaidAdvance = Boolean(input.prepaid_advance);
  await validateBatchLineQuantities(user.organization_id, input.lines, { prepaidAdvance });

  const discount_percent = Math.min(100, Math.max(0, input.discount_percent ?? 0));

  const { getFinanceSettings } = await import("@/lib/services/finance-settings");
  const settings = await getFinanceSettings(user.organization_id);

  let vat_rate_percent: number | null = null;
  let vat_amount = 0;
  if (input.vat_applied) {
    vat_rate_percent = settings.vat_rate_percent;
    const preview = computeOrderGrandTotal(
      input.lines,
      discount_percent,
      true,
      vat_rate_percent
    );
    vat_amount = preview.vatAmount;
  }

  const { totalAmount: total_amount } = computeOrderGrandTotal(
    input.lines,
    discount_percent,
    input.vat_applied,
    vat_rate_percent
  );

  const amount_paid = Math.min(
    Math.max(0, input.amount_paid ?? 0),
    total_amount
  );

  let resolvedBank: { bank_account_id: string; bank_id: string } | null = null;
  if (amount_paid > 0) {
    const { assertBankAccountRequired, resolveBankAccount } = await import("@/lib/services/banks");
    assertBankAccountRequired(input.payment_method ?? "cash", input.bank_account_id);
    if (input.payment_method === "bank" && input.bank_account_id) {
      resolvedBank = await resolveBankAccount(input.bank_account_id, user.organization_id);
    }
  }

  let withholding_rate_percent: number | null = null;
  let withholding_amount = 0;
  if (input.withholding_applied) {
    withholding_rate_percent = settings.withholding_tax_rate_percent;
    withholding_amount = computeWithholdingAmount(total_amount, withholding_rate_percent, true);
  }

  let store_credit_applied = 0;
  if (input.store_credit_applied && input.store_credit_applied > 0) {
    const { data: customerRow } = await supabase
      .from("customers")
      .select("store_credit_balance")
      .eq("id", input.customer_id)
      .single();
    const availableCredit = Number(customerRow?.store_credit_balance ?? 0);
    const remaining = Math.max(0, total_amount - amount_paid - withholding_amount);
    store_credit_applied = Math.min(input.store_credit_applied, availableCredit, remaining);
  }

  const pendingPickup = prepaidAdvance ? true : (input.pending_pickup ?? false);
  const status: OrderStatus = pendingPickup ? "ordered" : "picked";

  const { data, error } = await supabase
    .from("orders")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id,
      customer_id: input.customer_id,
      order_number: generateOrderNumber(),
      status,
      total_amount,
      amount_paid,
      discount_percent,
      delivery_date: input.delivery_date ?? null,
      payment_method: input.payment_method ?? null,
      bank_id: resolvedBank?.bank_id ?? null,
      bank_account_id: resolvedBank?.bank_account_id ?? null,
      requires_invoice: input.requires_invoice ?? false,
      created_by: user.id,
      withholding_applied: withholding_amount > 0,
      withholding_rate_percent,
      withholding_amount,
      vat_applied: vat_amount > 0,
      vat_rate_percent,
      vat_amount,
      store_credit_applied,
      prepaid_advance: prepaidAdvance,
      // Additive, recycling-only workflow stage — null for every other factory.
      recycling_stage: input.factory_id === FACTORY_IDS.recycling ? "pending" : null,
    })
    .select("*, customers(*)")
    .single();

  if (error) throw new Error(error.message);

  await replaceOrderItems(data.id, input.lines);

  if (amount_paid > 0) {
    const { recordCustomerPayment } = await import("@/lib/services/customer-order-sync");
    await recordCustomerPayment(
      {
        customer_id: input.customer_id,
        amount: amount_paid,
        payment_method: input.payment_method ?? "cash",
        bank_account_id: input.bank_account_id,
        order_id: data.id,
        notes: `Payment at order ${data.order_number}`,
        affects_balance: false,
      },
      user
    );
  }

  if (store_credit_applied > 0) {
    const { applyStoreCreditToOrder } = await import("@/lib/services/customer-order-sync");
    await applyStoreCreditToOrder(
      input.customer_id,
      data.id,
      data.order_number,
      store_credit_applied,
      user
    );
  }

  const service = await createServiceClient();
  const items = await fetchOrderItems(service, data.id);
  const order = mapOrderRow(data as Record<string, unknown>, items);

  if (!pendingPickup) {
    await applyNewOrderPickSideEffects(order, user.id);
  }

  return order;
}

export async function updateOrderRecord(
  id: string,
  input: {
    customer_id?: string;
    factory_id?: string;
    delivery_date?: string;
    payment_method?: PaymentMethod;
    bank_account_id?: string;
    amount_paid?: number;
    discount_percent?: number;
    requires_invoice?: boolean;
    lines?: OrderLineInput[];
  },
  user: ApiUser
): Promise<Order> {
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select(
      "status, discount_percent, payment_method, amount_paid, bank_account_id, vat_applied, vat_rate_percent, prepaid_advance"
    )
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();

  if (existingError || !existing) throw new Error("Order not found");
  if (existing.status !== "ordered") {
    throw new Error("Only ordered orders can be edited");
  }

  const effectivePaymentMethod: PaymentMethod =
    input.payment_method !== undefined
      ? input.payment_method
      : ((existing.payment_method as PaymentMethod | null) ?? "cash");
  const effectiveAmountPaid =
    input.amount_paid !== undefined ? input.amount_paid : Number(existing.amount_paid ?? 0);
  const effectiveBankAccountId: string | null =
    input.bank_account_id !== undefined
      ? input.bank_account_id
      : ((existing.bank_account_id as string | null) ?? null);

  const { assertBankAccountRequired, resolveBankAccount } = await import("@/lib/services/banks");
  if (effectiveAmountPaid > 0) {
    assertBankAccountRequired(effectivePaymentMethod, effectiveBankAccountId);
  }
  const resolvedBank =
    effectivePaymentMethod === "bank" && effectiveAmountPaid > 0 && effectiveBankAccountId
      ? await resolveBankAccount(effectiveBankAccountId, user.organization_id)
      : null;

  const discount_percent =
    input.discount_percent != null
      ? Math.min(100, Math.max(0, input.discount_percent))
      : Number(existing.discount_percent ?? 0);

  const service = await createServiceClient();

  let total_amount: number | undefined;
  let vat_amount: number | undefined;
  if (input.lines) {
    await validateBatchLineQuantities(user.organization_id, input.lines, {
      excludeOrderId: id,
      prepaidAdvance: Boolean(existing.prepaid_advance),
    });
    const grandTotal = computeOrderGrandTotal(
      input.lines,
      discount_percent,
      Boolean(existing.vat_applied),
      existing.vat_rate_percent != null ? Number(existing.vat_rate_percent) : null
    );
    total_amount = grandTotal.totalAmount;
    vat_amount = grandTotal.vatAmount;
    await replaceOrderItems(id, input.lines);
  } else if (input.discount_percent !== undefined) {
    const existingLines = await fetchOrderItems(service, id);
    const grandTotal = computeOrderGrandTotal(
      existingLines.map((line) => ({
        quantity: line.quantity,
        unit_price: line.unit_price,
      })),
      discount_percent,
      Boolean(existing.vat_applied),
      existing.vat_rate_percent != null ? Number(existing.vat_rate_percent) : null
    );
    total_amount = grandTotal.totalAmount;
    vat_amount = grandTotal.vatAmount;
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      customer_id: input.customer_id,
      factory_id: input.factory_id,
      delivery_date: input.delivery_date,
      ...(input.payment_method !== undefined ? { payment_method: input.payment_method } : {}),
      ...(input.payment_method !== undefined ||
      input.amount_paid !== undefined ||
      input.bank_account_id !== undefined
        ? { bank_id: resolvedBank?.bank_id ?? null, bank_account_id: resolvedBank?.bank_account_id ?? null }
        : {}),
      ...(input.amount_paid !== undefined ? { amount_paid: input.amount_paid } : {}),
      ...(input.discount_percent !== undefined ? { discount_percent } : {}),
      ...(input.requires_invoice !== undefined ? { requires_invoice: input.requires_invoice } : {}),
      ...(total_amount != null ? { total_amount } : {}),
      ...(vat_amount != null ? { vat_amount } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*, customers(*)")
    .single();

  if (error) throw new Error(error.message);

  const items = await fetchOrderItems(service, id);
  return mapOrderRow(data as Record<string, unknown>, items);
}

export async function transitionOrderStatus(
  id: string,
  status: OrderStatus,
  user: ApiUser
): Promise<Order> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select("*, customers(*)")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();

  if (existingError || !existing) throw new Error("Order not found");

  const previousStatus = existing.status as OrderStatus;
  if (previousStatus === status) {
    const lines = await fetchOrderItems(service, id);
    return mapOrderRow(existing as Record<string, unknown>, lines);
  }

  const order = mapOrderRow(existing as Record<string, unknown>);
  const lines = await fetchOrderItems(service, id);
  order.items = lines;

  await applyOrderStatusSideEffects(order, previousStatus, status, user.id);

  const { applyCustomerOrderSideEffects } = await import(
    "@/lib/services/customer-order-sync"
  );
  await applyCustomerOrderSideEffects(
    order.customer_id,
    previousStatus,
    status,
    { total_amount: Number(order.total_amount), amount_paid: order.amount_paid }
  );

  const risk = await evaluateOrderRisk(service, order, lines, status);

  const { data, error } = await supabase
    .from("orders")
    .update({
      status,
      ai_risk_flag: risk.ai_risk_flag,
      ai_risk_reason: risk.ai_risk_reason,
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*, customers(*)")
    .single();

  if (error) throw new Error(error.message);

  return mapOrderRow(data as Record<string, unknown>, lines);
}

// Additive, recycling-only workflow stage. Never touches `status` or the
// block-factory side-effect pipeline — block-factory orders never call this.
export async function updateRecyclingOrderStage(
  id: string,
  stage: RecyclingOrderStage,
  user: ApiUser
): Promise<Order> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select("factory_id")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();

  if (existingError || !existing) throw new Error("Order not found");
  if (existing.factory_id !== FACTORY_IDS.recycling) {
    throw new Error("Recycling stage can only be set on Plastic Recycling orders");
  }

  const { data, error } = await supabase
    .from("orders")
    .update({ recycling_stage: stage })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*, customers(*)")
    .single();

  if (error) throw new Error(error.message);

  const items = await fetchOrderItems(service, id);
  return mapOrderRow(data as Record<string, unknown>, items);
}

export async function recordOrderPickupAction(
  orderId: string,
  pickups: Array<{ order_item_id: string; quantity: number }>,
  user: ApiUser
): Promise<Order> {
  const { recordOrderPickup } = await import("@/lib/services/order-inventory-sync");
  return recordOrderPickup(orderId, pickups, user.id);
}

export async function cancelOrderRecord(id: string, user: ApiUser): Promise<Order> {
  return transitionOrderStatus(id, "cancelled", user);
}

/**
 * Cancel & settle: for a paid order that was never picked up (status still 'ordered'), split
 * the payment already taken between a cash refund, paying down the customer's existing balance
 * from other orders, and/or store credit, release the reserved inventory (never happened on a
 * plain cancel before), and mark the order cancelled.
 */
export async function cancelOrderWithSettlement(
  id: string,
  settlement: { refundAmount: number; creditAmount: number; balancePaymentAmount: number },
  user: ApiUser
): Promise<Order> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: existing, error: existingError } = await supabase
    .from("orders")
    .select("*, customers(*)")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();

  if (existingError || !existing) throw new Error("Order not found");
  if (existing.status !== "ordered") {
    throw new Error("Only orders that haven't been picked up yet can be cancelled with settlement");
  }

  const amountPaid = Number(existing.amount_paid ?? 0);
  const refundAmount = Math.max(0, settlement.refundAmount);
  const creditAmount = Math.max(0, settlement.creditAmount);
  const balancePaymentAmount = Math.max(0, settlement.balancePaymentAmount);

  if (amountPaid <= 0) {
    throw new Error("This order has no payment to settle — use plain cancel instead");
  }
  if (Math.abs(refundAmount + creditAmount + balancePaymentAmount - amountPaid) > 0.01) {
    throw new Error("Refund + balance payment + credit must add up to the amount already paid");
  }
  const customerBalance = Number(existing.customers?.balance ?? 0);
  if (balancePaymentAmount > customerBalance + 0.01) {
    throw new Error("Balance payment exceeds the customer's outstanding balance");
  }

  const lines = await fetchOrderItems(service, id);
  await releaseOrderInventory(id, lines, user.id);

  const { data, error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*, customers(*)")
    .single();

  if (error) throw new Error(error.message);

  const { issueOrderRefundSettlement } = await import("@/lib/services/customer-order-sync");
  await issueOrderRefundSettlement(
    existing.customer_id,
    id,
    existing.order_number,
    { refundAmount, creditAmount, balancePaymentAmount },
    user
  );

  return mapOrderRow(data as Record<string, unknown>, lines);
}

export async function recordOrderDelivery(
  input: {
    order_id: string;
    photo_url?: string;
    signature_url?: string;
    gps_latitude?: number;
    gps_longitude?: number;
  },
  user: ApiUser
): Promise<Order> {
  const supabase = await createClient();

  await supabase.from("deliveries").insert({
    organization_id: user.organization_id,
    order_id: input.order_id,
    driver_id: user.id,
    photo_url: input.photo_url ?? null,
    signature_url: input.signature_url ?? null,
    gps_latitude: input.gps_latitude ?? null,
    gps_longitude: input.gps_longitude ?? null,
  });

  const { data: existing } = await supabase
    .from("orders")
    .select("status")
    .eq("id", input.order_id)
    .eq("organization_id", user.organization_id)
    .single();

  if (existing?.status === "picked") {
    const service = await createServiceClient();
    const items = await fetchOrderItems(service, input.order_id);
    const { data: orderRow } = await supabase
      .from("orders")
      .select("*, customers(*)")
      .eq("id", input.order_id)
      .single();
    return mapOrderRow(orderRow as Record<string, unknown>, items);
  }

  return transitionOrderStatus(input.order_id, "picked", user);
}
