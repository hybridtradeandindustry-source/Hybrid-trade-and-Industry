import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  convertCustomerToRegular,
  createCustomer,
  deactivateCustomer,
  getCustomerPayments,
  getCustomersData,
  recordCustomerPayment,
  updateCustomer,
} from "@/lib/services";

export async function GET() {
  const auth = await requireApiUser("sales", "read");
  if ("error" in auth) return auth.error;

  const customers = await getCustomersData(auth.user.organization_id);
  return jsonOk(customers);
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser("sales", "manage");
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const action = body.action ?? "create";

  try {
    if (action === "update") {
      const { id, ...data } = body;
      return jsonOk(await updateCustomer(id, data, auth.user));
    }
    if (action === "convert_to_regular") {
      return jsonOk(await convertCustomerToRegular(body.id, auth.user));
    }
    if (action === "record_payment") {
      const { id, ...paymentData } = body;
      return jsonOk(
        await recordCustomerPayment({ customer_id: id, ...paymentData }, auth.user)
      );
    }
    if (action === "payments") {
      const payments = await getCustomerPayments(body.id, auth.user.organization_id);
      return jsonOk(payments);
    }
    if (action === "delete") {
      return jsonOk(await deactivateCustomer(body.id, auth.user));
    }
    return jsonOk(await createCustomer(body, auth.user));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Customer action failed");
  }
}
