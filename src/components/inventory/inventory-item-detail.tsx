"use client";

import { MapPin, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/ui/status-badge";
import { getTypeVisual, factoryName } from "@/lib/inventory/catalog-visuals";
import {
  getAvailableQuantity,
  getReorderRecommendation,
  getStockHealth,
} from "@/lib/inventory/inventory-utils";
import {
  resolveCategoryName,
  resolveItemType,
  resolveItemTypeName,
} from "@/lib/inventory/inventory-config";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import type { InventoryConfig, InventoryItem, InventoryMovement } from "@/types";

interface InventoryItemDetailProps {
  item: InventoryItem;
  config: InventoryConfig;
  movements: InventoryMovement[];
}

export function InventoryItemDetail({ item, config, movements }: InventoryItemDetailProps) {
  const type = resolveItemType(config, item.item_type_id);
  const visual = getTypeVisual(type ?? { slug: "unknown" });
  const Icon = visual.icon;
  const health = getStockHealth(item);
  const available = getAvailableQuantity(item);
  const reorder = getReorderRecommendation(item);
  const recent = movements.filter((m) => m.item_id === item.id).slice(0, 5);

  const healthStatus =
    health === "critical" ? "cancelled" : health === "low" ? "on_hold" : health === "overstock" ? "processing" : "active";

  return (
    <div className="space-y-5">
      <div className={cn("relative overflow-hidden rounded-xl border p-4", visual.ring, "ring-1")}>
        <div className={cn("absolute inset-0 bg-gradient-to-br opacity-30", visual.gradient)} />
        <div className="relative flex items-start gap-4">
          <div className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", visual.iconBg, visual.iconColor)}>
            <Icon className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={healthStatus} label={health} />
              <Badge variant="outline" className="font-mono text-[10px]">{item.sku}</Badge>
            </div>
            <p className="mt-2 text-lg font-semibold tracking-tight">{item.name}</p>
            <p className="text-sm text-muted-foreground">
              {resolveItemTypeName(config, item.item_type_id)} · {resolveCategoryName(config, item.category_id)}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "On hand", value: `${formatNumber(item.quantity)} ${item.unit}` },
          { label: "Available", value: formatNumber(available) },
          { label: "Reserved", value: formatNumber(item.reserved_quantity ?? 0) },
          { label: "Total value", value: formatCurrency(item.quantity * (item.unit_cost ?? 0)) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border/50 bg-muted/20 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{stat.label}</p>
            <p className="mt-1 text-sm font-semibold">{stat.value}</p>
          </div>
        ))}
      </div>

      {reorder ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">{reorder}</div>
      ) : null}

      <Separator />

      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">Location</p>
            <p className="font-medium">{item.location ?? "Not assigned"}</p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Truck className="mt-0.5 size-4 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground">Supplier</p>
            <p className="font-medium">{item.supplier ?? "—"}</p>
          </div>
        </div>
        <div>
          <p className="text-muted-foreground">Factory</p>
          <p className="font-medium">{factoryName(item.factory_id)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Unit cost</p>
          <p className="font-medium">{formatCurrency(item.unit_cost ?? 0)}</p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent movements</p>
        {recent.length === 0 ? (
          <p className="text-xs text-muted-foreground">No movements recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between rounded-lg border border-border/40 bg-card/30 px-3 py-2 text-xs"
              >
                <span className="capitalize text-muted-foreground">{String(m.movement_type).replace(/_/g, " ")}</span>
                <span className={cn("font-mono font-medium", m.quantity < 0 && "text-destructive")}>
                  {m.quantity > 0 ? "+" : ""}
                  {formatNumber(m.quantity)}
                </span>
                <span className="text-muted-foreground">{formatDateTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
