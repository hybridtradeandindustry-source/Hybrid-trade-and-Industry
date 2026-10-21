"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  DollarSign,
  Factory,
  Receipt,
  ShoppingCart,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useDashboard } from "@/hooks/use-api";
import { useAppStore } from "@/stores/app-store";
import { cn, formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { FACTORY_IDS, ORDER_STATUS_LABELS, type AiAlert, type DashboardMetrics, type Order, type OrderStatus } from "@/types";
import { FACTORY_OPTIONS } from "@/constants";
import { BlockFactoryDashboard } from "@/components/block-factory/block-factory-dashboard";
import { RecyclingDashboard } from "@/components/recycling/recycling-dashboard";
import type { StatusBadgeStatus } from "@/components/ui/status-badge";
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

const orderStatusBadge = (status: OrderStatus): StatusBadgeStatus => {
  const map: Record<OrderStatus, StatusBadgeStatus> = {
    ordered: "pending",
    picked: "delivered",
    cancelled: "cancelled",
  };
  return map[status];
};

export default function DashboardPage() {
  const { viewScope } = useAppStore();
  const { data, isLoading, isError } = useDashboard();

  const metrics = (data?.metrics ?? {}) as DashboardMetrics;
  const productionTrend = (data?.productionTrend ?? []) as { date: string; block: number; recycling: number }[];
  const recentOrders = (data?.recentOrders ?? []) as Order[];
  const aiAlerts = (data?.aiAlerts ?? []) as AiAlert[];

  const factoryComparison = useMemo(() => {
    const fc = data?.factoryComparison as
      | { block: { revenue: number; production: number }; recycling: { revenue: number; production: number } }
      | undefined;
    if (!fc) {
      return [
        { name: "Block Factory", revenue: 0, production: 0 },
        { name: "Recycling", revenue: 0, production: 0 },
      ];
    }
    return [
      { name: "Block Factory", revenue: fc.block.revenue, production: fc.block.production },
      { name: "Recycling", revenue: fc.recycling.revenue, production: fc.recycling.production },
    ];
  }, [data]);

  const scopeLabel =
    FACTORY_OPTIONS.find((o) => o.value === viewScope)?.label ?? "Overall Company";

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <EmptyState title="Failed to load dashboard" description="Please refresh or try again later." />;
  }

  if (viewScope === "block") {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Block Factory Dashboard"
          description="Real-time view of production capacity, inventory, sales, customer credit, and financial performance."
          actions={
            <Button variant="outline" asChild>
              <Link href="/dashboard/ai">
                <Brain className="size-4" />
                AI Briefing
              </Link>
            </Button>
          }
        />
        <BlockFactoryDashboard />
      </div>
    );
  }

  if (viewScope === "recycling") {
    return (
      <div className="space-y-8">
        <PageHeader
          title="Plastic Recycling Dashboard"
          description="Real-time view of daily production, finished-goods stock, and dispatch trends."
          actions={
            <Button variant="outline" asChild>
              <Link href="/dashboard/ai">
                <Brain className="size-4" />
                AI Briefing
              </Link>
            </Button>
          }
        />
        <RecyclingDashboard />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Executive Dashboard"
        description={`Real-time operational intelligence for ${scopeLabel}. Finance, production, and AI alerts in one view.`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/dashboard/ai">
              <Brain className="size-4" />
              AI Briefing
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Combined Revenue" value={formatCurrency(metrics.revenue ?? 0)} icon={<DollarSign className="size-4" />} info="Total revenue across both factories, from all orders regardless of status." />
        <MetricCard title="Production Output" value={formatNumber(metrics.production ?? 0)} icon={<Factory className="size-4" />} info="Combined production output across both factories." />
        <MetricCard title="Withholding Collected" value={formatCurrency(metrics.withholdingCollected ?? 0)} icon={<Receipt className="size-4" />} info="Total withholding tax applied across orders, at the rate snapshotted on each order." />
        <MetricCard title="Active Orders" value={metrics.activeOrders ?? 0} icon={<ShoppingCart className="size-4" />} info="Orders currently in progress and not yet delivered or cancelled." />
        <MetricCard title="Open Risk Alerts" value={metrics.openRiskAlerts ?? 0} icon={<AlertTriangle className="size-4" />} className="border-destructive/20" info="Unresolved AI-flagged risk alerts across orders and operations." />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Factory Comparison</CardTitle>
            <CardDescription>Revenue and production by factory</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={factoryComparison} barGap={8}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="name" tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                  <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue (Birr)" fill={CHART_COLORS.c1} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="production" name="Production" fill={CHART_COLORS.c2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Revenue &amp; Production Trend</CardTitle>
            <CardDescription>14-day rolling performance</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productionTrend.slice(-14)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="date" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend />
                  <Line type="monotone" dataKey="block" name="Block Factory" stroke={CHART_COLORS.c3} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="recycling" name="Recycling" stroke={CHART_COLORS.c2} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="border-border/60 bg-card/50 xl:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest orders across selected scope</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/orders">View all<ArrowRight className="size-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            <DataTable
              data={recentOrders}
              getRowKey={(row) => row.id}
              columns={[
                { id: "order", header: "Order", cell: (row) => <span className="font-medium">{row.order_number}</span> },
                { id: "customer", header: "Customer", cell: (row) => row.customer?.name ?? "—" },
                { id: "amount", header: "Amount", cell: (row) => formatCurrency(row.total_amount) },
                { id: "status", header: "Status", cell: (row) => <StatusBadge status={orderStatusBadge(row.status)} label={ORDER_STATUS_LABELS[row.status]} /> },
                { id: "delivery", header: "Delivery", cell: (row) => (row.delivery_date ? formatDate(row.delivery_date) : "—") },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Brain className="size-5 text-primary" />AI &amp; Alerts</CardTitle>
            <CardDescription>Proactive insights requiring attention</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {aiAlerts.map((alert) => (
              <div key={alert.id} className={cn("rounded-lg border p-3 transition-colors", alert.severity === "high" ? "border-destructive/30 bg-destructive/5" : "border-warning/30 bg-warning/5")}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{alert.title}</p>
                  <Badge variant={alert.severity === "high" ? "destructive" : "warning"} className="shrink-0 text-[10px]">{alert.severity}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
              </div>
            ))}
            <Button variant="outline" className="w-full" asChild>
              <Link href="/dashboard/ai">Open AI Assistant<ArrowRight className="size-4" /></Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
