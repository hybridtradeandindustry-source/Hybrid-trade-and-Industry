import { NextRequest } from "next/server";
import { requireApiUser, userHasPermission } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getEmployeeDetail } from "@/lib/services/employee-detail";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser("hr", "read");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const canViewSalary =
    userHasPermission(auth.user, "hr", "view_salary") ||
    userHasPermission(auth.user, "hr", "manage");

  try {
    const detail = await getEmployeeDetail(id, auth.user.organization_id, { canViewSalary });
    return jsonOk(detail);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Employee not found");
  }
}
