import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeCapacity, emptyCapacity } from "@/lib/ai/capacity";
import { getProductionIntelligence } from "@/lib/services/production-intelligence";
import { getProductionSettings } from "@/lib/services/production-settings";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { FACTORY_IDS } from "@/types";
import type { CapacityResult } from "@/types/production-intelligence";

async function readCementPolicheStock(orgId: string, factoryId: string) {
  // Service client avoids RLS gaps so Refresh always sees the same stock as Inventory.
  const supabase = await createServiceClient();
  const [{ data: items, error }, settings] = await Promise.all([
    supabase
      .from("inventory_items")
      .select("sku, quantity, unit")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .eq("is_active", true)
      .in("sku", [BLOCK_FACTORY_SKUS.cement, BLOCK_FACTORY_SKUS.poliche]),
    getProductionSettings(orgId),
  ]);

  if (error) throw new Error(error.message);

  // Sum matching SKUs in case duplicates exist; prefer exact system SKUs.
  const sumSku = (sku: string) =>
    (items ?? [])
      .filter((i) => i.sku === sku)
      .reduce((sum, i) => sum + Number(i.quantity ?? 0), 0);

  const cementBags = sumSku(BLOCK_FACTORY_SKUS.cement);
  const policheLoads = sumSku(BLOCK_FACTORY_SKUS.poliche);

  return {
    cementBags,
    cementKg: cementBags * settings.cement_kg_per_bag,
    policheLoads,
  };
}

export async function getCurrentCapacity(
  orgId: string,
  factoryId: string = FACTORY_IDS.block,
  options?: { live?: boolean; persist?: boolean }
): Promise<CapacityResult> {
  if (!options?.live) {
    const supabase = await createClient();
    const { data: snapshot } = await supabase
      .from("capacity_snapshots")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .maybeSingle();

    if (snapshot?.predictions) {
      return {
        organization_id: orgId,
        factory_id: factoryId,
        computed_at: snapshot.computed_at,
        inventory: snapshot.inventory as CapacityResult["inventory"],
        predictions: snapshot.predictions as CapacityResult["predictions"],
        limiting_factor: snapshot.limiting_factor,
        confidence: Number(snapshot.confidence ?? 0.5),
        sample_batches: 0,
        from_snapshot: true,
      };
    }
  }

  try {
    const [stock, intelligence] = await Promise.all([
      readCementPolicheStock(orgId, factoryId),
      getProductionIntelligence(orgId, factoryId, { live: options?.live }),
    ]);

    const result = computeCapacity({
      organizationId: orgId,
      factoryId,
      cementBags: stock.cementBags,
      cementKg: stock.cementKg,
      policheLoads: stock.policheLoads,
      intelligence,
    });
    result.sample_batches = intelligence.sample_batches;

    if (options?.persist !== false) {
      const service = await createServiceClient();
      const { error } = await service.from("capacity_snapshots").upsert(
        {
          organization_id: orgId,
          factory_id: factoryId,
          computed_at: result.computed_at,
          inventory: result.inventory,
          predictions: result.predictions,
          limiting_factor: result.limiting_factor,
          confidence: result.confidence,
        },
        { onConflict: "organization_id,factory_id" }
      );
      if (error) {
        console.warn("[ai] failed to upsert capacity snapshot:", error.message);
      }
    }

    return result;
  } catch (err) {
    console.warn("[ai] capacity compute failed:", err);
    return emptyCapacity(orgId, factoryId);
  }
}
