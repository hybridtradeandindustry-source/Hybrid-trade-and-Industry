import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createSupplier,
  getSuppliersData,
  paySupplierCredit,
  updateSupplier,
} from "@/lib/services";

export async function GET() {
  const auth = await requireApiUser("inventory", "read");
  if ("error" in auth) return auth.error;

  const suppliers = await getSuppliersData(auth.user.organization_id);
  return jsonOk(suppliers);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser("inventory", "manage");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const action = body.action ?? "create";

  try {
    if (action === "update") {
      const { id, ...data } = body;
      if (!id) return jsonError("Supplier id is required");
      return jsonOk(await updateSupplier(id, data, auth.user));
    }
    if (action === "record_payment") {
      const { id, ...paymentData } = body;
      if (!id) return jsonError("Supplier id is required");
      return jsonOk(
        await paySupplierCredit(
          {
            supplier_id: id,
            amount: Number(paymentData.amount),
            payment_method: paymentData.payment_method,
            bank_account_id: paymentData.bank_account_id,
            payment_date: paymentData.payment_date,
            reference: paymentData.reference,
            notes: paymentData.notes,
            purchase_id: paymentData.purchase_id,
          },
          auth.user
        )
      );
    }
    if (!body.name?.trim()) return jsonError("Supplier name is required");
    return jsonOk(
      await createSupplier(
        {
          name: body.name,
          contact_phone: body.contact_phone,
          contact_email: body.contact_email,
          address: body.address,
          supplier_type: body.supplier_type,
        },
        auth.user
      )
    );
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Supplier action failed");
  }
}
