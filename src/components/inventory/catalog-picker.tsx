"use client";

import { Check, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getTypeVisual } from "@/lib/inventory/catalog-visuals";
import type { InventoryCategoryDef, InventoryConfig, InventoryItemType, InventoryUnitDef } from "@/types";
import {
  getActiveItemTypes,
  getCategoriesForType,
  getUnitsForType,
} from "@/lib/inventory/inventory-config";

interface CatalogPickerProps {
  config: InventoryConfig;
  factoryId: string;
  itemTypeId: string;
  categoryId: string;
  unit: string;
  onTypeChange: (typeId: string) => void;
  onCategoryChange: (categoryId: string) => void;
  onUnitChange: (unit: string) => void;
  compact?: boolean;
}

function SelectCard({
  selected,
  onClick,
  title,
  subtitle,
  badge,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all",
        selected
          ? "border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20"
          : "border-border/60 bg-card/40 hover:border-primary/30 hover:bg-muted/30",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{title}</p>
          {badge}
        </div>
        {subtitle ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {selected ? (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      ) : (
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/40 transition group-hover:text-muted-foreground" />
      )}
    </button>
  );
}

function TypeCard({
  type,
  selected,
  onClick,
}: {
  type: InventoryItemType;
  selected: boolean;
  onClick: () => void;
}) {
  const visual = getTypeVisual(type);
  const Icon = visual.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border p-4 text-left transition-all",
        selected
          ? cn("border-primary/40 shadow-md ring-2", visual.ring)
          : "border-border/60 hover:border-primary/25 hover:shadow-sm"
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40", visual.gradient)} />
      <div className="relative flex items-start justify-between gap-2">
        <div className={cn("flex size-10 items-center justify-center rounded-lg", visual.iconBg, visual.iconColor)}>
          <Icon className="size-5" />
        </div>
        {selected ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" />
          </span>
        ) : null}
      </div>
      <p className="relative mt-3 font-semibold tracking-tight">{type.name}</p>
      {type.description ? (
        <p className="relative mt-1 line-clamp-2 text-xs text-muted-foreground">{type.description}</p>
      ) : null}
    </button>
  );
}

function UnitPill({
  unit,
  selected,
  onClick,
}: {
  unit: InventoryUnitDef;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border/60 bg-muted/30 hover:border-primary/30 hover:bg-muted/50"
      )}
    >
      <span className="font-mono text-xs font-semibold">{unit.abbreviation}</span>
      <span className={cn("text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>
        {unit.name}
      </span>
      {unit.is_base_unit ? (
        <Badge variant="secondary" className="h-4 px-1 text-[9px]">
          base
        </Badge>
      ) : null}
    </button>
  );
}

export function CatalogPicker({
  config,
  factoryId,
  itemTypeId,
  categoryId,
  unit,
  onTypeChange,
  onCategoryChange,
  onUnitChange,
  compact = false,
}: CatalogPickerProps) {
  const types = getActiveItemTypes(config, factoryId);
  const categories = getCategoriesForType(config, itemTypeId, factoryId);
  const units = getUnitsForType(config, itemTypeId);

  if (!types.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
        No item types configured for this factory. Set up the catalog first.
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", compact && "space-y-4")}>
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">1 · Item type</p>
        <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
          {types.map((type) => (
            <TypeCard
              key={type.id}
              type={type}
              selected={itemTypeId === type.id}
              onClick={() => onTypeChange(type.id)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">2 · Category</p>
        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
            No categories for this type yet.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((cat: InventoryCategoryDef) => (
              <SelectCard
                key={cat.id}
                selected={categoryId === cat.id}
                onClick={() => onCategoryChange(cat.id)}
                title={cat.name}
                subtitle={cat.description ?? cat.slug}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">3 · Unit of measure</p>
        {units.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-xs text-muted-foreground">
            No units defined for this type yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {units.map((u) => (
              <UnitPill
                key={u.id}
                unit={u}
                selected={unit === u.abbreviation}
                onClick={() => onUnitChange(u.abbreviation)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
