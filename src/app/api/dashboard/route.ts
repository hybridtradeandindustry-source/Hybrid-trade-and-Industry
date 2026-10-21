import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getDashboardData } from "@/lib/services";
import type { ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("dashboard", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const data = await getDashboardData(scope);
  return jsonOk(data);
}
