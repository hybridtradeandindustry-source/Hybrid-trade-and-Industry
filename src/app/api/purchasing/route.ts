import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  cancelMaterialPurchase,
  createMaterialPurchase,
  createSupplier,
  finalizeMaterialPurchaseSorting,
  getPurchasingData,
  paySupplierCredit,
  receiveMaterialPurchase,
  updateMaterialPurchase,
  updatePurchaseInitialWeight,
} from "@/lib/services";
import { FACTORY_IDS, type ViewScope } from "@/types";

function scopeFactoryId(scope: ViewScope): string {
  return scope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("inventory", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "block") as ViewScope;
  const data = await getPurchasingData(auth.user.organization_id, scope);
  return jsonOk(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "create_purchase";

  try {
    if (action === "create_supplier") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.name?.trim()) return jsonError("Supplier name is required");
      const result = await createSupplier(
        {
          name: body.name,
          contact_phone: body.contact_phone,
          contact_email: body.contact_email,
          address: body.address,
          supplier_type: body.supplier_type,
        },
        auth.user
      );
      return jsonOk(result);
    }

    if (action === "create_purchase") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      const result = await createMaterialPurchase(
        {
          factory_id: scopeFactoryId((body.scope ?? "block") as ViewScope),
          supplier_id: body.supplier_id,
          supplier_name: body.supplier_name,
          material_type: body.material_type,
          item_id: body.item_id,
          quantity: Number(body.quantity),
          unit: body.unit,
          unit_price: Number(body.unit_price),
          vehicle_plate: body.vehicle_plate,
          delivery_notes: body.delivery_notes,
          purchase_date: body.purchase_date,
          receive_now: body.receive_now === true,
          amount_paid: body.amount_paid != null ? Number(body.amount_paid) : undefined,
          pay_method: body.pay_method,
          bank_account_id: body.bank_account_id,
          new_item_name: body.new_item_name,
        },
        auth.user
      );
      return jsonOk(result);
    }

    if (action === "update_purchase") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.id) return jsonError("Purchase id is required");
      const result = await updateMaterialPurchase(
        body.id,
        {
          supplier_id: body.supplier_id,
          supplier_name: body.supplier_name,
          material_type: body.material_type,
          item_id: body.item_id,
          quantity: body.quantity != null ? Number(body.quantity) : undefined,
          unit: body.unit,
          unit_price: body.unit_price != null ? Number(body.unit_price) : undefined,
          purchase_date: body.purchase_date,
          vehicle_plate: body.vehicle_plate,
          delivery_notes: body.delivery_notes,
        },
        auth.user
      );
      return jsonOk(result);
    }

    if (action === "receive_purchase") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.id) return jsonError("Purchase id is required");
      const result = await receiveMaterialPurchase(body.id, auth.user, {
        amount_paid: body.amount_paid != null ? Number(body.amount_paid) : undefined,
        pay_method: body.pay_method,
        bank_account_id: body.bank_account_id,
      });
      return jsonOk(result);
    }

    if (action === "finalize_sorting") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.id) return jsonError("Purchase id is required");
      if (body.net_recyclable_weight == null) return jsonError("Net recyclable weight is required");
      const result = await finalizeMaterialPurchaseSorting(
        body.id,
        Number(body.net_recyclable_weight),
        auth.user
      );
      return jsonOk(result);
    }

    if (action === "update_initial_weight") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.id) return jsonError("Purchase id is required");
      if (body.initial_received_weight == null) return jsonError("Initial received weight is required");
      const result = await updatePurchaseInitialWeight(
        body.id,
        Number(body.initial_received_weight),
        auth.user
      );
      return jsonOk(result);
    }

    if (action === "cancel_purchase") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.id) return jsonError("Purchase id is required");
      const result = await cancelMaterialPurchase(body.id, auth.user, body.reason);
      return jsonOk(result);
    }

    if (action === "record_payment") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      if (!body.supplier_id) return jsonError("Supplier is required");
      const result = await paySupplierCredit(
        {
          supplier_id: body.supplier_id,
          amount: Number(body.amount),
          payment_method: body.payment_method,
          bank_account_id: body.bank_account_id,
          payment_date: body.payment_date,
          reference: body.reference,
          notes: body.notes,
          purchase_id: body.purchase_id,
        },
        auth.user
      );
      return jsonOk(result);
    }

    return jsonError("Unknown action");
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Purchasing action failed");
  }
}
