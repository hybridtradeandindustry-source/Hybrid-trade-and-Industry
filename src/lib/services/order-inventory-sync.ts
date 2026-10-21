import { createServiceClient } from "@/lib/supabase/server";
import { getAvailableQuantity } from "@/lib/inventory/inventory-utils";
import { allocateSaleToBatches } from "@/lib/services/batch-sale-allocation";
import type { Order, OrderItem, OrderStatus } from "@/types";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

export interface OrderLineInput {
  item_id: string;
  batch_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface OrderFulfillmentCheck {
  canFulfill: boolean;
  shortfalls: Array<{ item_id: string; sku: string; needed: number; available: number }>;
}

export async function fetchOrderItems(
  supabase: ServiceClient,
  orderId: string
): Promise<OrderItem[]> {
  const { data, error } = await supabase
    .from("order_items")
    .select("*, inventory_items(*)")
    .eq("order_id", orderId);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    order_id: row.order_id,
    item_id: row.item_id,
    batch_id: row.batch_id ?? null,
    description: row.description,
    quantity: Number(row.quantity),
    unit_price: Number(row.unit_price),
    total_price: Number(row.total_price ?? row.quantity * row.unit_price),
    quantity_fulfilled: Number(row.quantity_fulfilled ?? 0),
    inventory_item: row.inventory_items ?? null,
  }));
}

export async function checkOrderFulfillment(
  supabase: ServiceClient,
  lines: OrderItem[]
): Promise<OrderFulfillmentCheck> {
  const shortfalls: OrderFulfillmentCheck["shortfalls"] = [];

  for (const line of lines) {
    if (!line.item_id) continue;
    const { data: item } = await supabase
      .from("inventory_items")
      .select("id, sku, quantity, reserved_quantity")
      .eq("id", line.item_id)
      .maybeSingle();

    if (!item) continue;

    const available = getAvailableQuantity({
      quantity: Number(item.quantity),
      reserved_quantity: Number(item.reserved_quantity ?? 0),
    } as Parameters<typeof getAvailableQuantity>[0]);

    if (available < line.quantity) {
      shortfalls.push({
        item_id: line.item_id,
        sku: item.sku,
        needed: line.quantity,
        available,
      });
    }
  }

  return { canFulfill: shortfalls.length === 0, shortfalls };
}

/** On-hand stock check (ignores reservations) — used after production output is posted. */
export async function checkOrderStockOnHand(
  supabase: ServiceClient,
  lines: OrderItem[]
): Promise<OrderFulfillmentCheck> {
  const shortfalls: OrderFulfillmentCheck["shortfalls"] = [];

  for (const line of lines) {
    if (!line.item_id) continue;
    const { data: item } = await supabase
      .from("inventory_items")
      .select("id, sku, quantity")
      .eq("id", line.item_id)
      .maybeSingle();

    if (!item) continue;

    const onHand = Number(item.quantity);
    if (onHand < line.quantity) {
      shortfalls.push({
        item_id: line.item_id,
        sku: item.sku,
        needed: line.quantity,
        available: onHand,
      });
    }
  }

  return { canFulfill: shortfalls.length === 0, shortfalls };
}

export async function reserveOrderInventory(
  order: Order,
  lines: OrderItem[],
  userId: string | null
): Promise<void> {
  const supabase = await createServiceClient();

  for (const line of lines) {
    if (!line.item_id || line.quantity <= 0) continue;

    const { data: item, error: fetchError } = await supabase
      .from("inventory_items")
      .select("id, factory_id, organization_id, quantity, reserved_quantity")
      .eq("id", line.item_id)
      .single();

    if (fetchError || !item) throw new Error(`Inventory item not found for order line: ${line.description}`);

    const available = getAvailableQuantity({
      quantity: Number(item.quantity),
      reserved_quantity: Number(item.reserved_quantity ?? 0),
    } as Parameters<typeof getAvailableQuantity>[0]);

    if (available < line.quantity) {
      throw new Error(
        `Insufficient stock for ${line.description}: need ${line.quantity}, available ${available}`
      );
    }

    const { error: updateError } = await supabase
      .from("inventory_items")
      .update({
        reserved_quantity: Number(item.reserved_quantity ?? 0) + line.quantity,
      })
      .eq("id", line.item_id);

    if (updateError) throw new Error(updateError.message);
  }
}

export async function releaseOrderInventory(
  orderId: string,
  lines: OrderItem[],
  userId: string | null
): Promise<void> {
  const supabase = await createServiceClient();

  for (const line of lines) {
    if (!line.item_id || line.quantity <= 0) continue;

    const { data: item } = await supabase
      .from("inventory_items")
      .select("id, reserved_quantity")
      .eq("id", line.item_id)
      .maybeSingle();

    if (!item) continue;

    await supabase
      .from("inventory_items")
      .update({
        reserved_quantity: Math.max(0, Number(item.reserved_quantity ?? 0) - line.quantity),
      })
      .eq("id", line.item_id);
  }
}

