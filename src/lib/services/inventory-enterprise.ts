import { v4 as uuidv4 } from "uuid";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { createClient } from "@/lib/supabase/server";
import {
  computeInventoryIntelligence,
  generateBarcodeValue,
  generateSkuFromRule,
  shouldAutoApproveCount,
} from "@/lib/inventory/inventory-advanced";
import { resolveCategory } from "@/lib/inventory/inventory-config";
import { INV_TYPE_IDS } from "@/lib/inventory/catalog-ids";
import { createStockCount } from "@/lib/services";
import type { PurchaseRequisition } from "@/types/inventory-enterprise";

export async function generateNextSku(
  factoryId: string,
  itemTypeId: string,
  categoryId: string,
  user: ApiUser
) {
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("inventory_sku_rules")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true);

  const rule =
    (rules ?? []).find(
      (r) =>
        (r.factory_id === factoryId || !r.factory_id) &&
        (r.item_type_id === itemTypeId || !r.item_type_id)
    ) ?? rules?.[0];
  if (!rule) return null;

  const { data: categories } = await supabase
    .from("inventory_categories")
    .select("*")
    .eq("organization_id", user.organization_id);
  const cat = resolveCategory(
    { categories: categories ?? [], itemTypes: [], units: [] },
    categoryId
  );
  const { sku, nextSequence } = generateSkuFromRule(rule, cat?.slug);
  await supabase
    .from("inventory_sku_rules")
    .update({ next_sequence: nextSequence })
    .eq("id", rule.id);
  return sku;
}

