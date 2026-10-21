"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Boxes,
  Factory,
  Package,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useBlockFactoryDashboard } from "@/hooks/use-api";
import { BLOCK_YIELDS } from "@/lib/block-factory/yields";
import { formatCurrency, formatNumber, formatPercent, formatPolicheLoads } from "@/lib/utils";
import type { BlockSizeCm } from "@/lib/block-factory/yields";
import { ProductionCapacityPanel } from "@/components/ai/production-capacity-panel";

export function BlockFactoryDashboard() {
  const router = useRouter();
  const { data, isLoading } = useBlockFactoryDashboard();
  const dash = data;

  const batchRows = useMemo(() => dash?.batches ?? [], [dash?.batches]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!dash) return null;

  const { inventory, production, sales, customers, finance, lowStockAlerts } = dash;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Cement Stock"
          value={
            <div>
              <span>{formatNumber(inventory.cement.bags)} bags</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {formatNumber(inventory.cement.kg)} kg available
              </span>
            </div>
          }
          icon={<Package className="size-4" />}
          className={inventory.cement.lowStock ? "border-amber-500/30" : undefined}
          info="Cement bags currently on hand, with the equivalent weight in kg."
        />
        <MetricCard
          title="Finished Blocks"
          value={
            <div>
              <span>
                {formatNumber(
                  Object.values(inventory.finishedBySize).reduce((s, f) => s + f.blocks, 0)
                )}
              </span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {formatNumber(inventory.wipCuring)} in curing/drying
              </span>
            </div>
          }
          icon={<Boxes className="size-4" />}
          info="Total finished blocks across all sizes ready to ship, plus how many are still in curing/drying."
        />
        <MetricCard
          title="Active Batches"
          value={production.activeBatches}
          icon={<Factory className="size-4" />}
          info="Batches still in progress and not yet marked finished."
        />
        <MetricCard
          title="Period Revenue"
          value={
            <div>
              <span>{formatCurrency(sales.periodRevenue)}</span>
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {formatNumber(sales.activeOrders)} pending pickup orders
              </span>
            </div>
          }
          icon={<TrendingUp className="size-4" />}
          info="Revenue recognized for the selected period, plus orders awaiting pickup."
        />
      </div>

      <Card className="border-border/60">
        <CardContent className="pt-6">
          <ProductionCapacityPanel />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Active Batches</CardTitle>
            <CardDescription>
              Batches not yet finished · Yield {formatPercent(production.avgYieldRate)} · Waste{" "}
              {formatPercent(production.avgDamageRate)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              data={batchRows}
              getRowKey={(row) => row.id}
              emptyMessage="No active production batches."
              onRowClick={(row) => router.push(`/dashboard/production/batches/${row.id}`)}
              columns={[
                {
                  id: "batch",
                  header: "Batch",
                  cell: (row) => (
                    <div>
                      <span className="font-mono text-sm">{row.batch_number}</span>
                      {row.name && <p className="text-xs">{row.name}</p>}
                      <p className="text-xs text-muted-foreground">{row.blockLabel} block</p>
                    </div>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: () => <Badge variant="outline">Active</Badge>,
                },
                {
                  id: "produced",
                  header: "Produced",
                  cell: (row) => formatNumber(row.produced),
                },
                {
                  id: "available",
                  header: "Available",
                  cell: (row) => formatNumber(row.available),
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Finance & Credit</CardTitle>
            <CardDescription>Auto-linked from sales, production, and inventory</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue (period)</span>
              <span className="font-medium">{formatCurrency(finance.revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expenses</span>
              <span className="font-medium">{formatCurrency(finance.expenses)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Net profit</span>
              <span className="font-medium">{formatCurrency(finance.netProfit)}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-3">
              <span className="text-muted-foreground">Collections</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {formatCurrency(finance.collections)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Supplier payments</span>
              <span className="font-medium">{formatCurrency(finance.supplierPayments)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash flow</span>
              <span className="font-medium">{formatCurrency(finance.cashFlow)}</span>
            </div>
            <div className="flex justify-between border-t border-border/60 pt-3">
              <span className="text-muted-foreground">Customer credit</span>
              <span className="font-medium">{formatCurrency(customers.totalCreditBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Outstanding</span>
              <span className="font-medium">{formatCurrency(finance.outstandingBalance)}</span>
            </div>
            {customers.topDebtors.slice(0, 3).map((c) => (
              <div key={c.name} className="flex justify-between text-xs">
                <span className="truncate text-muted-foreground">{c.name}</span>
                <span>{formatCurrency(c.balance)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {lowStockAlerts.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockAlerts.map((a) => (
                <Badge key={a.sku} variant="secondary">
                  {a.name}: {formatNumber(a.quantity)} (min {formatNumber(a.threshold)})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function BlockInventoryDashboard({
  inventory,
}: {
  inventory?: import("@/lib/services/block-factory-dashboard").BlockInventorySnapshot;
}) {
  if (!inventory) return null;

  const sizes = [20, 15, 10, 24] as BlockSizeCm[];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Raw Material Storage</CardTitle>
            <CardDescription>Cement & Poliche</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-medium">Cement</p>
              <p className="text-muted-foreground">
                {formatNumber(inventory.cement.bags)} bags · {formatNumber(inventory.cement.kg)} kg
              </p>
              {inventory.cement.lowStock && (
                <Badge variant="destructive" className="mt-1 text-[10px]">
                  Low stock
                </Badge>
              )}
            </div>
            <div>
              <p className="font-medium">Poliche</p>
              <p className="text-muted-foreground">{formatPolicheLoads(inventory.poliche.loads)} loads</p>
              {inventory.poliche.lowStock && (
                <Badge variant="destructive" className="mt-1 text-[10px]">
                  Low stock
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Finished Goods Storage</CardTitle>
            <CardDescription>Available blocks by size</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {sizes.map((size) => (
                <div
                  key={size}
                  className="rounded-lg border border-border/60 bg-muted/10 p-3"
                >
                  <p className="text-xs text-muted-foreground">{BLOCK_YIELDS[size].label}</p>
                  <p className="text-lg font-semibold">
                    {formatNumber(inventory.finishedBySize[size].blocks)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">blocks available</p>
                  {inventory.finishedBySize[size].lowStock && (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      Low
                    </Badge>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {formatNumber(inventory.wipCuring)} blocks in curing/drying ·{" "}
              {formatNumber(inventory.wasteBlocks)} waste blocks tracked
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Spare Parts Storage</CardTitle>
          <CardDescription>Machine parts, maintenance materials, operational tools</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">SKUs tracked</p>
            <p className="text-lg font-semibold">{inventory.spareParts.items}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total units</p>
            <p className="text-lg font-semibold">{formatNumber(inventory.spareParts.totalUnits)}</p>
          </div>
          {inventory.spareParts.lowStockCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <TrendingDown className="size-3" />
              {inventory.spareParts.lowStockCount} low stock
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