export async function fulfillOrderLineQuantity(
  order: Order,
  line: OrderItem,
  pickupQuantity: number,
  userId: string | null
): Promise<void> {
  if (!line.item_id || pickupQuantity <= 0) return;

  const supabase = await createServiceClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("id, sku, factory_id, organization_id, quantity, reserved_quantity")
    .eq("id", line.item_id)
    .single();

  if (!item) throw new Error(`Inventory item not found for delivery: ${line.description}`);

  const onHand = Number(item.quantity);
  if (onHand < pickupQuantity) {
    throw new Error(
      `Insufficient stock for ${line.description}: need ${pickupQuantity}, on hand ${onHand}`
    );
  }

  if (line.batch_id) {
    const { getBatchAvailableQuantity } = await import("@/lib/services/batch-sale-allocation");
    const batchAvailable = await getBatchAvailableQuantity(
      supabase,
      line.batch_id,
      item.organization_id
    );
    if (batchAvailable < pickupQuantity) {
      throw new Error(
        `Only ${batchAvailable} left in the selected batch for "${line.description}" (requested ${pickupQuantity})`
      );
    }
  }

  await supabase.from("inventory_movements").insert({
    organization_id: item.organization_id,
    factory_id: item.factory_id,
    item_id: line.item_id,
    movement_type: "sale",
    quantity: -pickupQuantity,
    reference_type: "orders",
    reference_id: order.id,
    notes: `Pickup for order ${order.order_number} — ${pickupQuantity} × ${line.description}`,
    created_by: userId,
  });

  await supabase
    .from("inventory_items")
    .update({
      reserved_quantity: Math.max(0, Number(item.reserved_quantity ?? 0) - pickupQuantity),
    })
    .eq("id", line.item_id);

  await allocateSaleToBatches(supabase, {
    organizationId: item.organization_id,
    itemId: line.item_id,
    sku: item.sku,
    quantity: pickupQuantity,
    orderId: order.id,
    orderItemId: line.id,
    preferredBatchId: line.batch_id ?? null,
  });

  const fulfilled = Number(line.quantity_fulfilled ?? 0) + pickupQuantity;
  const { error } = await supabase
    .from("order_items")
    .update({ quantity_fulfilled: fulfilled })
    .eq("id", line.id);

  if (error) throw new Error(error.message);
  line.quantity_fulfilled = fulfilled;
}

export async function fulfillOrderSale(
  order: Order,
  lines: OrderItem[],
  userId: string | null
): Promise<void> {
  for (const line of lines) {
    const remaining = line.quantity - Number(line.quantity_fulfilled ?? 0);
    if (remaining <= 0) continue;
    await fulfillOrderLineQuantity(order, line, remaining, userId);
  }
}

export async function recordOrderPickup(
  orderId: string,
  pickups: Array<{ order_item_id: string; quantity: number }>,
  userId: string | null
): Promise<Order> {
  const supabase = await createServiceClient();

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .select("*, customers(*)")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!orderRow) throw new Error("Order not found");
  if (orderRow.status !== "ordered") {
    throw new Error("Only pending-pickup orders can receive partial pickups");
  }

  const lines = await fetchOrderItems(supabase, orderId);
  const order = {
    ...(orderRow as Order),
    total_amount: Number(orderRow.total_amount),
    amount_paid: Number(orderRow.amount_paid ?? 0),
    items: lines,
  };

  const pickupByItem = new Map(
    pickups
      .filter((p) => p.quantity > 0)
      .map((p) => [p.order_item_id, p.quantity])
  );

  if (pickupByItem.size === 0) {
    throw new Error("Enter a pickup quantity greater than zero");
  }

  for (const line of lines) {
    const requested = pickupByItem.get(line.id);
    if (!requested) continue;

    const remaining = line.quantity - Number(line.quantity_fulfilled ?? 0);
    if (requested > remaining + 0.0001) {
      throw new Error(
        `Pickup for "${line.description}" exceeds the ${remaining} still outstanding on this order`
      );
    }

    await fulfillOrderLineQuantity(order, line, requested, userId);
  }

  const refreshedLines = await fetchOrderItems(supabase, orderId);
  const fullyFulfilled = refreshedLines.every(
    (line) => Number(line.quantity_fulfilled ?? 0) >= line.quantity
  );

  if (fullyFulfilled) {
    await applyOrderStatusSideEffects(order, "ordered", "picked", userId);
    const { applyCustomerOrderSideEffects } = await import("@/lib/services/customer-order-sync");
    await applyCustomerOrderSideEffects(order.customer_id, "ordered", "picked", {
      total_amount: Number(order.total_amount),
      amount_paid: order.amount_paid,
    });

    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({ status: "picked", ai_risk_flag: false, ai_risk_reason: null })
      .eq("id", orderId)
      .select("*, customers(*)")
      .single();

    if (updateError) throw new Error(updateError.message);

    return {
      ...(updated as Order),
      total_amount: Number(updated.total_amount),
      amount_paid: Number(updated.amount_paid ?? 0),
      items: refreshedLines,
    };
  }

  return {
    ...order,
    items: refreshedLines,
  };
}

