import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  cancelOrder,
  cancelOrderWithSettlement,
  confirmDelivery,
  createOrder,
  getOrdersData,
  recordOrderPickup,
  updateOrder,
  updateOrderRecord,
  updateRecyclingOrderStage,
} from "@/lib/services";
import type { OrderStatus, RecyclingOrderStage, ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("sales", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const orders = await getOrdersData(scope, auth.user.organization_id);
  return jsonOk(orders);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "create";

  try {
    if (action === "update_status") {
      const auth = await requireApiUser("sales", "manage");
      if ("error" in auth) return auth.error;
      const order = await updateOrder(body.id, body.status as OrderStatus, auth.user);
      return jsonOk(order);
    }

    if (action === "update_recycling_stage") {
      const auth = await requireApiUser("sales", "manage");
      if ("error" in auth) return auth.error;
      const order = await updateRecyclingOrderStage(
        body.id,
        body.stage as RecyclingOrderStage,
        auth.user
      );
      return jsonOk(order);
    }

    if (action === "update") {
      const auth = await requireApiUser("sales", "manage");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateOrderRecord(id, data, auth.user));
    }

    if (action === "delete") {
      const auth = await requireApiUser("sales", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await cancelOrder(body.id, auth.user));
    }

    if (action === "cancel_with_settlement") {
      const auth = await requireApiUser("sales", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(
        await cancelOrderWithSettlement(
          body.id,
          {
            refundAmount: Number(body.refund_amount ?? 0),
            creditAmount: Number(body.credit_amount ?? 0),
            balancePaymentAmount: Number(body.balance_payment_amount ?? 0),
          },
          auth.user
        )
      );
    }

    if (action === "record_pickup") {
      const auth = await requireApiUser("sales", "manage");
      if ("error" in auth) return auth.error;
      const pickups = (body.pickups ?? []) as Array<{ order_item_id: string; quantity: number }>;
      return jsonOk(await recordOrderPickup(body.id, pickups, auth.user));
    }

    if (action === "deliver") {
      const auth = await requireApiUser("sales", "deliver");
      if ("error" in auth) return auth.error;
      return jsonOk(await confirmDelivery(body, auth.user));
    }

    const auth = await requireApiUser("sales", "manage");
    if ("error" in auth) return auth.error;
    const order = await createOrder(body, auth.user);
    return jsonOk(order);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Order action failed");
  }
}
