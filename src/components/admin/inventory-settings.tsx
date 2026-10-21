"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  Settings2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInventoryCatalog } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { filterCatalogConfigForFactory, slugifyInventory } from "@/lib/inventory/inventory-config";
import {
  factoryBadgeClass,
  factoryName,
  factoryScopeLabel,
  getTypeVisual,
} from "@/lib/inventory/catalog-visuals";
import { cn } from "@/lib/utils";
import { CatalogAdvancedSettings } from "@/components/admin/catalog-advanced-settings";
import { BlockYieldSettingsPanel } from "@/components/admin/block-yield-settings-panel";
import { DailyTargetSettingsPanel } from "@/components/admin/daily-target-settings-panel";
import type {
  InventoryAppliesTo,
  InventoryCategoryDef,
  InventoryConfig,
  InventoryItemType,
  InventoryUnitDef,
} from "@/types";
import type { ExtendedInventoryConfig } from "@/types/inventory-enterprise";
import { FACTORY_IDS } from "@/types";

const APPLIES_TO: { value: InventoryAppliesTo; label: string; hint: string }[] = [
  { value: "both", label: "Both", hint: "Block + Recycling" },
  { value: "block", label: "Block", hint: "Block Factory only" },
  { value: "recycling", label: "Recycling", hint: "Plastic Recycling only" },
];

type DeleteTarget =
  | { kind: "type"; id: string; name: string }
  | { kind: "category"; id: string; name: string }
  | { kind: "unit"; id: string; name: string };

function ScopePills({
  value,
  onChange,
}: {
  value: InventoryAppliesTo;
  onChange: (v: InventoryAppliesTo) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {APPLIES_TO.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-lg border px-3 py-2 text-left transition-all",
            value === opt.value
              ? "border-primary bg-primary/10 ring-1 ring-primary/20"
              : "border-border/60 hover:border-primary/30 hover:bg-muted/30"
          )}
        >
          <p className="text-sm font-medium">{opt.label}</p>
          <p className="text-[10px] text-muted-foreground">{opt.hint}</p>
        </button>
      ))}
    </div>
  );
}

type CatalogFactoryScope = "all" | typeof FACTORY_IDS.block | typeof FACTORY_IDS.recycling;

const FACTORY_TABS: { value: CatalogFactoryScope; label: string }[] = [
  { value: "all", label: "Both Factories" },
  { value: FACTORY_IDS.block, label: "Block Factory" },
  { value: FACTORY_IDS.recycling, label: "Plastic Recycling" },
];

