import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  aggregateCustomerOrderStats,
  countOpenOrdersForCustomer,
  fetchCustomerPayments,
} from "@/lib/services/customer-order-sync";
import {
  type CustomerActivityEvent,
  type CustomerBatchRef,
  type CustomerDetail,
  type CustomerOrderAllocation,
  type EnrichedCustomerOrder,
  type EnrichedCustomerPayment,
  type EnrichedOrderItem,
  type ReceivableLedgerEntry,
  type StoreCreditLedgerEntry,
} from "@/lib/services/customer-detail-types";
import { formatCurrency } from "@/lib/utils";
import {
  FACTORY_IDS,
  ORDER_STATUS_LABELS,
  orderCreditAmount,
  type Customer,
  type CustomerPayment,
  type CustomerSummary,
  type CustomerType,
  type Order,
} from "@/types";

export type {
  CustomerActivityEvent,
  CustomerBatchRef,
  CustomerDetail,
  CustomerOrderAllocation,
  EnrichedCustomerOrder,
  EnrichedCustomerPayment,
  EnrichedOrderItem,
  ReceivableLedgerEntry,
  StoreCreditLedgerEntry,
} from "@/lib/services/customer-detail-types";
export { formatCustomerBatchLabel } from "@/lib/services/customer-detail-types";

const FACTORY_LABELS: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Recycling Factory",
};

function toBatchRef(row: {
  id: string;
  batch_number: string;
  name?: string | null;
  block_size_cm?: number | null;
  status?: string | null;
}): CustomerBatchRef {
  return {
    id: row.id,
    batch_number: row.batch_number,
    name: row.name ?? null,
    block_size_cm: row.block_size_cm ?? null,
    status: row.status ?? null,
  };
}

function batchesForOrder(
  orderId: string,
  orderItems: EnrichedOrderItem[],
  allocations: CustomerOrderAllocation[],
  productionBatch?: CustomerBatchRef | null
): CustomerBatchRef[] {
  const seen = new Map<string, CustomerBatchRef>();
  const add = (b?: CustomerBatchRef | null) => {
    if (b?.id) seen.set(b.id, b);
  };
  add(productionBatch ?? null);
  for (const line of orderItems) add(line.batch ?? null);
  for (const alloc of allocations.filter((a) => a.order_id === orderId)) add(alloc.batch ?? null);
  return [...seen.values()];
}

function buildStoreCreditLedger(
  payments: EnrichedCustomerPayment[],
  orderById: Map<string, EnrichedCustomerOrder>
): StoreCreditLedgerEntry[] {
  const creditPayments = payments
    .filter((p) => p.kind === "store_credit_issue" || p.kind === "store_credit_apply")
    .sort((a, b) => {
      const da = `${a.payment_date}T${a.created_at}`;
      const db = `${b.payment_date}T${b.created_at}`;
      return da.localeCompare(db);
    });

  let wallet = 0;
  return creditPayments.map((p) => {
    const kind = p.kind as StoreCreditLedgerEntry["kind"];
    if (kind === "store_credit_issue") wallet += p.amount;
    else wallet -= p.amount;

    const order = p.order_id ? orderById.get(p.order_id) : undefined;
    const orderBatches = order ? batchesForOrder(order.id, order.items, order.allocations, order.production_batch) : [];

    return {
      payment_id: p.id,
      date: p.payment_date,
      kind,
      amount: p.amount,
      order_id: p.order_id ?? null,
      order_number: order?.order_number ?? p.order?.order_number ?? null,
      order_status: order?.status ?? p.order?.status ?? null,
      notes: p.notes ?? null,
      source_batches: kind === "store_credit_issue" ? orderBatches : [],
      target_batches: kind === "store_credit_apply" ? orderBatches : [],
      wallet_after: wallet,
    };
  });
}

