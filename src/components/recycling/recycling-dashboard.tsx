"use client";

import { useMemo } from "react";
import { AlertTriangle, Package, Recycle, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useInventory, useProduction } from "@/hooks/use-api";
import { formatNumber } from "@/lib/utils";
import { computeRecyclingStats } from "@/lib/production/stats";
import { resolveDateRange } from "@/lib/production/filters";
import { FACTORY_IDS, type InventoryItem, type ProductionCount } from "@/types";
import {
  CHART_COLORS,
  CHART_GRID_STROKE,
  CHART_LABEL_STYLE,
  CHART_TICK_FILL,
  CHART_TOOLTIP_STYLE,
} from "@/lib/theme/chart-theme";

const chartTooltipStyle = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_LABEL_STYLE,
};

function kg(value: number) {
  return `${formatNumber(value)} kg`;
}

function buildTrend(counts: ProductionCount[], days = 14) {
  const byDate = new Map<string, { date: string; producedKg: number; wasteKg: number }>();
  for (const c of counts) {
    if (c.processed_output == null && c.waste_rejected == null) continue;
    const date = c.production_date.slice(0, 10);
    const existing = byDate.get(date) ?? { date, producedKg: 0, wasteKg: 0 };
    existing.producedKg += c.processed_output ?? 0;
    existing.wasteKg += c.waste_rejected ?? 0;
    byDate.set(date, existing);
  }
  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

export function RecyclingDashboard() {
  const { data: productionData, isLoading: isProductionLoading } = useProduction();
  const { data: inventoryData, isLoading: isInventoryLoading } = useInventory();

  const isLoading = isProductionLoading || isInventoryLoading;

  const counts = (productionData?.counts ?? []) as ProductionCount[];
  const items = (inventoryData?.items ?? []) as InventoryItem[];

  const todayStats = useMemo(
    () => computeRecyclingStats(counts, { dateFrom: undefined, dateTo: undefined }),
    [counts]
  );
  const weekStats = useMemo(() => {
    const { from, to } = resolveDateRange("weekly");
    return computeRecyclingStats(counts, { dateFrom: from, dateTo: to });
  }, [counts]);
  const monthStats = useMemo(() => {
    const { from, to } = resolveDateRange("monthly");
    return computeRecyclingStats(counts, { dateFrom: from, dateTo: to });
  }, [counts]);

  const trend = useMemo(() => buildTrend(counts), [counts]);

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
  const lowStockItems = [...rawMaterialItems, ...finishedGoodsItems].filter(
    (i) => i.low_stock_threshold > 0 && i.quantity <= i.low_stock_threshold
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Today's Recycled" value={kg(todayStats.totalOutput)} icon={<Recycle className="size-4" />} info="Total processed output logged today." />
        <MetricCard title="This Week" value={kg(weekStats.totalOutput)} icon={<TrendingUp className="size-4" />} info="Total processed output logged so far this week." />
        <MetricCard title="This Month" value={kg(monthStats.totalOutput)} icon={<TrendingUp className="size-4" />} info="Total processed output logged so far this month." />
        <MetricCard title="Finished Stock" value={kg(finishedStock)} icon={<Package className="size-4" />} info="Recycled/processed plastic currently on hand and available for sale." />
        <MetricCard title="Raw Material Stock" value={kg(rawMaterialStock)} info="Unprocessed plastic material currently on hand, awaiting recycling." />
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Production Trend</CardTitle>
          <CardDescription>Recycled output vs. waste — last 14 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                <XAxis dataKey="date" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="producedKg"
                  name="Produced (kg)"
                  stroke={CHART_COLORS.c2}
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="wasteKg"
                  name="Waste (kg)"
                  stroke={CHART_COLORS.c1}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {lowStockItems.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600" />
              Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map((i) => (
                <Badge key={i.id} variant="secondary">
                  {i.name}: {formatNumber(i.quantity)} {i.unit} (min {formatNumber(i.low_stock_threshold)})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
