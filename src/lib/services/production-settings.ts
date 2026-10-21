import { createClient } from "@/lib/supabase/server";
import type { ProductionSettings } from "@/types";

const DEFAULT_DAILY_TARGET_PLATES = 650;
const DEFAULT_CEMENT_KG_PER_BAG = 45;

export async function getProductionSettings(orgId: string): Promise<ProductionSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("production_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (data) return data as ProductionSettings;

  const { data: inserted, error } = await supabase
    .from("production_settings")
    .upsert(
      {
        organization_id: orgId,
        default_daily_target_plates: DEFAULT_DAILY_TARGET_PLATES,
        cement_kg_per_bag: DEFAULT_CEMENT_KG_PER_BAG,
      },
      { onConflict: "organization_id" }
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return inserted as ProductionSettings;
}

export async function updateProductionSettings(
  orgId: string,
  updates: { default_daily_target_plates?: number; cement_kg_per_bag?: number },
  userId: string
): Promise<ProductionSettings> {
  const payload: Record<string, unknown> = { organization_id: orgId, updated_by: userId };

  if (updates.default_daily_target_plates !== undefined) {
    if (!Number.isFinite(updates.default_daily_target_plates) || updates.default_daily_target_plates <= 0) {
      throw new Error("Default daily target must be a positive number");
    }
    payload.default_daily_target_plates = updates.default_daily_target_plates;
  }

  if (updates.cement_kg_per_bag !== undefined) {
    if (!Number.isFinite(updates.cement_kg_per_bag) || updates.cement_kg_per_bag <= 0) {
      throw new Error("Cement kg per bag must be a positive number");
    }
    payload.cement_kg_per_bag = updates.cement_kg_per_bag;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("production_settings")
    .upsert(payload, { onConflict: "organization_id" })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as ProductionSettings;
}
