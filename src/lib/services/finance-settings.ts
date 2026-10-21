import { createClient } from "@/lib/supabase/server";
import type { FinanceSettings } from "@/types";

const DEFAULT_WITHHOLDING_TAX_RATE_PERCENT = 3;
const DEFAULT_VAT_RATE_PERCENT = 15;

export async function getFinanceSettings(orgId: string): Promise<FinanceSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("finance_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (data) return data as FinanceSettings;

  const { data: inserted, error } = await supabase
    .from("finance_settings")
    .upsert(
      {
        organization_id: orgId,
        withholding_tax_rate_percent: DEFAULT_WITHHOLDING_TAX_RATE_PERCENT,
        vat_rate_percent: DEFAULT_VAT_RATE_PERCENT,
      },
      { onConflict: "organization_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return inserted as FinanceSettings;
}

export async function updateFinanceSettings(
  orgId: string,
  updates: {
    withholding_tax_rate_percent?: number;
    vat_rate_percent?: number;
  },
  userId: string
): Promise<FinanceSettings> {
  const payload: Record<string, unknown> = {
    organization_id: orgId,
    updated_by: userId,
  };

  if (updates.withholding_tax_rate_percent !== undefined) {
    const rate = updates.withholding_tax_rate_percent;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new Error("Withholding tax rate must be between 0 and 100");
    }
    payload.withholding_tax_rate_percent = rate;
  }

  if (updates.vat_rate_percent !== undefined) {
    const rate = updates.vat_rate_percent;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new Error("VAT rate must be between 0 and 100");
    }
    payload.vat_rate_percent = rate;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_settings")
    .upsert(payload, { onConflict: "organization_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as FinanceSettings;
}

/** @deprecated Use updateFinanceSettings */
export async function updateWithholdingTaxRate(
  orgId: string,
  ratePercent: number,
  userId: string
): Promise<FinanceSettings> {
  return updateFinanceSettings(orgId, { withholding_tax_rate_percent: ratePercent }, userId);
}