function buildReceivableLedger(
  orders: EnrichedCustomerOrder[],
  payments: EnrichedCustomerPayment[]
): ReceivableLedgerEntry[] {
  const entries: ReceivableLedgerEntry[] = [];

  for (const order of orders) {
    if (order.status !== "picked") continue;
    const credit = order.unpaid_credit;
    if (credit <= 0) continue;
    entries.push({
      id: `pick-${order.id}`,
      date: order.delivery_date ?? order.created_at.slice(0, 10),
      kind: "pickup_credit",
      amount: credit,
      direction: "increase",
      order_id: order.id,
      order_number: order.order_number,
      description: `When sale ${order.order_number} was picked up, ${formatCurrency(credit)} was still unpaid — this amount was added to what the customer owes you.`,
    });
  }

  for (const payment of payments) {
    if (payment.kind === "refund" || payment.kind === "store_credit_issue" || payment.kind === "store_credit_apply") {
      continue;
    }
    const isSettlement =
      payment.notes?.toLowerCase().includes("cancelled order") &&
      payment.notes?.toLowerCase().includes("previous balance");
    entries.push({
      id: `pay-${payment.id}`,
      date: payment.payment_date,
      kind: isSettlement ? "settlement_to_balance" : payment.order_id ? "payment" : "manual",
      amount: payment.amount,
      direction: "decrease",
      order_id: payment.order_id ?? null,
      order_number: payment.order?.order_number ?? null,
      description:
        payment.notes ??
        (isSettlement
          ? `Part of a cancelled sale was used to pay down this customer's older debt (${formatCurrency(payment.amount)}).`
          : payment.order_id
            ? `Customer paid ${formatCurrency(payment.amount)} toward sale ${payment.order?.order_number ?? ""}.`
            : `Customer paid ${formatCurrency(payment.amount)} toward their outstanding balance.`),
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

function buildTimeline(
  orders: EnrichedCustomerOrder[],
  payments: EnrichedCustomerPayment[],
  storeCreditLedger: StoreCreditLedgerEntry[]
): CustomerActivityEvent[] {
  const events: CustomerActivityEvent[] = [];

  for (const order of orders) {
    const batches = batchesForOrder(order.id, order.items, order.allocations, order.production_batch);
    events.push({
      id: `sale-created-${order.id}`,
      date: order.created_at.slice(0, 10),
      category: "sale",
      title: `New sale ${order.order_number}`,
      description: `${order.factory_label} — total ${formatCurrency(order.total_amount)}. Status: ${ORDER_STATUS_LABELS[order.status] ?? order.status}.`,
      amount: order.total_amount,
      order_id: order.id,
      order_number: order.order_number,
      batches,
    });

    if (order.status === "picked") {
      events.push({
        id: `sale-picked-${order.id}`,
        date: order.delivery_date ?? order.created_at.slice(0, 10),
        category: "pickup",
        title: `Customer picked up sale ${order.order_number}`,
        description:
          order.unpaid_credit > 0
            ? `Goods collected. ${formatCurrency(order.unpaid_credit)} is still owed and was added to their balance.`
            : "Goods collected and the sale was fully paid — nothing left to collect.",
        amount: order.unpaid_credit > 0 ? order.unpaid_credit : undefined,
        order_id: order.id,
        order_number: order.order_number,
        batches,
      });
    }

    if (order.status === "cancelled") {
      events.push({
        id: `sale-cancelled-${order.id}`,
        date: order.delivery_date ?? order.created_at.slice(0, 10),
        category: "cancellation",
        title: `Sale ${order.order_number} was cancelled`,
        description:
          "The sale was cancelled and reserved stock was released. Check Store Credit Wallet for any money kept as prepaid credit, or All Money Movements for refunds.",
        order_id: order.id,
        order_number: order.order_number,
        batches,
      });
    }
  }

  for (const payment of payments) {
    const order = payment.order;
    const batches =
      payment.order_id && orders.find((o) => o.id === payment.order_id)
        ? batchesForOrder(
            payment.order_id,
            orders.find((o) => o.id === payment.order_id)!.items,
            orders.find((o) => o.id === payment.order_id)!.allocations,
            orders.find((o) => o.id === payment.order_id)!.production_batch
          )
        : [];

    if (payment.kind === "refund") {
      events.push({
        id: `refund-${payment.id}`,
        date: payment.payment_date,
        category: "refund",
        title: `You refunded ${formatCurrency(payment.amount)} in cash`,
        description:
          payment.notes ??
          `Cash returned to the customer, linked to sale ${order?.order_number ?? "—"}.`,
        amount: payment.amount,
        order_id: payment.order_id ?? null,
        order_number: order?.order_number ?? null,
        batches,
      });
    } else if (payment.kind === "payment") {
      events.push({
        id: `payment-${payment.id}`,
        date: payment.payment_date,
        category: "payment",
        title: `You received ${formatCurrency(payment.amount)}`,
        description:
          payment.notes ??
          (order
            ? `Payment toward sale ${order.order_number}.`
            : "Payment applied to the customer's outstanding balance."),
        amount: payment.amount,
        order_id: payment.order_id ?? null,
        order_number: order?.order_number ?? null,
        batches,
      });
    }
  }

  for (const entry of storeCreditLedger) {
    events.push({
      id: `wallet-${entry.payment_id}`,
      date: entry.date,
      category: "store_credit",
      title:
        entry.kind === "store_credit_issue"
          ? `${formatCurrency(entry.amount)} added to store credit wallet`
          : `${formatCurrency(entry.amount)} spent from store credit wallet`,
      description:
        entry.notes ??
        (entry.kind === "store_credit_issue"
          ? `Customer cancelled sale ${entry.order_number ?? "—"} after paying — this amount was kept as prepaid credit instead of a cash refund. Wallet balance after: ${formatCurrency(entry.wallet_after)}.`
          : `Wallet credit was used to pay part of sale ${entry.order_number ?? "—"}. Wallet balance after: ${formatCurrency(entry.wallet_after)}.`),
      amount: entry.amount,
      order_id: entry.order_id ?? null,
      order_number: entry.order_number ?? null,
      batches: entry.kind === "store_credit_issue" ? entry.source_batches : entry.target_batches,
    });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getCustomerDetail(id: string, orgId: string): Promise<CustomerDetail> {
  const supabase = await createClient();

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (customerError || !customerRow) throw new Error("Customer not found");

  const { data: orderRows, error: ordersError } = await supabase
    .from("orders")
    .select(
      `
      *,
      order_items(
        id,
        order_id,
        item_id,
        batch_id,
        description,
        quantity,
        unit_price,
        quantity_fulfilled,
        inventory_items(id, sku, name)
      )
    `
    )
    .eq("organization_id", orgId)
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  if (ordersError) throw new Error(ordersError.message);

  const orderIds = (orderRows ?? []).map((o) => o.id as string);

  const service = await createServiceClient();

  const [openOrderCount, paymentsRaw, batchLinks, allocationRows] = await Promise.all([
    countOpenOrdersForCustomer(service, id, orgId),
    fetchCustomerPayments(id, orgId),
    orderIds.length
      ? service
          .from("production_batches")
          .select("id, batch_number, name, block_size_cm, status, order_id")
          .eq("organization_id", orgId)
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    orderIds.length
      ? service
          .from("batch_sale_allocations")
          .select(
            "id, order_id, order_item_id, batch_id, quantity, production_batches(id, batch_number, name, block_size_cm, status)"
          )
          .eq("organization_id", orgId)
          .in("order_id", orderIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const itemBatchIds = new Set<string>();
  for (const row of orderRows ?? []) {
    for (const item of (row.order_items as { batch_id?: string | null }[] | null) ?? []) {
      if (item.batch_id) itemBatchIds.add(item.batch_id);
    }
  }
  for (const row of allocationRows.data ?? []) {
    if (row.batch_id) itemBatchIds.add(row.batch_id as string);
  }

  const linkedBatchIds = new Set((batchLinks.data ?? []).map((b) => b.id as string));
  const missingBatchIds = [...itemBatchIds].filter((bid) => !linkedBatchIds.has(bid));

  let extraBatches: CustomerBatchRef[] = [];
  if (missingBatchIds.length) {
    const { data: extraRows } = await service
      .from("production_batches")
      .select("id, batch_number, name, block_size_cm, status")
      .eq("organization_id", orgId)
      .in("id", missingBatchIds);
    extraBatches = (extraRows ?? []).map((b) => toBatchRef(b as CustomerBatchRef));
  }

  const batchById = new Map<string, CustomerBatchRef>();
  for (const b of [...(batchLinks.data ?? []), ...extraBatches]) {
    batchById.set(b.id as string, toBatchRef(b as CustomerBatchRef));
  }

  const productionBatchByOrder = new Map<string, CustomerBatchRef>();
  for (const b of batchLinks.data ?? []) {
    if (b.order_id) productionBatchByOrder.set(b.order_id as string, toBatchRef(b as CustomerBatchRef));
  }

  const allocations: CustomerOrderAllocation[] = (allocationRows.data ?? []).map((row) => {
    const batchRow = row.production_batches as CustomerBatchRef | null;
    const batch = batchRow ? toBatchRef(batchRow) : batchById.get(row.batch_id as string) ?? null;
    if (batch) batchById.set(batch.id, batch);
    return {
      id: row.id as string,
      order_id: row.order_id as string,
      order_item_id: (row.order_item_id as string | null) ?? null,
      batch_id: row.batch_id as string,
      quantity: Number(row.quantity),
      batch,
    };
  });

  const allocationsByOrder = new Map<string, CustomerOrderAllocation[]>();
  for (const alloc of allocations) {
    const list = allocationsByOrder.get(alloc.order_id) ?? [];
    list.push(alloc);
    allocationsByOrder.set(alloc.order_id, list);
  }

  const orders: EnrichedCustomerOrder[] = (orderRows ?? []).map((row) => {
    const order = row as unknown as Order;
    const items: EnrichedOrderItem[] = (
      (row.order_items as Array<Record<string, unknown>> | null) ?? []
    ).map((item) => {
      const batchId = item.batch_id as string | null;
      const inv = item.inventory_items as { sku?: string; name?: string } | null;
      return {
        id: item.id as string,
        order_id: item.order_id as string,
        item_id: (item.item_id as string | null) ?? null,
        batch_id: batchId,
        description:
          (item.description as string) ||
          (inv?.sku ? `${inv.sku}${inv.name ? ` — ${inv.name}` : ""}` : "Line item"),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        quantity_fulfilled: Number(item.quantity_fulfilled ?? 0),
        batch: batchId ? batchById.get(batchId) ?? null : null,
      };
    });

    const production_batch = productionBatchByOrder.get(order.id) ?? null;
    const orderAllocations = allocationsByOrder.get(order.id) ?? [];

    const normalized: EnrichedCustomerOrder = {
      ...order,
      total_amount: Number(order.total_amount),
      amount_paid: Number(order.amount_paid ?? 0),
      discount_percent: Number(order.discount_percent ?? 0),
      withholding_amount: Number((row as { withholding_amount?: number }).withholding_amount ?? 0),
      store_credit_applied: Number((row as { store_credit_applied?: number }).store_credit_applied ?? 0),
      items,
      production_batch,
      allocations: orderAllocations,
      factory_label: FACTORY_LABELS[order.factory_id] ?? order.factory_id,
      unpaid_credit: orderCreditAmount({
        total_amount: Number(order.total_amount),
        amount_paid: Number(order.amount_paid ?? 0),
        withholding_amount: Number((row as { withholding_amount?: number }).withholding_amount ?? 0),
        store_credit_applied: Number((row as { store_credit_applied?: number }).store_credit_applied ?? 0),
      }),
    };
    return normalized;
  });

  const orderById = new Map(orders.map((o) => [o.id, o]));

  const payments: EnrichedCustomerPayment[] = (paymentsRaw as CustomerPayment[]).map((p) => ({
    ...p,
    order: p.order_id ? orderById.get(p.order_id) ?? null : null,
  }));

  const walletReplay = buildStoreCreditLedger(payments, orderById);
  const walletByPaymentId = new Map(walletReplay.map((e) => [e.payment_id, e.wallet_after]));

  const enrichedPayments: EnrichedCustomerPayment[] = payments.map((p) => ({
    ...p,
    wallet_balance_after:
      p.kind === "store_credit_issue" || p.kind === "store_credit_apply"
        ? walletByPaymentId.get(p.id) ?? null
        : null,
  }));

  const storeCreditLedger = [...walletReplay].reverse();
  const receivableLedger = buildReceivableLedger(orders, enrichedPayments);
  const timeline = buildTimeline(orders, enrichedPayments, walletReplay);

  const batchesInvolvedMap = new Map<string, CustomerBatchRef>();
  for (const order of orders) {
    for (const b of batchesForOrder(order.id, order.items, order.allocations, order.production_batch)) {
      batchesInvolvedMap.set(b.id, b);
    }
  }

  const stats = aggregateCustomerOrderStats(
    orders.map((o) => ({
      customer_id: id,
      status: o.status,
      total_amount: o.total_amount,
      amount_paid: o.amount_paid,
      withholding_amount: o.withholding_amount,
      store_credit_applied: o.store_credit_applied,
    }))
  ).get(id);

  const totalPaid = enrichedPayments.reduce(
    (sum, p) => sum + (!p.kind || p.kind === "payment" ? Number(p.amount) : 0),
    0
  );
  const totalRefunded = enrichedPayments.reduce(
    (sum, p) => sum + (p.kind === "refund" ? Number(p.amount) : 0),
    0
  );

  const customerBase = customerRow as unknown as Customer;
  const customer: CustomerSummary = {
    ...customerBase,
    customer_type: (customerBase.customer_type ?? "regular") as CustomerType,
    balance: Number(customerBase.balance),
    store_credit_balance: Number(customerBase.store_credit_balance ?? 0),
    order_count: stats?.order_count ?? 0,
    pipeline_value: stats?.pipeline_value ?? 0,
    picked_value: stats?.picked_value ?? 0,
    open_order_count: openOrderCount,
    total_paid: totalPaid,
    total_refunded: totalRefunded,
    net_paid: totalPaid - totalRefunded,
    pending_order_credit: stats?.pending_order_credit ?? 0,
  };

  return {
    customer,
    payments: enrichedPayments,
    orders,
    storeCreditLedger,
    receivableLedger,
    timeline,
    batchesInvolved: [...batchesInvolvedMap.values()].sort((a, b) =>
      a.batch_number.localeCompare(b.batch_number)
    ),
  };
}