export function InventorySettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = useAuth();
  const canManage =
    hasPermission("admin", "manage") || hasPermission("inventory", "configure");
  const canApprove =
    hasPermission("admin", "manage") || hasPermission("inventory", "approve_catalog");
  const { data, isLoading, mutate, refetch } = useInventoryCatalog();

  const [factoryScope, setFactoryScope] = useState<CatalogFactoryScope>("all");

  const fullConfig = (data?.config ?? { itemTypes: [], categories: [], units: [] }) as ExtendedInventoryConfig;
  const config = useMemo(
    () =>
      filterCatalogConfigForFactory(
        fullConfig,
        factoryScope === "all" ? null : factoryScope,
        { includeInactive: true }
      ),
    [fullConfig, factoryScope]
  );
  const itemTypes = config.itemTypes ?? [];
  const categories = config.categories ?? [];
  const units = config.units ?? [];
  const skuCount = ((data?.items ?? []) as unknown[]).length;

  const activeTypes = useMemo(() => itemTypes.filter((t) => t.is_active), [itemTypes]);

  const [search, setSearch] = useState("");
  const [selectedTypeId, setSelectedTypeId] = useState<string>("");

  const filteredTypes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return itemTypes.filter(
      (t) =>
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.slug.includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false)
    );
  }, [itemTypes, search]);

  const selectedType = itemTypes.find((t) => t.id === selectedTypeId) ?? filteredTypes[0] ?? null;

  useEffect(() => {
    if (!selectedTypeId && filteredTypes[0]) setSelectedTypeId(filteredTypes[0].id);
    if (selectedTypeId && !itemTypes.some((t) => t.id === selectedTypeId)) {
      setSelectedTypeId(filteredTypes[0]?.id ?? "");
    }
  }, [filteredTypes, itemTypes, selectedTypeId]);

  const typeCategories = useMemo(
    () => (selectedType ? categories.filter((c) => c.item_type_id === selectedType.id) : []),
    [categories, selectedType]
  );
  const typeUnits = useMemo(
    () => (selectedType ? units.filter((u) => u.item_type_id === selectedType.id) : []),
    [units, selectedType]
  );

  const [typeDialog, setTypeDialog] = useState(false);
  const [editingType, setEditingType] = useState<InventoryItemType | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "",
    slug: "",
    description: "",
    applies_to: "both" as InventoryAppliesTo,
    sort_order: "1",
  });

  const [categoryDialog, setCategoryDialog] = useState(false);
  const [editingCategory, setEditingCategory] = useState<InventoryCategoryDef | null>(null);
  const [categoryForm, setCategoryForm] = useState({
    item_type_id: "",
    name: "",
    slug: "",
    description: "",
    factory_id: "all",
  });

  const [unitDialog, setUnitDialog] = useState(false);
  const [editingUnit, setEditingUnit] = useState<InventoryUnitDef | null>(null);
  const [unitForm, setUnitForm] = useState({
    item_type_id: "",
    name: "",
    abbreviation: "",
    is_base_unit: false,
  });

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const resetTypeForm = () => {
    const defaultAppliesTo: InventoryAppliesTo =
      factoryScope === FACTORY_IDS.block
        ? "block"
        : factoryScope === FACTORY_IDS.recycling
          ? "recycling"
          : "both";
    setTypeForm({
      name: "",
      slug: "",
      description: "",
      applies_to: defaultAppliesTo,
      sort_order: String(activeTypes.length + 1),
    });
    setEditingType(null);
  };

  const openCreateType = () => {
    resetTypeForm();
    setTypeDialog(true);
  };

  const openEditType = (type: InventoryItemType) => {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      slug: type.slug,
      description: type.description ?? "",
      applies_to: type.applies_to,
      sort_order: String(type.sort_order),
    });
    setTypeDialog(true);
  };

  const submitType = () => {
    if (!typeForm.name.trim()) return toast.error("Name is required");
    mutate.mutate(
      {
        action: editingType ? "update_item_type" : "create_item_type",
        ...(editingType ? { id: editingType.id } : {}),
        name: typeForm.name.trim(),
        slug: typeForm.slug.trim() || slugifyInventory(typeForm.name),
        description: typeForm.description || undefined,
        applies_to: typeForm.applies_to,
        sort_order: Number(typeForm.sort_order) || 1,
      },
      {
        onSuccess: () => {
          toast.success(editingType ? "Item type updated" : "Item type created");
          setTypeDialog(false);
          resetTypeForm();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const openCreateCategory = (typeId?: string) => {
    setEditingCategory(null);
    setCategoryForm({
      item_type_id: typeId ?? selectedType?.id ?? activeTypes[0]?.id ?? "",
      name: "",
      slug: "",
      description: "",
      factory_id:
        factoryScope === "all"
          ? "all"
          : factoryScope,
    });
    setCategoryDialog(true);
  };

  const openEditCategory = (category: InventoryCategoryDef) => {
    setEditingCategory(category);
    setCategoryForm({
      item_type_id: category.item_type_id,
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      factory_id: category.factory_id ?? "all",
    });
    setCategoryDialog(true);
  };

  const submitCategory = () => {
    if (!categoryForm.name.trim() || !categoryForm.item_type_id) {
      return toast.error("Name and item type are required");
    }
    mutate.mutate(
      {
        action: editingCategory ? "update_category" : "create_category",
        ...(editingCategory ? { id: editingCategory.id } : {}),
        item_type_id: categoryForm.item_type_id,
        name: categoryForm.name.trim(),
        slug: categoryForm.slug.trim() || slugifyInventory(categoryForm.name),
        description: categoryForm.description || undefined,
        factory_id: categoryForm.factory_id === "all" ? null : categoryForm.factory_id,
      },
      {
        onSuccess: () => {
          toast.success(editingCategory ? "Category updated" : "Category created");
          setCategoryDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const openCreateUnit = (typeId?: string) => {
    setEditingUnit(null);
    setUnitForm({
      item_type_id: typeId ?? selectedType?.id ?? activeTypes[0]?.id ?? "",
      name: "",
      abbreviation: "",
      is_base_unit: false,
    });
    setUnitDialog(true);
  };

  const openEditUnit = (unit: InventoryUnitDef) => {
    setEditingUnit(unit);
    setUnitForm({
      item_type_id: unit.item_type_id,
      name: unit.name,
      abbreviation: unit.abbreviation,
      is_base_unit: unit.is_base_unit ?? false,
    });
    setUnitDialog(true);
  };

  const submitUnit = () => {
    if (!unitForm.name.trim() || !unitForm.abbreviation.trim() || !unitForm.item_type_id) {
      return toast.error("Item type, name, and abbreviation are required");
    }
    mutate.mutate(
      {
        action: editingUnit ? "update_unit" : "create_unit",
        ...(editingUnit ? { id: editingUnit.id } : {}),
        item_type_id: unitForm.item_type_id,
        name: unitForm.name.trim(),
        abbreviation: unitForm.abbreviation.trim(),
        is_base_unit: unitForm.is_base_unit,
      },
      {
        onSuccess: () => {
          toast.success(editingUnit ? "Unit updated" : "Unit created");
          setUnitDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const actionMap = {
      type: "delete_item_type",
      category: "delete_category",
      unit: "delete_unit",
    } as const;
    mutate.mutate(
      { action: actionMap[deleteTarget.kind], id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success(`${deleteTarget.name} deactivated`);
          setDeleteTarget(null);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const reactivateEntry = (kind: "type" | "category" | "unit", id: string, name: string) => {
    const actionMap = {
      type: "reactivate_item_type",
      category: "reactivate_category",
      unit: "reactivate_unit",
    } as const;
    mutate.mutate(
      { action: actionMap[kind], id },
      {
        onSuccess: () => toast.success(`${name} reactivated`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  if (!canManage) {
    return (
      <EmptyState
        title="Catalog access required"
        description="You need inventory.configure or admin permissions to manage the inventory catalog."
      />
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <PageHeader
          title="Inventory Catalog"
          description="Design your product taxonomy — types, categories, and units flow into every SKU."
          actions={
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/dashboard/inventory">
                  <ArrowLeft className="size-4" />
                  Inventory
                </Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="size-4" />
                Refresh
              </Button>
              <Button size="sm" onClick={openCreateType}>
                <Plus className="size-4" />
                New Type
              </Button>
            </div>
          }
        />
      )}

      {/* Hero strip */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
        <div className="absolute -right-8 -top-8 size-40 rounded-full bg-primary/[0.05] blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-primary">
              <Sparkles className="size-4" />
              <span className="text-xs font-semibold uppercase tracking-widest">Catalog Blueprint</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight">Type → Category → Unit → SKU</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Select a factory scope, then pick a type to manage its categories and units. Block and Recycling can share types or use factory-specific categories.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="gap-1 bg-background/60">
              <Layers className="size-3" /> Types
            </Badge>
            <ArrowRight className="size-3" />
            <Badge variant="outline" className="gap-1 bg-background/60">
              <Package className="size-3" /> Categories
            </Badge>
            <ArrowRight className="size-3" />
            <Badge variant="outline" className="gap-1 bg-background/60">
              <Ruler className="size-3" /> Units
            </Badge>
          </div>
        </div>
      </div>

      <Tabs
        value={factoryScope}
        onValueChange={(v) => setFactoryScope(v as CatalogFactoryScope)}
      >
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          {FACTORY_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Item Types" value={activeTypes.length} icon={<Layers className="size-4" />} loading={isLoading} info="Number of active top-level inventory item type classifications." />
        <MetricCard title="Categories" value={categories.filter((c) => c.is_active).length} icon={<Package className="size-4" />} loading={isLoading} info="Number of active inventory categories used to organize items." />
        <MetricCard title="Units" value={units.filter((u) => u.is_active).length} icon={<Ruler className="size-4" />} loading={isLoading} info="Number of active units of measure defined for inventory items." />
        <MetricCard title="Active SKUs" value={skuCount} icon={<Sparkles className="size-4" />} loading={isLoading} info="Number of active inventory item SKUs in the catalog." />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(260px,320px)_1fr]">
        {/* Type sidebar */}
        <Card className="border-border/60 bg-card/50 lg:max-h-[720px] lg:overflow-hidden">
          <CardHeader className="space-y-3 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Item Types</CardTitle>
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={openCreateType}>
                <Plus className="size-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search types..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2 lg:max-h-[560px] lg:overflow-y-auto">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
            ) : filteredTypes.length === 0 ? (
              <EmptyState title="No types found" description="Create your first item type to begin." action={<Button size="sm" onClick={openCreateType}>Add Type</Button>} />
            ) : (
              filteredTypes.map((type) => {
                const visual = getTypeVisual(type);
                const Icon = visual.icon;
                const catCount = categories.filter((c) => c.item_type_id === type.id && c.is_active).length;
                const unitCount = units.filter((u) => u.item_type_id === type.id && u.is_active).length;
                const selected = selectedType?.id === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedTypeId(type.id)}
                    className={cn(
                      "relative w-full overflow-hidden rounded-xl border p-3 text-left transition-all",
                      selected ? cn("shadow-md ring-2", visual.ring) : "hover:border-primary/25 hover:shadow-sm",
                      !type.is_active && "opacity-50"
                    )}
                  >
                    <div className={cn("absolute inset-0 bg-gradient-to-br opacity-35", visual.gradient)} />
                    <div className="relative flex items-start gap-3">
                      <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", visual.iconBg, visual.iconColor)}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{type.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{factoryScopeLabel(type.applies_to)}</p>
                        <div className="mt-2 flex gap-2 text-[10px] text-muted-foreground">
                          <span>{catCount} cat</span>
                          <span>·</span>
                          <span>{unitCount} units</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Detail panel */}
        <Card className="border-border/60 bg-card/50">
          {!selectedType ? (
            <CardContent className="py-16">
              <EmptyState title="Select an item type" description="Choose a type from the list to edit its catalog structure." />
            </CardContent>
          ) : (
            <>
              {(() => {
                const visual = getTypeVisual(selectedType);
                const Icon = visual.icon;
                return (
                  <CardHeader className="relative overflow-hidden border-b border-border/40 pb-6">
                    <div className={cn("absolute inset-0 bg-gradient-to-br opacity-25", visual.gradient)} />
                    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className={cn("flex size-14 items-center justify-center rounded-2xl", visual.iconBg, visual.iconColor)}>
                          <Icon className="size-7" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-2xl">{selectedType.name}</CardTitle>
                            {!selectedType.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                          </div>
                          <CardDescription className="mt-1 max-w-lg">
                            {selectedType.description ?? "No description yet."}
                          </CardDescription>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Badge variant="outline">{factoryScopeLabel(selectedType.applies_to)}</Badge>
                            <Badge variant="outline" className="font-mono text-[10px]">{selectedType.slug}</Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEditType(selectedType)}>Edit Type</Button>
                        {selectedType.is_active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => setDeleteTarget({ kind: "type", id: selectedType.id, name: selectedType.name })}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => reactivateEntry("type", selectedType.id, selectedType.name)}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                );
              })()}

              <CardContent className="space-y-8 pt-6">
                {/* Categories */}
                <section>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Categories</h3>
                      <p className="text-xs text-muted-foreground">Sub-groups SKUs within this type</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openCreateCategory(selectedType.id)}>
                      <Plus className="size-3.5" />
                      Add Category
                    </Button>
                  </div>
                  {typeCategories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                      No categories yet — add one to classify SKUs under {selectedType.name}.
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {typeCategories.map((cat) => (
                        <div
                          key={cat.id}
                          className={cn(
                            "group rounded-xl border border-border/50 bg-muted/10 p-4 transition hover:border-primary/20 hover:bg-muted/20",
                            !cat.is_active && "opacity-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{cat.name}</p>
                                {!cat.is_active ? <Badge variant="secondary">Inactive</Badge> : null}
                              </div>
                              <p className="mt-0.5 text-xs text-muted-foreground">{cat.description ?? cat.slug}</p>
                            </div>
                            <Badge className={cn("shrink-0 text-[10px]", factoryBadgeClass(cat.factory_id))}>
                              {factoryName(cat.factory_id)}
                            </Badge>
                          </div>
                          <div
                            className={cn(
                              "mt-3 flex gap-2",
                              cat.is_active ? "opacity-0 transition group-hover:opacity-100" : "opacity-100"
                            )}
                          >
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => openEditCategory(cat)}>
                              Edit
                            </Button>
                            {cat.is_active ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-destructive"
                                onClick={() => setDeleteTarget({ kind: "category", id: cat.id, name: cat.name })}
                              >
                                Deactivate
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-primary"
                                onClick={() => reactivateEntry("category", cat.id, cat.name)}
                              >
                                Reactivate
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <Separator />

                {/* Units */}
                <section>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">Units of Measure</h3>
                      <p className="text-xs text-muted-foreground">Only these units can be used on SKUs of this type</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => openCreateUnit(selectedType.id)}>
                      <Plus className="size-3.5" />
                      Add Unit
                    </Button>
                  </div>
                  {typeUnits.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                      No units defined — add kg, units, pallet, or any measure for this type.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {typeUnits.map((unit) => (
                        <div
                          key={unit.id}
                          className={cn(
                            "group inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1.5 transition hover:border-primary/30",
                            !unit.is_active && "opacity-50"
                          )}
                        >
                          <span className="font-mono text-sm font-semibold text-primary">{unit.abbreviation}</span>
                          <span className="text-xs text-muted-foreground">{unit.name}</span>
                          {!unit.is_active ? (
                            <Badge variant="secondary" className="h-4 px-1 text-[9px]">inactive</Badge>
                          ) : null}
                          {unit.is_base_unit ? (
                            <Badge variant="secondary" className="h-4 px-1 text-[9px]">base</Badge>
                          ) : null}
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] opacity-60 group-hover:opacity-100" onClick={() => openEditUnit(unit)}>
                            Edit
                          </Button>
                          {unit.is_active ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1 text-[10px] text-destructive opacity-60 group-hover:opacity-100"
                              onClick={() => setDeleteTarget({ kind: "unit", id: unit.id, name: unit.name })}
                            >
                              ×
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-1.5 text-[10px] text-primary opacity-60 group-hover:opacity-100"
                              onClick={() => reactivateEntry("unit", unit.id, unit.name)}
                            >
                              Reactivate
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <CatalogAdvancedSettings
        config={config}
        itemTypes={itemTypes}
        mutate={mutate.mutate}
        isLoading={mutate.isPending}
        canApprove={canApprove}
        factoryScope={factoryScope === "all" ? null : factoryScope}
      />

      {canManage && (
        <>
          <Separator />
          <DailyTargetSettingsPanel />
          <Separator />
          <BlockYieldSettingsPanel />
        </>
      )}
      {/* Dialogs */}
      <EntityFormDialog
        open={typeDialog}
        onOpenChange={setTypeDialog}
        title={editingType ? "Edit Item Type" : "Create Item Type"}
        description="Top-level classification used across inventory"
        submitLabel={editingType ? "Save Changes" : "Create Type"}
        isSubmitting={mutate.isPending}
        onSubmit={submitType}
      >
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={typeForm.name} onChange={(e) => setTypeForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Spare Parts" />
        </div>
        <div className="space-y-2">
          <Label>Slug</Label>
          <Input value={typeForm.slug} onChange={(e) => setTypeForm((f) => ({ ...f, slug: e.target.value }))} placeholder={slugifyInventory(typeForm.name || "spare_parts")} />
        </div>
        <div className="space-y-2">
          <Label>Factory scope</Label>
          <ScopePills value={typeForm.applies_to} onChange={(v) => setTypeForm((f) => ({ ...f, applies_to: v }))} />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea value={typeForm.description} onChange={(e) => setTypeForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
        </div>
      </EntityFormDialog>

      <EntityFormDialog open={categoryDialog} onOpenChange={setCategoryDialog} title={editingCategory ? "Edit Category" : "Add Category"} submitLabel={editingCategory ? "Save" : "Create"} isSubmitting={mutate.isPending} onSubmit={submitCategory}>
        <div className="space-y-2">
          <Label>Factory scope</Label>
          <Select value={categoryForm.factory_id} onValueChange={(v) => setCategoryForm((f) => ({ ...f, factory_id: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Factories</SelectItem>
              <SelectItem value={FACTORY_IDS.block}>Block Factory</SelectItem>
              <SelectItem value={FACTORY_IDS.recycling}>Plastic Recycling</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2"><Label>Name</Label><Input value={categoryForm.name} onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))} /></div>
        <div className="space-y-2"><Label>Description</Label><Textarea value={categoryForm.description} onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))} rows={2} /></div>
      </EntityFormDialog>

      <EntityFormDialog open={unitDialog} onOpenChange={setUnitDialog} title={editingUnit ? "Edit Unit" : "Add Unit"} submitLabel={editingUnit ? "Save" : "Create"} isSubmitting={mutate.isPending} onSubmit={submitUnit}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Display name</Label><Input value={unitForm.name} onChange={(e) => setUnitForm((f) => ({ ...f, name: e.target.value }))} placeholder="Kilogram" /></div>
          <div className="space-y-2"><Label>Abbreviation</Label><Input value={unitForm.abbreviation} onChange={(e) => setUnitForm((f) => ({ ...f, abbreviation: e.target.value }))} placeholder="kg" className="font-mono" /></div>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm">
          <input type="checkbox" checked={unitForm.is_base_unit} onChange={(e) => setUnitForm((f) => ({ ...f, is_base_unit: e.target.checked }))} />
          Default base unit for this type
        </label>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Deactivate entry"
        description={`Deactivate "${deleteTarget?.name}"? Existing SKUs keep their data; new items won't use inactive entries.`}
        confirmLabel="Deactivate"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function InventorySetupLink() {
  const { hasPermission } = useAuth();
  if (!hasPermission("admin", "manage") && !hasPermission("inventory", "configure")) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      asChild
      className="border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
    >
      <Link href="/dashboard/inventory/setup">
        <Settings2 className="size-4" />
        Catalog Setup
      </Link>
    </Button>
  );
}
