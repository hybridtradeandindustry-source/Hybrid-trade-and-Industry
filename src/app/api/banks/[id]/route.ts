import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getBankDetail } from "@/lib/services/bank-detail";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("finance", "read");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const detail = await getBankDetail(id, auth.user.organization_id);
    return jsonOk(detail);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Bank not found");
  }
}
