import {
  Box,
  Boxes,
  Factory,
  Layers,
  Package,
  Recycle,
  Sparkles,
  Tag,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { InventoryAppliesTo, InventoryItemType } from "@/types";
import { FACTORY_IDS } from "@/types";

export interface TypeVisual {
  icon: LucideIcon;
  gradient: string;
  ring: string;
  iconBg: string;
  iconColor: string;
}

const DEFAULT_VISUAL: TypeVisual = {
  icon: Layers,
  gradient: "from-primary/[0.06] via-transparent to-transparent",
  ring: "ring-border/80",
  iconBg: "bg-primary/8",
  iconColor: "text-primary",
};

const SLUG_VISUALS: Record<string, TypeVisual> = {
  raw_material: {
    icon: Package,
    gradient: "from-chart-2/[0.07] via-transparent to-transparent",
    ring: "ring-border/80",
    iconBg: "bg-chart-2/10",
    iconColor: "text-chart-2",
  },
  work_in_process: {
    icon: Sparkles,
    gradient: "from-chart-4/[0.07] via-transparent to-transparent",
    ring: "ring-border/80",
    iconBg: "bg-chart-4/10",
    iconColor: "text-chart-4",
  },
  finished_goods: {
    icon: Boxes,
    gradient: "from-chart-3/[0.07] via-transparent to-transparent",
    ring: "ring-border/80",
    iconBg: "bg-chart-3/10",
    iconColor: "text-chart-3",
  },
  consumables: {
    icon: Wrench,
    gradient: "from-chart-5/[0.07] via-transparent to-transparent",
    ring: "ring-border/80",
    iconBg: "bg-chart-5/10",
    iconColor: "text-chart-5",
  },
  packaging: {
    icon: Box,
    gradient: "from-muted/60 via-transparent to-transparent",
    ring: "ring-border/80",
    iconBg: "bg-muted",
    iconColor: "text-muted-foreground",
  },
};

export function getTypeVisual(type: Pick<InventoryItemType, "slug">): TypeVisual {
  return SLUG_VISUALS[type.slug] ?? DEFAULT_VISUAL;
}

export function factoryScopeLabel(appliesTo: InventoryAppliesTo): string {
  if (appliesTo === "both") return "Both factories";
  if (appliesTo === "block") return "Block Factory";
  return "Plastic Recycling";
}

export function factoryScopeIcon(appliesTo: InventoryAppliesTo): LucideIcon {
  if (appliesTo === "both") return Factory;
  if (appliesTo === "block") return Factory;
  return Recycle;
}

export function factoryName(factoryId: string | null | undefined): string {
  if (!factoryId) return "All factories";
  if (factoryId === FACTORY_IDS.block) return "Block Factory";
  return "Plastic Recycling";
}

export function factoryBadgeClass(factoryId: string | null | undefined): string {
  if (!factoryId) return "border border-border/60 bg-muted/50 text-muted-foreground";
  if (factoryId === FACTORY_IDS.block) return "border border-chart-2/20 bg-chart-2/8 text-chart-2";
  return "border border-chart-3/20 bg-chart-3/8 text-chart-3";
}

export const CATEGORY_ICON = Tag;