export async function createPurchaseRequisitionFromReorder(
  factoryId: string,
  user: ApiUser
): Promise<PurchaseRequisition> {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("factory_id", factoryId)
    .eq("is_active", true);
  const { data: movements } = await supabase
    .from("inventory_movements")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("factory_id", factoryId)
    .order("created_at", { ascending: false })
    .limit(200);

  const intel = computeInventoryIntelligence(items ?? [], movements ?? []);
  const lines = intel.smartReorder
    .filter((r) => (items ?? []).some((i) => i.id === r.item_id))
    .slice(0, 5)
    .map((r) => {
      const item = (items ?? []).find((i) => i.id === r.item_id)!;
      return {
        id: uuidv4(),
        requisition_id: "",
        item_id: r.item_id,
        quantity: r.suggested_qty,
        unit: item.unit as string,
        estimated_unit_cost: Number(item.unit_cost ?? 0),
        notes: r.reason,
      };
    });

  const reqId = uuidv4();
  const reqNumber = `PR-${Date.now().toString().slice(-6)}`;
  const { data: req, error } = await supabase
    .from("purchase_requisitions")
    .insert({
      id: reqId,
      organization_id: user.organization_id,
      factory_id: factoryId,
      requisition_number: reqNumber,
      status: "pending_approval",
      notes: "Auto-generated from smart reorder analysis",
      requested_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (lines.length) {
    const { error: lineError } = await supabase.from("purchase_requisition_lines").insert(
      lines.map((l) => ({
        ...l,
        requisition_id: reqId,
      }))
    );
    if (lineError) throw new Error(lineError.message);
  }

  return { ...(req as PurchaseRequisition), lines: lines.map((l) => ({ ...l, requisition_id: reqId })) };
}

export async function reviewCatalogChange(
  id: string,
  status: "approved" | "rejected",
  user: ApiUser,
  notes?: string
) {
  const supabase = await createClient();
  const { data: req, error } = await supabase
    .from("inventory_catalog_change_requests")
    .update({
      status,
      reviewed_by: user.id,
      review_notes: notes,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !req) throw new Error("Request not found");

  if (status === "approved" && req.entity_type === "item_type") {
    const p = req.payload as { name: string; slug?: string; applies_to: string; description?: string };
    const { createInventoryItemTypeRecord } = await import("@/lib/services/inventory-catalog");
    await createInventoryItemTypeRecord(
      { name: p.name, slug: p.slug, applies_to: p.applies_to as "both", description: p.description },
      user
    );
  }
  return req;
}

export async function submitCatalogChangeRequest(
  input: {
    entity_type: string;
    entity_id?: string;
    change_type: string;
    payload: Record<string, unknown>;
    reason?: string;
  },
  user: ApiUser
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_catalog_change_requests")
    .insert({
      organization_id: user.organization_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id ?? null,
      change_type: input.change_type,
      payload: input.payload,
      reason: input.reason,
      status: "pending",
      requested_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function quarantineStock(
  input: { item_id: string; quantity: number; reason: string; lot_id?: string },
  user: ApiUser
) {
  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items").select("*").eq("id", input.item_id).single();
  if (!item) throw new Error("Item not found");

  const { data: hold, error } = await supabase
    .from("inventory_quarantine_holds")
    .insert({
      organization_id: user.organization_id,
      factory_id: item.factory_id,
      item_id: input.item_id,
      lot_id: input.lot_id ?? null,
      quantity: input.quantity,
      reason: input.reason,
      status: "quarantine",
      held_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("inventory_items").update({ stock_status: "quarantine" }).eq("id", input.item_id);
  if (input.lot_id) {
    await supabase.from("inventory_lots").update({ stock_status: "quarantine" }).eq("id", input.lot_id);
  }
  return hold;
}

export async function releaseQuarantine(holdId: string, user: ApiUser) {
  const supabase = await createClient();
  const { data: hold, error } = await supabase
    .from("inventory_quarantine_holds")
    .update({
      released_by: user.id,
      released_at: new Date().toISOString(),
    })
    .eq("id", holdId)
    .select("*")
    .single();
  if (error || !hold) throw new Error("Hold not found");

  await supabase.from("inventory_items").update({ stock_status: "available" }).eq("id", hold.item_id);
  return hold;
}

export async function interFactoryTransfer(
  input: {
    from_factory_id: string;
    to_factory_id: string;
    from_item_id: string;
    to_item_id: string;
    quantity: number;
    notes?: string;
  },
  user: ApiUser
) {
  const { transferInventoryStock } = await import("@/lib/services");
  await transferInventoryStock(
    {
      from_item_id: input.from_item_id,
      to_item_id: input.to_item_id,
      quantity: input.quantity,
      notes: input.notes,
    },
    user
  );

  const supabase = await createClient();
  const { data: transfer, error } = await supabase
    .from("inventory_inter_factory_transfers")
    .insert({
      organization_id: user.organization_id,
      from_factory_id: input.from_factory_id,
      to_factory_id: input.to_factory_id,
      from_item_id: input.from_item_id,
      to_item_id: input.to_item_id,
      quantity: input.quantity,
      status: "completed",
      notes: input.notes,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return transfer;
}

export async function processStockCountWithRules(
  input: {
    factory_id: string;
    item_id: string;
    counted_quantity: number;
    notes?: string;
    is_blind?: boolean;
    schedule_id?: string;
    barcode_scanned?: string;
  },
  user: ApiUser
) {
  const sc = await createStockCount(input, user);
  const supabase = await createClient();
  const { data: rules } = await supabase
    .from("inventory_variance_rules")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true);

  const rule = (rules ?? []).find((r) => !r.factory_id || r.factory_id === input.factory_id);
  if (rule && shouldAutoApproveCount(Number(sc.system_quantity), Number(sc.counted_quantity), rule)) {
    const { executeStockCountApproval } = await import("@/lib/services/inventory");
    const { data: updated, error: approveError } = await supabase
      .from("stock_counts")
      .update({
        status: "approved",
        auto_approved: true,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", sc.id)
      .select("*")
      .single();
    if (approveError) throw new Error(approveError.message);
    const approved = updated ?? sc;
    await executeStockCountApproval(approved, user);
    return approved;
  }
  return sc;
}

export async function syncSageInventoryItem(itemId: string, user: ApiUser) {
  const supabase = await createClient();
  const { data: mapping, error } = await supabase
    .from("sage_inventory_mappings")
    .select("*")
    .eq("item_id", itemId)
    .eq("sync_enabled", true)
    .maybeSingle();
  if (error || !mapping) throw new Error("No Sage mapping for item");

  const { data: updated } = await supabase
    .from("sage_inventory_mappings")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("id", mapping.id)
    .select("*")
    .single();
  return updated ?? mapping;
}

export async function copyItemTypeTemplate(sourceTypeId: string, newName: string, user: ApiUser) {
  const supabase = await createClient();
  const { data: source } = await supabase
    .from("inventory_item_types")
    .select("*")
    .eq("id", sourceTypeId)
    .single();
  if (!source) throw new Error("Source type not found");

  const {
    createInventoryItemTypeRecord,
    createInventoryCategoryRecord,
    createInventoryUnitRecord,
  } = await import("@/lib/services/inventory-catalog");

  const newType = await createInventoryItemTypeRecord(
    { name: newName, applies_to: source.applies_to, description: `Copy of ${source.name}` },
    user
  );

  const [{ data: categories }, { data: units }] = await Promise.all([
    supabase.from("inventory_categories").select("*").eq("item_type_id", sourceTypeId).eq("is_active", true),
    supabase.from("inventory_units").select("*").eq("item_type_id", sourceTypeId).eq("is_active", true),
  ]);

  for (const cat of categories ?? []) {
    await createInventoryCategoryRecord(
      {
        item_type_id: newType.id,
        name: cat.name as string,
        description: (cat.description as string) ?? undefined,
        factory_id: cat.factory_id as string | undefined,
      },
      user
    );
  }
  for (const unit of units ?? []) {
    await createInventoryUnitRecord(
      {
        item_type_id: newType.id,
        name: unit.name as string,
        abbreviation: unit.abbreviation as string,
        is_base_unit: Boolean(unit.is_base_unit),
      },
      user
    );
  }
  return newType;
}

export async function exportCatalogCsv(user: ApiUser): Promise<string> {
  const supabase = await createClient();
  const [{ data: itemTypes }, { data: categories }, { data: units }] = await Promise.all([
    supabase.from("inventory_item_types").select("*").eq("organization_id", user.organization_id),
    supabase.from("inventory_categories").select("*").eq("organization_id", user.organization_id),
    supabase.from("inventory_units").select("*").eq("organization_id", user.organization_id),
  ]);

  const rows = [
    ["entity", "name", "slug", "parent", "factory", "extra"],
    ...(itemTypes ?? []).map((t) => ["type", t.name, t.slug, "", t.applies_to, ""]),
    ...(categories ?? []).map((c) => ["category", c.name, c.slug, c.parent_id ?? "", c.factory_id ?? "", c.item_type_id]),
    ...(units ?? []).map((u) => ["unit", u.name, u.abbreviation, "", "", u.item_type_id]),
  ];
  return rows.map((r) => r.join(",")).join("\n");
}

export async function assignItemBarcode(itemId: string, user: ApiUser) {
  const supabase = await createClient();
  const { data: item } = await supabase.from("inventory_items").select("sku").eq("id", itemId).single();
  if (!item) throw new Error("Item not found");
  const barcode = generateBarcodeValue(item.sku as string);
  await supabase.from("inventory_items").update({ barcode }).eq("id", itemId).eq("organization_id", user.organization_id);
  return barcode;
}

export async function reserveStockForOrder(orderId: string, user: ApiUser) {
  const supabase = await createClient();
  const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
  if (!order) return;

  const { data: fgItems } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("factory_id", order.factory_id)
    .eq("is_active", true)
    .gt("quantity", 0);

  const fg =
    (fgItems ?? []).find((i) => i.item_type_id === INV_TYPE_IDS.fg) ?? fgItems?.[0];
  if (!fg) return;

  const qty = Math.min(100, Math.floor(Number(fg.quantity) * 0.1));
  if (qty > 0) {
    const { reserveInventoryStock } = await import("@/lib/services");
    await reserveInventoryStock({ item_id: fg.id as string, quantity: qty, action: "reserve" }, user);
  }
}
