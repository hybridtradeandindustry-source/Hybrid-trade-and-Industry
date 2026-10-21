import { NextRequest } from "next/server";
import { requireApiUser, requireCatalogManage } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getProductionSettings, updateProductionSettings } from "@/lib/services/production-settings";

export async function GET() {
  const auth = await requireApiUser("production", "read");
  if ("error" in auth) return auth.error;

  const settings = await getProductionSettings(auth.user.organization_id);
  return jsonOk(settings);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireCatalogManage();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const settings = await updateProductionSettings(
      auth.user.organization_id,
      {
        default_daily_target_plates:
          body.default_daily_target_plates != null ? Number(body.default_daily_target_plates) : undefined,
        cement_kg_per_bag: body.cement_kg_per_bag != null ? Number(body.cement_kg_per_bag) : undefined,
      },
      auth.user.id
    );
    return jsonOk(settings);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed to update production settings");
  }
}
