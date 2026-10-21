import { NextRequest } from "next/server";
import { requireApiUser, userHasPermission } from "@/lib/api/auth-helpers";
import { jsonError, jsonForbidden, jsonOk } from "@/lib/api/response";
import { getCurrentCapacity } from "@/lib/services/capacity";
import { FACTORY_IDS, type ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const allowed =
    userHasPermission(auth.user, "ai", "capacity") ||
    userHasPermission(auth.user, "ai", "read") ||
    userHasPermission(auth.user, "production", "read") ||
    userHasPermission(auth.user, "*", "*");
  if (!allowed) return jsonForbidden();

  const scope = (request.nextUrl.searchParams.get("scope") ?? "block") as ViewScope;
  const live = request.nextUrl.searchParams.get("live") === "1";
  const factoryId =
    scope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  try {
    const data = await getCurrentCapacity(auth.user.organization_id, factoryId, {
      live,
      persist: live,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Capacity lookup failed");
  }
}