export async function linkOrderProductionBatch(
  order: Order,
  userId: string | null
): Promise<string | null> {
  const supabase = await createServiceClient();

  const { data: existing } = await supabase
    .from("production_batches")
    .select("id")
    .eq("order_id", order.id)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { generateBatchNumber } = await import("@/lib/utils");
  const { data: batch, error } = await supabase
    .from("production_batches")
    .insert({
      organization_id: order.organization_id,
      factory_id: order.factory_id,
      order_id: order.id,
      batch_number: generateBatchNumber(),
      status: "in_progress",
      notes: `Production for order ${order.order_number}`,
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return batch?.id ?? null;
}

export async function evaluateOrderRisk(
  supabase: ServiceClient,
  order: Order,
  lines: OrderItem[],
  nextStatus: OrderStatus
): Promise<{ ai_risk_flag: boolean; ai_risk_reason: string | null }> {
  if (nextStatus === "cancelled" || nextStatus === "picked") {
    return { ai_risk_flag: false, ai_risk_reason: null };
  }

  const fulfillment = await checkOrderFulfillment(supabase, lines);
  if (!fulfillment.canFulfill && nextStatus === "ordered") {
    const detail = fulfillment.shortfalls
      .map((s) => `${s.sku}: need ${s.needed}, have ${s.available}`)
      .join("; ");
    return {
      ai_risk_flag: true,
      ai_risk_reason: `Insufficient finished goods — ${detail}`,
    };
  }

  return { ai_risk_flag: false, ai_risk_reason: null };
}

export async function applyOrderStatusSideEffects(
  order: Order,
  previousStatus: OrderStatus,
  nextStatus: OrderStatus,
  userId: string | null
): Promise<void> {
  const supabase = await createServiceClient();
  const lines = await fetchOrderItems(supabase, order.id);

  if (nextStatus === "cancelled") {
    return;
  }

  if (previousStatus === "ordered" && nextStatus === "picked") {
    if (lines.length > 0) {
      await fulfillOrderSale(order, lines, userId);
    }
  }
}

/** Apply inventory and customer-balance effects when an order is created or marked picked. */
export async function applyNewOrderPickSideEffects(
  order: Order,
  userId: string | null
): Promise<void> {
  await applyOrderStatusSideEffects(order, "ordered", "picked", userId);
  const { applyCustomerOrderSideEffects } = await import(
    "@/lib/services/customer-order-sync"
  );
  await applyCustomerOrderSideEffects(
    order.customer_id,
    "ordered",
    "picked",
    { total_amount: Number(order.total_amount), amount_paid: order.amount_paid }
  );
}

/** After curing/output is logged, move linked in_production orders to ready when stock covers lines. */
export async function maybeAdvanceLinkedOrderToReady(
  count: {
    batch_id?: string | null;
    checkpoint?: string | null;
    good_count?: number | null;
    processed_output?: number | null;
  },
  userId: string | null
): Promise<{ orderId: string; orderNumber: string } | null> {
  const hasBlockOutput =
    count.checkpoint === "after_curing" && (count.good_count ?? 0) > 0;
  const hasRecyclingOutput = (count.processed_output ?? 0) > 0;
  if ((!hasBlockOutput && !hasRecyclingOutput) || !count.batch_id) return null;

  const supabase = await createServiceClient();

  const { data: batch } = await supabase
    .from("production_batches")
    .select("id, order_id")
    .eq("id", count.batch_id)
    .maybeSingle();

  if (!batch?.order_id) return null;

  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number, status")
    .eq("id", batch.order_id)
    .maybeSingle();

  if (!order || order.status !== "in_production") return null;

  const lines = await fetchOrderItems(supabase, order.id);
  let fulfillment = await checkOrderFulfillment(supabase, lines);

  if (!fulfillment.canFulfill) {
    const onHand = await checkOrderStockOnHand(supabase, lines);
    if (!onHand.canFulfill) return null;

    try {
      await reserveOrderInventory(order as Order, lines, userId);
    } catch {
      return null;
    }

    fulfillment = await checkOrderFulfillment(supabase, lines);
    if (!fulfillment.canFulfill) return null;
  }

  const { error: orderError } = await supabase
    .from("orders")
    .update({
      status: "ready",
      ai_risk_flag: false,
      ai_risk_reason: null,
    })
    .eq("id", order.id);

  if (orderError) throw new Error(orderError.message);

  await supabase
    .from("production_batches")
    .update({ status: hasBlockOutput ? "curing" : "completed" })
    .eq("id", batch.id);

  return { orderId: order.id, orderNumber: order.order_number };
}
