import { requireSupabase } from "@/lib/config";
import { slugifyInventory } from "@/lib/inventory/inventory-config";
import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/demo-auth";
import type {
  InventoryAppliesTo,
  InventoryCategoryDef,
  InventoryItemType,
  InventoryUnitDef,
} from "@/types";

async function assertItemTypeSlugAvailable(
  orgId: string,
  slug: string,
  excludeId?: string
): Promise<void> {
  const supabase = await createClient();
  let query = supabase
    .from("inventory_item_types")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  if (data) throw new Error("Item type slug already exists");
}

async function assertCategorySlugAvailable(
  itemTypeId: string,
  slug: string,
  excludeId?: string
): Promise<void> {
  const supabase = await createClient();
  let query = supabase
    .from("inventory_categories")
    .select("id")
    .eq("item_type_id", itemTypeId)
    .eq("slug", slug);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query.maybeSingle();
  if (data) throw new Error("Category slug already exists for this item type");
}

async function countItemsUsingType(orgId: string, typeId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("item_type_id", typeId)
    .eq("is_active", true);
  return count ?? 0;
}

async function countItemsUsingCategory(orgId: string, categoryId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("category_id", categoryId)
    .eq("is_active", true);
  return count ?? 0;
}

async function countItemsUsingUnit(
  orgId: string,
  itemTypeId: string,
  abbreviation: string
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("item_type_id", itemTypeId)
    .eq("unit", abbreviation)
    .eq("is_active", true);
  return count ?? 0;
}

