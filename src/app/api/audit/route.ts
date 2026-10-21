import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonOk } from "@/lib/api/response";
import { queryAuditLogsPage } from "@/lib/services/audit";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("audit", "read");
  if ("error" in auth) return auth.error;

  const search = request.nextUrl.searchParams.get("search") ?? undefined;
  const action = request.nextUrl.searchParams.get("action") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  const page = await queryAuditLogsPage({
    search,
    action,
    cursor: cursor ?? null,
    limit: Number.isFinite(limit) && limit! > 0 ? limit : undefined,
  });

  return jsonOk(page);
}
