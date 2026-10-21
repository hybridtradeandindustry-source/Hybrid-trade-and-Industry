import type {
  InventoryAppliesTo,
  InventoryCategoryDef,
  InventoryConfig,
  InventoryItem,
  InventoryItemType,
  InventoryUnitDef,
} from "@/types";
import { FACTORY_IDS } from "@/types";

export function slugifyInventory(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function typeAppliesToFactory(
  type: InventoryItemType,
  factoryId: string
): boolean {
  if (type.applies_to === "both") return true;
  if (type.applies_to === "block") return factoryId === FACTORY_IDS.block;
  return factoryId === FACTORY_IDS.recycling;
}

export function getActiveItemTypes(
  config: InventoryConfig,
  factoryId?: string
): InventoryItemType[] {
  return config.itemTypes
    .filter((t) => t.is_active)
    .filter((t) => !factoryId || typeAppliesToFactory(t, factoryId))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function getCategoriesForType(
  config: InventoryConfig,
  itemTypeId: string,
  factoryId?: string
): InventoryCategoryDef[] {
  return config.categories
    .filter((c) => c.is_active && c.item_type_id === itemTypeId)
    .filter((c) => !factoryId || !c.factory_id || c.factory_id === factoryId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getUnitsForType(
  config: InventoryConfig,
  itemTypeId: string
): InventoryUnitDef[] {
  return config.units
    .filter((u) => u.is_active && u.item_type_id === itemTypeId)
    .sort((a, b) => {
      if (a.is_base_unit && !b.is_base_unit) return -1;
      if (!a.is_base_unit && b.is_base_unit) return 1;
      return a.name.localeCompare(b.name);
    });
}

/** Filter catalog config rows visible for a factory (block or recycling). */
export function filterCatalogConfigForFactory<
  T extends InventoryConfig & {
    unitConversions?: unknown[];
    customFieldDefs?: unknown[];
    skuRules?: Array<{ factory_id?: string | null; item_type_id?: string | null; is_active?: boolean }>;
  },
>(config: T, factoryId?: string | null, options?: { includeInactive?: boolean }): T {
  const includeInactive = options?.includeInactive ?? false;

  if (!factoryId) {
    if (includeInactive) return config;
    return {
      ...config,
      itemTypes: config.itemTypes.filter((t) => t.is_active),
      categories: config.categories.filter((c) => c.is_active),
      units: config.units.filter((u) => u.is_active),
      skuRules: (config.skuRules ?? []).filter((r) => r.is_active !== false),
      customFieldDefs: (config.customFieldDefs ?? []).filter((d) => {
        const row = d as { is_active?: boolean };
        return row.is_active !== false;
      }),
      unitConversions: config.unitConversions ?? [],
    };
  }

  const typeIds = new Set(
    config.itemTypes
      .filter(
        (t) => (includeInactive || t.is_active) && typeAppliesToFactory(t, factoryId)
      )
      .map((t) => t.id)
  );

  return {
    ...config,
    itemTypes: config.itemTypes.filter((t) => typeIds.has(t.id)),
    categories: config.categories.filter(
      (c) =>
        (includeInactive || c.is_active) &&
        typeIds.has(c.item_type_id) &&
        (!c.factory_id || c.factory_id === factoryId)
    ),
    units: config.units.filter(
      (u) => (includeInactive || u.is_active) && typeIds.has(u.item_type_id)
    ),
    skuRules: (config.skuRules ?? []).filter(
      (r) =>
        r.is_active !== false &&
        (!r.factory_id || r.factory_id === factoryId) &&
        (!r.item_type_id || typeIds.has(r.item_type_id))
    ),
    customFieldDefs: (config.customFieldDefs ?? []).filter((d) => {
      const row = d as { item_type_id?: string; is_active?: boolean };
      return row.is_active !== false && !!row.item_type_id && typeIds.has(row.item_type_id);
    }),
    unitConversions: (config.unitConversions ?? []).filter((c) => {
      const row = c as { item_type_id?: string };
      return !!row.item_type_id && typeIds.has(row.item_type_id);
    }),
  };
}

export function resolveItemType(
  config: InventoryConfig,
  itemTypeId: string
): InventoryItemType | undefined {
  return config.itemTypes.find((t) => t.id === itemTypeId);
}

export function resolveCategory(
  config: InventoryConfig,
  categoryId: string
): InventoryCategoryDef | undefined {
  return config.categories.find((c) => c.id === categoryId);
}

export function resolveCategoryName(config: InventoryConfig, categoryId: string): string {
  return resolveCategory(config, categoryId)?.name ?? categoryId;
}

export function resolveItemTypeName(config: InventoryConfig, itemTypeId: string): string {
  return resolveItemType(config, itemTypeId)?.name ?? itemTypeId;
}

export function validateInventoryItemFields(
  config: InventoryConfig,
  input: {
    factory_id: string;
    item_type_id: string;
    category_id: string;
    unit: string;
  }
): string | null {
  const type = resolveItemType(config, input.item_type_id);
  if (!type || !type.is_active) return "Invalid item type";

  if (!typeAppliesToFactory(type, input.factory_id)) {
    return "Item type is not available for this factory";
  }

  const category = resolveCategory(config, input.category_id);
  if (!category || !category.is_active) return "Invalid category";
  if (category.item_type_id !== input.item_type_id) {
    return "Category does not belong to the selected item type";
  }
  if (category.factory_id && category.factory_id !== input.factory_id) {
    return "Category is not available for this factory";
  }

  const allowedUnits = getUnitsForType(config, input.item_type_id);
  if (!allowedUnits.some((u) => u.abbreviation === input.unit)) {
    return "Unit is not allowed for this item type";
  }

  return null;
}

export function enrichInventoryItem(
  item: InventoryItem,
  config: InventoryConfig
): InventoryItem & { typeName?: string; categoryName?: string } {
  return {
    ...item,
    typeName: resolveItemTypeName(config, item.item_type_id),
    categoryName: resolveCategoryName(config, item.category_id),
  };
}

export function countItemsUsingType(config: InventoryConfig, items: InventoryItem[], typeId: string) {
  return items.filter((i) => i.is_active && i.item_type_id === typeId).length;
}

export function countItemsUsingCategory(
  config: InventoryConfig,
  items: InventoryItem[],
  categoryId: string
) {
  return items.filter((i) => i.is_active && i.category_id === categoryId).length;
}

export function countItemsUsingUnit(
  config: InventoryConfig,
  items: InventoryItem[],
  itemTypeId: string,
  abbreviation: string
) {
  return items.filter(
    (i) => i.is_active && i.item_type_id === itemTypeId && i.unit === abbreviation
  ).length;
}

export function defaultAppliesToForFactory(factoryId: string): InventoryAppliesTo {
  if (factoryId === FACTORY_IDS.block) return "block";
  if (factoryId === FACTORY_IDS.recycling) return "recycling";
  return "both";
}
