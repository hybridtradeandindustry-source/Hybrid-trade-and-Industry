import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getProductionIntelligence } from "@/lib/services/production-intelligence";
import { FACTORY_IDS, type ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("ai", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "block") as ViewScope;
  const live = request.nextUrl.searchParams.get("live") === "1";
  const factoryId =
    scope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  try {
    const data = await getProductionIntelligence(auth.user.organization_id, factoryId, {
      live,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Intelligence lookup failed");
  }
}
