import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getSupplierDetailData } from "@/lib/services";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("inventory", "read");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const detail = await getSupplierDetailData(id, auth.user.organization_id);
    return jsonOk(detail);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Supplier not found");
  }
}
