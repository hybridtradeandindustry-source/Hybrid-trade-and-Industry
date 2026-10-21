import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonOk } from "@/lib/api/response";
import { fetchBlockFactoryDashboard } from "@/lib/services/block-factory-dashboard";
import { resolveFinanceDateRange } from "@/lib/finance/periods";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("dashboard", "read");
  if ("error" in auth) return auth.error;

  const period = request.nextUrl.searchParams.get("period") ?? "this_month";
  const { from, to } = resolveFinanceDateRange(
    period as import("@/lib/finance/periods").FinancePeriod,
    {
      monthYear: request.nextUrl.searchParams.get("monthYear") ?? undefined,
      dateFrom: request.nextUrl.searchParams.get("dateFrom") ?? undefined,
      dateTo: request.nextUrl.searchParams.get("dateTo") ?? undefined,
    }
  );

  const data = await fetchBlockFactoryDashboard(auth.user.organization_id, from, to);
  return jsonOk(data);
}