export async function createInventoryItemTypeRecord(
  input: {
    name: string;
    slug?: string;
    description?: string;
    applies_to: InventoryAppliesTo;
    sort_order?: number;
  },
  user: ApiUser
): Promise<InventoryItemType> {
  

  const slug = input.slug?.trim() || slugifyInventory(input.name);
  await assertItemTypeSlugAvailable(user.organization_id, slug);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item_types")
    .insert({
      organization_id: user.organization_id,
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      applies_to: input.applies_to,
      sort_order: input.sort_order ?? 0,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryItemType;
}

export async function updateInventoryItemTypeRecord(
  id: string,
  input: Partial<Pick<InventoryItemType, "name" | "description" | "applies_to" | "sort_order" | "is_active">>,
  user: ApiUser
): Promise<InventoryItemType> {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item_types")
    .update({
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.applies_to != null ? { applies_to: input.applies_to } : {}),
      ...(input.sort_order != null ? { sort_order: input.sort_order } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryItemType;
}

export async function deactivateInventoryItemTypeRecord(id: string, user: ApiUser): Promise<void> {
  

  const inUse = await countItemsUsingType(user.organization_id, id);
  if (inUse > 0) throw new Error("Cannot delete item type while SKUs are assigned to it");

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_item_types")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
}

export async function reactivateInventoryItemTypeRecord(
  id: string,
  user: ApiUser
): Promise<InventoryItemType> {
  return updateInventoryItemTypeRecord(id, { is_active: true }, user);
}

export async function createInventoryCategoryRecord(
  input: {
    item_type_id: string;
    name: string;
    slug?: string;
    description?: string;
    factory_id?: string | null;
  },
  user: ApiUser
): Promise<InventoryCategoryDef> {
  

  const slug = input.slug?.trim() || slugifyInventory(input.name);
  await assertCategorySlugAvailable(input.item_type_id, slug);

  const supabase = await createClient();
  const { data: typeRow, error: typeError } = await supabase
    .from("inventory_item_types")
    .select("id")
    .eq("id", input.item_type_id)
    .eq("organization_id", user.organization_id)
    .eq("is_active", true)
    .maybeSingle();
  if (typeError) throw new Error(typeError.message);
  if (!typeRow) throw new Error("Item type not found");

  const { data, error } = await supabase
    .from("inventory_categories")
    .insert({
      organization_id: user.organization_id,
      item_type_id: input.item_type_id,
      name: input.name.trim(),
      slug,
      description: input.description ?? null,
      factory_id: input.factory_id ?? null,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryCategoryDef;
}

export async function updateInventoryCategoryRecord(
  id: string,
  input: Partial<Pick<InventoryCategoryDef, "name" | "description" | "factory_id" | "is_active">>,
  user: ApiUser
): Promise<InventoryCategoryDef> {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_categories")
    .update({
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.factory_id !== undefined ? { factory_id: input.factory_id } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryCategoryDef;
}

export async function deactivateInventoryCategoryRecord(id: string, user: ApiUser): Promise<void> {
  

  const inUse = await countItemsUsingCategory(user.organization_id, id);
  if (inUse > 0) throw new Error("Cannot delete category while SKUs are assigned to it");

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_categories")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
}

async function assertItemTypeActiveForCatalog(orgId: string, itemTypeId: string): Promise<void> {
  const supabase = await createClient();
  const { data: typeRow } = await supabase
    .from("inventory_item_types")
    .select("is_active")
    .eq("id", itemTypeId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!typeRow) throw new Error("Item type not found");
  if (!typeRow.is_active) {
    throw new Error("Cannot reactivate entry while its item type is inactive");
  }
}

export async function reactivateInventoryCategoryRecord(
  id: string,
  user: ApiUser
): Promise<InventoryCategoryDef> {
  

  const supabase = await createClient();
  const { data: category } = await supabase
    .from("inventory_categories")
    .select("item_type_id")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (!category) throw new Error("Category not found");

  await assertItemTypeActiveForCatalog(user.organization_id, category.item_type_id as string);
  return updateInventoryCategoryRecord(id, { is_active: true }, user);
}

export async function createInventoryUnitRecord(
  input: {
    item_type_id: string;
    name: string;
    abbreviation: string;
    is_base_unit?: boolean;
  },
  user: ApiUser
): Promise<InventoryUnitDef> {
  

  const abbreviation = input.abbreviation.trim();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("inventory_units")
    .select("id")
    .eq("item_type_id", input.item_type_id)
    .eq("abbreviation", abbreviation)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) throw new Error("Unit abbreviation already exists for this item type");

  const { data, error } = await supabase
    .from("inventory_units")
    .insert({
      organization_id: user.organization_id,
      item_type_id: input.item_type_id,
      name: input.name.trim(),
      abbreviation,
      is_base_unit: input.is_base_unit ?? false,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryUnitDef;
}

export async function updateInventoryUnitRecord(
  id: string,
  input: Partial<Pick<InventoryUnitDef, "name" | "abbreviation" | "is_base_unit" | "is_active">>,
  user: ApiUser
): Promise<InventoryUnitDef> {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_units")
    .update({
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.abbreviation != null ? { abbreviation: input.abbreviation.trim() } : {}),
      ...(input.is_base_unit != null ? { is_base_unit: input.is_base_unit } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as InventoryUnitDef;
}

export async function deactivateInventoryUnitRecord(id: string, user: ApiUser): Promise<void> {
  

  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("inventory_units")
    .select("item_type_id, abbreviation")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (!unit) throw new Error("Unit not found");

  const inUse = await countItemsUsingUnit(
    user.organization_id,
    unit.item_type_id as string,
    unit.abbreviation as string
  );
  if (inUse > 0) throw new Error("Cannot delete unit while SKUs use it");

  const { error } = await supabase
    .from("inventory_units")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
}

export async function reactivateInventoryUnitRecord(
  id: string,
  user: ApiUser
): Promise<InventoryUnitDef> {
  

  const supabase = await createClient();
  const { data: unit } = await supabase
    .from("inventory_units")
    .select("item_type_id, abbreviation")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (!unit) throw new Error("Unit not found");

  await assertItemTypeActiveForCatalog(user.organization_id, unit.item_type_id as string);

  const { data: existing } = await supabase
    .from("inventory_units")
    .select("id")
    .eq("item_type_id", unit.item_type_id)
    .eq("abbreviation", unit.abbreviation)
    .eq("is_active", true)
    .neq("id", id)
    .maybeSingle();
  if (existing) {
    throw new Error("An active unit with this abbreviation already exists for this item type");
  }

  return updateInventoryUnitRecord(id, { is_active: true }, user);
}

export async function createSkuRuleRecord(
  input: {
    factory_id?: string | null;
    item_type_id?: string | null;
    prefix: string;
    separator?: string;
    sequence_pad?: number;
    next_sequence?: number;
  },
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_sku_rules")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      item_type_id: input.item_type_id ?? null,
      prefix: input.prefix.trim().toUpperCase(),
      separator: input.separator ?? "-",
      sequence_pad: input.sequence_pad ?? 3,
      next_sequence: input.next_sequence ?? 1,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateSkuRuleRecord(
  id: string,
  input: Partial<{
    prefix: string;
    separator: string;
    sequence_pad: number;
    next_sequence: number;
    is_active: boolean;
  }>,
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_sku_rules")
    .update({
      ...(input.prefix != null ? { prefix: input.prefix.trim().toUpperCase() } : {}),
      ...(input.separator != null ? { separator: input.separator } : {}),
      ...(input.sequence_pad != null ? { sequence_pad: input.sequence_pad } : {}),
      ...(input.next_sequence != null ? { next_sequence: input.next_sequence } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deactivateSkuRuleRecord(id: string, user: ApiUser): Promise<void> {
  

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_sku_rules")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
}

export async function createCustomFieldDefRecord(
  input: {
    item_type_id: string;
    field_key: string;
    field_label: string;
    field_type: "text" | "number" | "select" | "date";
    is_required?: boolean;
    options?: string[];
    sort_order?: number;
  },
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_custom_field_definitions")
    .insert({
      organization_id: user.organization_id,
      item_type_id: input.item_type_id,
      field_key: input.field_key.trim(),
      field_label: input.field_label.trim(),
      field_type: input.field_type,
      is_required: input.is_required ?? false,
      options: input.options ?? null,
      sort_order: input.sort_order ?? 0,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateCustomFieldDefRecord(
  id: string,
  input: Partial<{
    field_label: string;
    field_type: "text" | "number" | "select" | "date";
    is_required: boolean;
    options: string[];
    sort_order: number;
    is_active: boolean;
  }>,
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_custom_field_definitions")
    .update({
      ...(input.field_label != null ? { field_label: input.field_label.trim() } : {}),
      ...(input.field_type != null ? { field_type: input.field_type } : {}),
      ...(input.is_required != null ? { is_required: input.is_required } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
      ...(input.sort_order != null ? { sort_order: input.sort_order } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deactivateCustomFieldDefRecord(id: string, user: ApiUser): Promise<void> {
  

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_custom_field_definitions")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
}

export async function createUnitConversionRecord(
  input: { item_type_id: string; from_unit: string; to_unit: string; factor: number },
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_unit_conversions")
    .insert({
      organization_id: user.organization_id,
      item_type_id: input.item_type_id,
      from_unit: input.from_unit.trim(),
      to_unit: input.to_unit.trim(),
      factor: input.factor,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteUnitConversionRecord(id: string, user: ApiUser): Promise<void> {
  

  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_unit_conversions")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
}
