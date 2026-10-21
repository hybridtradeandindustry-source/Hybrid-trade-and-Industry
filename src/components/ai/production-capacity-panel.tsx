"use client";

import { AlertTriangle, Factory, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductionCapacity, useRefreshAi } from "@/hooks/use-api";
import { formatNumber, formatPercent, formatPolicheLoads } from "@/lib/utils";
import type { CapacityResult } from "@/types/production-intelligence";

export function ProductionCapacityPanel({ className }: { className?: string }) {
  // Always read live inventory so Refresh matches Inventory (poliche can be 0 or negative).
  const { data, isLoading, refetch, isFetching } = useProductionCapacity(true);
  const refreshAi = useRefreshAi();
  const capacity = data as CapacityResult | undefined;

  const handleRefresh = () => {
    refreshAi.mutate(
      { useLlm: false },
      {
        onSuccess: async () => {
          await refetch();
          toast.success("Capacity refreshed from live inventory");
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Refresh failed"),
      }
    );
  };

  if (isLoading) {
    return <Skeleton className={`h-64 w-full ${className ?? ""}`} />;
  }

  if (!capacity) return null;

  const focus = capacity.predictions.find((p) => p.block_size_cm === 20) ?? capacity.predictions[0];
  const policheOnHand = Number(capacity.inventory.policheLoads ?? 0);
  const cementOnHand = Number(capacity.inventory.cementBags ?? 0);

  return (
    <div className={`space-y-4 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Factory className="size-4 text-primary" />
            Current Production Capacity
          </h3>
          <p className="text-xs text-muted-foreground">
            Live inventory · Based on {capacity.sample_batches || "0"} completed batches · Confidence{" "}
            {formatPercent(capacity.confidence * 100, 0)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={refreshAi.isPending || isFetching}
          onClick={handleRefresh}
        >
          <RefreshCw className={`size-3.5 ${refreshAi.isPending || isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          title="Cement"
          value={`${formatNumber(cementOnHand)} bags`}
          className="border-border/60"
          info="Cement bags currently on hand in inventory (BLK-RM-CEM)."
        />
        <MetricCard
          title="Poliche"
          value={`${formatPolicheLoads(policheOnHand)} loads`}
          className={
            policheOnHand <= 0
              ? "border-amber-500/40 bg-amber-500/5"
              : "border-border/60"
          }
          info="Poliche loads currently on hand in inventory (BLK-RM-POL). May be negative if production used more than purchased."
        />
        <MetricCard
          title="20cm max"
          value={
            <div>
              <span>{formatNumber(focus?.max_blocks ?? 0)} blocks</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                ~{formatNumber(focus?.max_pallets ?? 0)} pallets
              </span>
            </div>
          }
          className="border-border/60"
          info="Maximum 20cm blocks from current cement and poliche — whichever material runs out first. Negative or zero poliche counts as no stock for production."
        />
      </div>

      {policheOnHand <= 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p>
            {policheOnHand < 0 ? (
              <>
                Poliche on hand is{" "}
                <span className="font-medium">{formatPolicheLoads(policheOnHand)} loads</span> (over-used).
                Refresh is working — inventory really has no usable poliche until you purchase more or
                correct the count. Production capacity stays at 0 until poliche is above zero.
              </>
            ) : (
              <>
                Poliche on hand is <span className="font-medium">0 loads</span>. Cement updated correctly
                ({formatNumber(cementOnHand)} bags), but without poliche no blocks can be produced. Add a
                poliche purchase or check Inventory → Poliche if you expected stock here.
              </>
            )}
          </p>
        </div>
      )}

      {focus &&
        policheOnHand > 0 &&
        focus.limiting_factor !== "balanced" &&
        focus.limiting_factor !== "none" && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              <span className="font-medium capitalize">{focus.limiting_factor}</span> is the bottleneck for{" "}
              {focus.label}. Expected waste ~{focus.expected_waste_pct}%.
            </p>
          </div>
        )}

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Possible production by block size</CardTitle>
          <CardDescription>
            Learned waste applied where enough batch history exists
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Size</th>
                <th className="py-2 pr-3 font-medium">Max blocks</th>
                <th className="py-2 pr-3 font-medium">Pallets</th>
                <th className="py-2 pr-3 font-medium">Waste</th>
                <th className="py-2 pr-3 font-medium">Days</th>
                <th className="py-2 font-medium">Limit</th>
              </tr>
            </thead>
            <tbody>
              {capacity.predictions.map((row) => (
                <tr key={row.block_size_cm} className="border-b border-border/40 last:border-0">
                  <td className="py-2.5 pr-3 font-medium">{row.label}</td>
                  <td className="py-2.5 pr-3 font-mono">{formatNumber(row.max_blocks)}</td>
                  <td className="py-2.5 pr-3 font-mono">{formatNumber(row.max_pallets)}</td>
                  <td className="py-2.5 pr-3">{row.expected_waste_pct}%</td>
                  <td className="py-2.5 pr-3">{row.estimated_production_days || "—"}</td>
                  <td className="py-2.5">
                    <Badge variant="outline" className="capitalize">
                      {row.limiting_factor}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
