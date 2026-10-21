import { NextRequest } from "next/server";
import { requireApiUser, requireFinanceManage } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { getFinanceSettings, updateFinanceSettings } from "@/lib/services/finance-settings";

export async function GET() {
  const auth = await requireApiUser("finance", "read");
  if ("error" in auth) return auth.error;

  const settings = await getFinanceSettings(auth.user.organization_id);
  return jsonOk(settings);
}

export async function PATCH(request: NextRequest) {
  const auth = await requireFinanceManage();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const updates: {
      withholding_tax_rate_percent?: number;
      vat_rate_percent?: number;
    } = {};

    if (body.withholding_tax_rate_percent != null) {
      updates.withholding_tax_rate_percent = Number(body.withholding_tax_rate_percent);
    }
    if (body.vat_rate_percent != null) {
      updates.vat_rate_percent = Number(body.vat_rate_percent);
    }

    if (Object.keys(updates).length === 0) {
      return jsonError("No finance settings to update");
    }

    const settings = await updateFinanceSettings(
      auth.user.organization_id,
      updates,
      auth.user.id
    );
    return jsonOk(settings);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed to update finance settings");
  }
}
