import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getCustomerDetail } from "@/lib/services/customer-detail";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("sales", "read");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const detail = await getCustomerDetail(id, auth.user.organization_id);
    return jsonOk(detail);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Customer not found");
  }
}
