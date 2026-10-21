"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Package, Recycle, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInventory, useProduction, usePurchasing } from "@/hooks/use-api";
import { useAppStore } from "@/stores/app-store";
import { formatNumber, formatPercent, calculateYieldRate } from "@/lib/utils";
import {
  periodLabel,
  resolveDateRange,
  isDateInRange,
  type ReportPeriod,
} from "@/lib/production/filters";
import { computeRecyclingStats } from "@/lib/production/stats";
import { FACTORY_IDS, type InventoryItem, type MaterialPurchase, type ProductionCount } from "@/types";

export default function RecyclingStockPage() {
  const { viewScope } = useAppStore();
  const { data: productionData, isLoading: isProductionLoading } = useProduction();
  const { data: inventoryData, isLoading: isInventoryLoading } = useInventory();
  const { data: purchasingData, isLoading: isPurchasingLoading } = usePurchasing();

  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [range, setRange] = useState(() => resolveDateRange("weekly"));

  const isLoading = isProductionLoading || isInventoryLoading || isPurchasingLoading;

  const counts = (productionData?.counts ?? []) as ProductionCount[];
  const items = (inventoryData?.items ?? []) as InventoryItem[];
  const purchases = (purchasingData?.purchases ?? []) as MaterialPurchase[];

  const recyclingCounts = useMemo(
    () => counts.filter((c) => c.processed_output != null || c.material_received != null),
    [counts]
  );

  const filteredCounts = useMemo(
    () => recyclingCounts.filter((c) => isDateInRange(c.production_date, range.from, range.to)),
    [recyclingCounts, range]
  );

  const periodStats = useMemo(
    () => computeRecyclingStats(recyclingCounts, { dateFrom: range.from, dateTo: range.to }),
    [recyclingCounts, range]
  );

  const rawMaterialItems = useMemo(
    () =>
      items.filter(
        (i) => i.factory_id === FACTORY_IDS.recycling && i.category === "raw_material"
      ),
    [items]
  );
  const finishedGoodsItems = useMemo(
    () =>
      items.filter(
        (i) => i.factory_id === FACTORY_IDS.recycling && i.category === "finished_goods"
      ),
    [items]
  );

  const rawMaterialStock = rawMaterialItems.reduce((s, i) => s + (i.quantity ?? 0), 0);
  const finishedStock = finishedGoodsItems.reduce((s, i) => s + (i.quantity ?? 0), 0);

  const sortedRecyclingPurchases = useMemo(
    () =>
      purchases.filter(
        (p) => p.factory_id === FACTORY_IDS.recycling && p.sorting_status === "sorted"
      ),
    [purchases]
  );
  const filteredPurchaseWaste = useMemo(
    () =>
      sortedRecyclingPurchases.filter((p) =>
        isDateInRange(p.sorted_at ?? p.purchase_date, range.from, range.to)
      ),
    [sortedRecyclingPurchases, range]
  );
  const purchaseWasteTotal = filteredPurchaseWaste.reduce((s, p) => s + Number(p.waste_quantity ?? 0), 0);
  const purchaseIntakeTotal = filteredPurchaseWaste.reduce(
    (s, p) => s + Number(p.initial_received_weight ?? 0),
    0
  );
  const purchaseWasteRate = purchaseIntakeTotal > 0 ? purchaseWasteTotal / purchaseIntakeTotal : 0;

  const updatePeriod = (next: ReportPeriod) => {
    setPeriod(next);
    setRange(resolveDateRange(next, range.from, range.to));
  };

  if (viewScope === "block") {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Recycling Stock"
          description="This page is specific to Plastic Recycling."
        />
        <Card className="border-border/60 bg-card/50">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Switch factory scope to "Plastic Recycling" or "Overall Company" in the top bar to view
            this page.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Recycling Stock"
        description="Raw material and finished-goods stock for Plastic Recycling — supplier intake, production yield, and reports."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/purchasing">
                <ShoppingBag className="size-4" />
                Record Raw Material Purchase
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/production">
                <Recycle className="size-4" />
                Log Production
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard title="Raw Material Stock" value={`${formatNumber(rawMaterialStock)} kg`} icon={<Package className="size-4" />} info="Unprocessed plastic material currently on hand, awaiting recycling." />
        <MetricCard title="Finished Stock" value={`${formatNumber(finishedStock)} kg`} icon={<Package className="size-4" />} info="Recycled/processed plastic currently on hand and available for sale." />
        <MetricCard title="Recycled Output (period)" value={`${formatNumber(periodStats.totalOutput)} kg`} icon={<Recycle className="size-4" />} info="Total processed output logged for the selected period." />
        <MetricCard title="Yield Rate (period)" value={formatPercent(periodStats.yieldRate)} info="Processed output as a percentage of material received, for the selected period." />
        <MetricCard
          title="Purchase Sorting Waste (period)"
          value={`${formatNumber(purchaseWasteTotal)} kg`}
          icon={<AlertTriangle className="size-4" />}
          info="Material rejected during sorting of incoming purchases, for the selected period."
        />
        <MetricCard title="Purchase Waste Rate (period)" value={formatPercent(purchaseWasteRate)} info="Purchase sorting waste as a percentage of total material purchased, for the selected period." />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Raw Material Inventory</CardTitle>
            <CardDescription>Plastic waste received from suppliers, awaiting sorting &amp; production</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rawMaterialItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No raw material items configured yet.</p>
            ) : (
              rawMaterialItems.map((item) => {
                const isLow = item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatNumber(item.quantity)} {item.unit}</p>
                      {isLow && (
                        <Badge variant="destructive" className="mt-1 gap-1 text-[10px]">
                          <AlertTriangle className="size-3" />
                          Low stock
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Finished Goods Inventory</CardTitle>
            <CardDescription>Recycled pellets ready for sale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {finishedGoodsItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No finished goods items configured yet.</p>
            ) : (
              finishedGoodsItems.map((item) => {
                const isLow = item.low_stock_threshold > 0 && item.quantity <= item.low_stock_threshold;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatNumber(item.quantity)} {item.unit}</p>
                      {isLow && (
                        <Badge variant="destructive" className="mt-1 gap-1 text-[10px]">
                          <AlertTriangle className="size-3" />
                          Low stock
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="size-4" />
            Production Report
          </CardTitle>
          <CardDescription>
            Daily/weekly/monthly/yearly recycled output — showing {filteredCounts.length} entries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label>Report period</Label>
              <Select value={period} onValueChange={(v) => updatePeriod(v as ReportPeriod)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{periodLabel("daily")}</SelectItem>
                  <SelectItem value="weekly">{periodLabel("weekly")}</SelectItem>
                  <SelectItem value="monthly">{periodLabel("monthly")}</SelectItem>
                  <SelectItem value="custom">{periodLabel("custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="range-from">From</Label>
              <Input
                id="range-from"
                type="date"
                value={range.from}
                onChange={(e) => {
                  setPeriod("custom");
                  setRange((r) => ({ ...r, from: e.target.value }));
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="range-to">To</Label>
              <Input
                id="range-to"
                type="date"
                value={range.to}
                onChange={(e) => {
                  setPeriod("custom");
                  setRange((r) => ({ ...r, to: e.target.value }));
                }}
              />
            </div>
          </div>

          <DataTable
            data={filteredCounts}
            getRowKey={(row) => row.id}
            emptyMessage="No production entries in this range yet."
            columns={[
              { id: "date", header: "Date", cell: (row) => row.production_date },
              {
                id: "received",
                header: "Material Received",
                cell: (row) => `${formatNumber(row.material_received ?? 0)} kg`,
              },
              {
                id: "output",
                header: "Processed Output",
                cell: (row) => `${formatNumber(row.processed_output ?? 0)} kg`,
              },
              {
                id: "waste",
                header: "Waste",
                cell: (row) => `${formatNumber(row.waste_rejected ?? 0)} kg`,
              },
              {
                id: "yield",
                header: "Yield",
                cell: (row) =>
                  formatPercent(
                    calculateYieldRate(row.processed_output ?? 0, row.material_received ?? 0)
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="size-4" />
            Raw Material Purchase Sorting
          </CardTitle>
          <CardDescription>
            Gross weight received vs. net recyclable weight after sorting — showing {filteredPurchaseWaste.length} sorted purchase(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredPurchaseWaste}
            getRowKey={(row) => row.id}
            emptyMessage="No sorted raw material purchases in this range yet."
            columns={[
              { id: "number", header: "PO #", cell: (row) => <span className="font-mono text-sm">{row.purchase_number}</span> },
              { id: "supplier", header: "Supplier", cell: (row) => row.supplier_name },
              {
                id: "gross",
                header: "Initial Received (gross)",
                cell: (row) => `${formatNumber(row.initial_received_weight ?? 0)} ${row.unit}`,
              },
              {
                id: "net",
                header: "Net Recyclable",
                cell: (row) => `${formatNumber(row.net_recyclable_weight ?? 0)} ${row.unit}`,
              },
              {
                id: "waste",
                header: "Waste",
                cell: (row) => (
                  <span className="font-medium text-destructive">
                    {formatNumber(row.waste_quantity ?? 0)} {row.unit}
                  </span>
                ),
              },
              {
                id: "waste-rate",
                header: "Waste Rate",
                cell: (row) =>
                  formatPercent(
                    calculateYieldRate(row.waste_quantity ?? 0, row.initial_received_weight ?? 0)
                  ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
