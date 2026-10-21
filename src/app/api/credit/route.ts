import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonOk } from "@/lib/api/response";
import { fetchCreditDashboard } from "@/lib/services/credit-dashboard";
import type { ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("finance", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const data = await fetchCreditDashboard(auth.user.organization_id, scope);
  return jsonOk(data);
}
