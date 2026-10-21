"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePurchasing } from "@/hooks/use-api";
import {
  getActiveItemTypes,
  getCategoriesForType,
  getUnitsForType,
  resolveCategoryName,
  resolveItemTypeName,
} from "@/lib/inventory/inventory-config";
import { BLOCK_YIELDS, type BlockSizeCm } from "@/lib/block-factory/yields";
import { FACTORY_IDS, type InventoryConfig, type InventoryItem, type ViewScope } from "@/types";

type ItemFormState = {
  factory_id: string;
  name: string;
  sku: string;
  item_type_id: string;
  category_id: string;
  unit: string;
  quantity: string;
  low_stock_threshold: string;
  reorder_quantity: string;
  unit_cost: string;
  supplier: string;
  location: string;
};

type BlockPreset = "spare_part" | "finished_block" | "custom";

const BLOCK_PRESETS: Array<{ value: BlockPreset; label: string }> = [
  { value: "spare_part", label: "Spare Part / Consumable" },
  { value: "finished_block", label: "Finished Block (new size)" },
  { value: "custom", label: "Other / Custom" },
];

const BLOCK_SIZES = [20, 15, 10, 24] as BlockSizeCm[];

function emptyForm(factoryId: string, config: InventoryConfig): ItemFormState {
  const types = getActiveItemTypes(config, factoryId);
  const firstType = types[0];
  const categories = firstType ? getCategoriesForType(config, firstType.id, factoryId) : [];
  const units = firstType ? getUnitsForType(config, firstType.id) : [];
  return {
    factory_id: factoryId,
    name: "",
    sku: "",
    item_type_id: firstType?.id ?? "",
    category_id: categories[0]?.id ?? "",
    unit: units[0]?.abbreviation ?? "units",
    quantity: "0",
    low_stock_threshold: "",
    reorder_quantity: "",
    unit_cost: "",
    supplier: "",
    location: "",
  };
}

function findTypeBySlug(config: InventoryConfig, slug: string) {
  return config.itemTypes.find((t) => t.slug === slug);
}

function findCategoryBySlug(
  config: InventoryConfig,
  slug: string,
  factoryId: string,
  itemTypeId?: string
) {
  return config.categories.find(
    (c) =>
      c.slug === slug &&
      c.is_active !== false &&
      (!c.factory_id || c.factory_id === factoryId) &&
      (!itemTypeId || c.item_type_id === itemTypeId)
  );
}

function applyBlockPreset(
  preset: BlockPreset,
  config: InventoryConfig,
  factoryId: string,
  blockSize: BlockSizeCm
): Partial<ItemFormState> {
  if (preset === "spare_part") {
    const type = findTypeBySlug(config, "consumables");
    const category = findCategoryBySlug(config, "spare_parts", factoryId, type?.id);
    const units = type ? getUnitsForType(config, type.id) : [];
    return {
      item_type_id: type?.id ?? "",
      category_id: category?.id ?? "",
      unit: units[0]?.abbreviation ?? "units",
      name: "",
      sku: "",
      low_stock_threshold: "5",
      reorder_quantity: "10",
      location: "Spare Parts Storage Area",
    };
  }

  if (preset === "finished_block") {
    const type = findTypeBySlug(config, "finished_goods");
    const category = findCategoryBySlug(config, "concrete_blocks", factoryId, type?.id);
    const units = type ? getUnitsForType(config, type.id) : [];
    const spec = BLOCK_YIELDS[blockSize];
    return {
      item_type_id: type?.id ?? "",
      category_id: category?.id ?? "",
      unit: units[0]?.abbreviation ?? "units",
      name: `Concrete Block ${spec.label}`,
      sku: `BLK-FG-${spec.skuSuffix}`,
      low_stock_threshold: blockSize === 24 ? "800" : blockSize === 10 ? "2500" : "2000",
      reorder_quantity: blockSize === 24 ? "3000" : "5000",
      location: "Finished Goods Storage Area",
    };
  }

  const type = findTypeBySlug(config, "raw_material");
  const category = findCategoryBySlug(config, "cement_binders", factoryId, type?.id);
  const units = type ? getUnitsForType(config, type.id) : [];
  return {
    item_type_id: type?.id ?? "",
    category_id: category?.id ?? "",
    unit: units[0]?.abbreviation ?? "units",
    name: "",
    sku: "",
    low_stock_threshold: "",
    reorder_quantity: "",
    location: "",
  };
}

type InventoryItemFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingItem: InventoryItem | null;
  config: InventoryConfig;
  factoryId: string;
  viewScope: ViewScope;
  isSubmitting: boolean;
  onSubmit: (payload: Record<string, unknown>, editingId?: string) => void;
  onGenerateSku: (input: {
    factory_id: string;
    item_type_id: string;
    category_id: string;
  }) => Promise<string | null>;
};

export function InventoryItemFormDialog({
  open,
  onOpenChange,
  editingItem,
  config,
  factoryId,
  viewScope,
  isSubmitting,
  onSubmit,
  onGenerateSku,
}: InventoryItemFormDialogProps) {
  const { data: purchasingData } = usePurchasing();
  const suppliers = (purchasingData?.suppliers ?? []) as Array<{ id: string; name: string }>;

  const isBlockFactory = factoryId === FACTORY_IDS.block;
  const [generatingSku, setGeneratingSku] = useState(false);
  const [blockPreset, setBlockPreset] = useState<BlockPreset>("spare_part");
  const [blockSize, setBlockSize] = useState<BlockSizeCm>(20);
  const [form, setForm] = useState<ItemFormState>(() => emptyForm(factoryId, config));

  useEffect(() => {
    if (!open) return;
    if (editingItem) {
      setForm({
        factory_id: editingItem.factory_id,
        name: editingItem.name,
        sku: editingItem.sku,
        item_type_id: editingItem.item_type_id,
        category_id: editingItem.category_id,
        unit: editingItem.unit,
        quantity: String(editingItem.quantity),
        low_stock_threshold: String(editingItem.low_stock_threshold ?? ""),
        reorder_quantity: String(editingItem.reorder_quantity ?? ""),
        unit_cost: String(editingItem.unit_cost ?? ""),
        supplier: editingItem.supplier ?? "",
        location: editingItem.location ?? "",
      });
      return;
    }
    const base = emptyForm(factoryId, config);
    if (isBlockFactory) {
      setBlockPreset("spare_part");
      setBlockSize(20);
      setForm({ ...base, ...applyBlockPreset("spare_part", config, factoryId, 20) });
    } else {
      setForm(base);
    }
  }, [open, editingItem, factoryId, config, isBlockFactory]);

  const categories = useMemo(
    () => getCategoriesForType(config, form.item_type_id, form.factory_id),
    [config, form.item_type_id, form.factory_id]
  );

  const units = useMemo(
    () => getUnitsForType(config, form.item_type_id),
    [config, form.item_type_id]
  );

  const itemTypes = useMemo(
    () => getActiveItemTypes(config, form.factory_id),
    [config, form.factory_id]
  );

  const handlePresetChange = (preset: BlockPreset) => {
    setBlockPreset(preset);
    setForm((current) => ({
      ...current,
      ...applyBlockPreset(preset, config, form.factory_id, blockSize),
    }));
  };

  const handleBlockSizeChange = (size: BlockSizeCm) => {
    setBlockSize(size);
    if (blockPreset === "finished_block") {
      setForm((current) => ({
        ...current,
        ...applyBlockPreset("finished_block", config, form.factory_id, size),
      }));
    }
  };

  const handleTypeChange = (itemTypeId: string) => {
    const nextCategories = getCategoriesForType(config, itemTypeId, form.factory_id);
    const nextUnits = getUnitsForType(config, itemTypeId);
    setForm((f) => ({
      ...f,
      item_type_id: itemTypeId,
      category_id: nextCategories[0]?.id ?? "",
      unit: nextUnits[0]?.abbreviation ?? f.unit,
    }));
  };

  const handleFactoryChange = (nextFactoryId: string) => {
    const types = getActiveItemTypes(config, nextFactoryId);
    const firstType = types[0];
    const nextCategories = firstType
      ? getCategoriesForType(config, firstType.id, nextFactoryId)
      : [];
    const nextUnits = firstType ? getUnitsForType(config, firstType.id) : [];
    setForm((f) => ({
      ...f,
      factory_id: nextFactoryId,
      item_type_id: firstType?.id ?? "",
      category_id: nextCategories[0]?.id ?? "",
      unit: nextUnits[0]?.abbreviation ?? "",
    }));
  };

  const generateSku = async () => {
    if (!form.item_type_id || !form.category_id) {
      toast.error("Select item type and category first");
      return;
    }
    setGeneratingSku(true);
    try {
      const sku = await onGenerateSku({
        factory_id: form.factory_id,
        item_type_id: form.item_type_id,
        category_id: form.category_id,
      });
      if (sku) {
        setForm((f) => ({ ...f, sku }));
        toast.success("SKU generated");
      } else {
        toast.error("No SKU rule matched — enter SKU manually or configure Catalog Setup");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate SKU");
    } finally {
      setGeneratingSku(false);
    }
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (!form.sku.trim()) {
      toast.error("SKU code is required");
      return;
    }
    if (!form.item_type_id || !form.category_id) {
      toast.error("Select item type and category");
      return;
    }

    onSubmit(
      {
        factory_id: form.factory_id,
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        item_type_id: form.item_type_id,
        category_id: form.category_id,
        unit: form.unit,
        quantity: Number(form.quantity) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 0,
        reorder_quantity: Number(form.reorder_quantity) || undefined,
        unit_cost: Number(form.unit_cost) || 0,
        supplier: form.supplier.trim() || undefined,
        location: form.location.trim() || undefined,
      },
      editingItem?.id
    );
  };

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editingItem ? "Edit SKU" : "Add SKU"}
      description={
        editingItem
          ? "Update item details and stock settings."
          : "Choose what you are adding, fill in the details, and save — same flow as purchasing."
      }
      submitLabel={editingItem ? "Save Changes" : "Add SKU"}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
    >
      {viewScope === "combined" && (
        <div className="space-y-2">
          <Label>Factory</Label>
          <Select value={form.factory_id} onValueChange={handleFactoryChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={FACTORY_IDS.block}>Block Factory</SelectItem>
              <SelectItem value={FACTORY_IDS.recycling}>Plastic Recycling</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {!editingItem && isBlockFactory && (
        <>
          <div className="space-y-2">
            <Label>What are you adding?</Label>
            <Select
              value={blockPreset}
              onValueChange={(v) => handlePresetChange(v as BlockPreset)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {blockPreset === "finished_block" && (
            <div className="space-y-2">
              <Label>Block Size</Label>
              <Select
                value={String(blockSize)}
                onValueChange={(v) => handleBlockSizeChange(Number(v) as BlockSizeCm)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_SIZES.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {BLOCK_YIELDS[size].label} block
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}

      <div className="space-y-2">
        <Label>Item Type</Label>
        <Select value={form.item_type_id} onValueChange={handleTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {itemTypes.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={form.category_id}
          onValueChange={(categoryId) => setForm((f) => ({ ...f, category_id: categoryId }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Item Name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Hydraulic Pump Seal Kit"
        />
      </div>

      <div className="space-y-2">
        <Label>SKU Code</Label>
        <div className="flex gap-2">
          <Input
            value={form.sku}
            onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
            placeholder="BLK-SP-004"
            className="font-mono"
          />
          {!editingItem && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={generatingSku}
              onClick={() => void generateSku()}
              title="Auto-generate from catalog rules"
            >
              <Sparkles className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Opening Quantity</Label>
          <Input
            type="number"
            min={0}
            value={form.quantity}
            onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Unit</Label>
          <Select value={form.unit} onValueChange={(unit) => setForm((f) => ({ ...f, unit }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.abbreviation}>
                  {u.name} ({u.abbreviation})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Unit Cost (Birr)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.unit_cost}
            onChange={(e) => setForm((f) => ({ ...f, unit_cost: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Storage Location</Label>
          <Input
            value={form.location}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
            placeholder="e.g. Spare Parts Storage Area"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Low Stock Alert</Label>
          <Input
            type="number"
            min={0}
            value={form.low_stock_threshold}
            onChange={(e) => setForm((f) => ({ ...f, low_stock_threshold: e.target.value }))}
            placeholder="Minimum before warning"
          />
        </div>
        <div className="space-y-2">
          <Label>Reorder Quantity</Label>
          <Input
            type="number"
            min={0}
            value={form.reorder_quantity}
            onChange={(e) => setForm((f) => ({ ...f, reorder_quantity: e.target.value }))}
            placeholder="Suggested purchase qty"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Supplier (optional)</Label>
        {suppliers.length > 0 ? (
          <Select
            value={form.supplier || "__none__"}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, supplier: v === "__none__" ? "" : v }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={form.supplier}
            onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
            placeholder="Supplier name"
          />
        )}
      </div>

      {form.item_type_id && form.category_id && (
        <p className="text-xs text-muted-foreground">
          {resolveItemTypeName(config, form.item_type_id)} ·{" "}
          {resolveCategoryName(config, form.category_id)}
        </p>
      )}
    </EntityFormDialog>
  );
}
