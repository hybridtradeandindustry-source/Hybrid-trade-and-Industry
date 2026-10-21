"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CreditCard,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Wallet,
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
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFinanceDashboard } from "@/hooks/use-api";
import { FinanceReportsPanel } from "@/components/finance/finance-reports-panel";
import { CustomerStatementExport } from "@/components/finance/customer-statement-export";
import { financePeriodLabel, monthYearOptions, type FinancePeriod } from "@/lib/finance/periods";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  CustomerFinancialRow,
  FinanceDashboardMetrics,
  FinanceTrendPoint,
  FinancialAlert,
} from "@/types";
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

const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "specific_month", label: "Specific month" },
  { value: "custom", label: "Custom range" },
];

function alertVariant(severity: FinancialAlert["severity"]) {
  if (severity === "critical") return "destructive" as const;
  if (severity === "warning") return "secondary" as const;
  return "outline" as const;
}

export function FinanceOverview() {
  const [period, setPeriod] = useState<FinancePeriod>("this_month");
  const [monthYear, setMonthYear] = useState(monthYearOptions()[0]?.value ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const periodOptions = useMemo(
    () =>
      period === "specific_month"
        ? { monthYear }
        : period === "custom"
          ? { dateFrom, dateTo }
          : undefined,
    [period, monthYear, dateFrom, dateTo]
  );

  const { data, isLoading } = useFinanceDashboard(period, periodOptions);

  const metrics = (data?.metrics ?? {}) as FinanceDashboardMetrics;
  const customers = (data?.customers ?? []) as CustomerFinancialRow[];
  const alerts = (data?.alerts ?? []) as FinancialAlert[];
  const trend = (data?.trend ?? []) as FinanceTrendPoint[];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  const periodLabel = metrics.period?.label ?? financePeriodLabel(period);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Financial Overview</h2>
          <p className="text-sm text-muted-foreground">
            {periodLabel}
            {metrics.period?.from && metrics.period?.to && (
              <span className="ml-1">
                ({formatDate(metrics.period.from)} – {formatDate(metrics.period.to)})
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as FinancePeriod)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === "specific_month" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Month</Label>
              <Select value={monthYear} onValueChange={setMonthYear}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthYearOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
          <FinanceReportsPanel
            compact
            syncPeriod={period}
            syncMonthYear={monthYear}
            syncDateFrom={dateFrom}
            syncDateTo={dateTo}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Revenue"
          value={formatCurrency(metrics.revenue ?? 0)}
          icon={<DollarSign className="size-4" />}
          info="Total revenue recognized for the selected period."
        />
        <MetricCard
          title="Collections"
          value={formatCurrency(metrics.collections ?? 0)}
          icon={<Banknote className="size-4" />}
          info="Total cash collected from customers for the selected period."
        />
        <MetricCard
          title="Cash Flow"
          value={formatCurrency(metrics.cashFlow ?? 0)}
          icon={
            (metrics.cashFlow ?? 0) >= 0 ? (
              <ArrowUpRight className="size-4 text-emerald-600" />
            ) : (
              <ArrowDownRight className="size-4 text-amber-600" />
            )
          }
          info="Net cash movement (collections minus payments) for the selected period."
        />
        <MetricCard
          title="Net Profit"
          value={formatCurrency(metrics.netProfit ?? 0)}
          icon={<TrendingUp className="size-4" />}
          info="Revenue minus all expenses and cost of goods sold for the selected period."
        />
        <MetricCard
          title="Receivables"
          value={formatCurrency(metrics.receivables ?? 0)}
          icon={<CreditCard className="size-4" />}
          info="Total amount owed to the company by customers."
        />
        <MetricCard
          title="Outstanding"
          value={formatCurrency(metrics.outstandingBalance ?? 0)}
          icon={<Wallet className="size-4" />}
          info="Total unpaid balance across all customer accounts."
        />
        <MetricCard
          title="Supplier Payments"
          value={formatCurrency(metrics.supplierPayments ?? 0)}
          icon={<ArrowDownRight className="size-4" />}
          info="Total paid out to suppliers for the selected period."
        />
        <MetricCard
          title="Expenses"
          value={formatCurrency(metrics.expenses ?? 0)}
          icon={<TrendingDown className="size-4" />}
          info="Total operating expenses recorded for the selected period."
        />
      </div>

      {alerts.length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" />
              Financial Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={alertVariant(alert.severity)} className="text-[10px]">
                      {alert.severity}
                    </Badge>
                    <span className="text-sm font-medium">{alert.title}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{alert.description}</p>
                </div>
                {alert.amount != null && (
                  <span className="font-mono text-sm font-semibold">
                    {formatCurrency(alert.amount)}
                  </span>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
            <CardDescription>Daily totals for the selected period</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {trend.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trend data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: CHART_TICK_FILL, fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend />
                  <Bar dataKey="revenue" name="Revenue" fill={CHART_COLORS.c1} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill={CHART_COLORS.c2} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Cash Flow Trend</CardTitle>
            <CardDescription>Collections vs supplier payments and net cash flow</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {trend.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cash flow data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: CHART_TICK_FILL, fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="collections"
                    name="Collections"
                    stroke={CHART_COLORS.c3}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="supplierPayments"
                    name="Supplier Payments"
                    stroke={CHART_COLORS.c2}
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="cashFlow"
                    name="Net Cash Flow"
                    stroke={CHART_COLORS.c1}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Customer Balances & Payments</CardTitle>
          <CardDescription>
            Credit on picked sales, lifetime payments, and collections for the selected period.
            Export a statement for any customer as PDF or Excel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={customers}
            getRowKey={(row) => row.customer_id}
            emptyMessage="No customer financial data"
            columns={[
              {
                id: "customer",
                header: "Customer",
                cell: (row) => (
                  <div>
                    <p className="font-medium">{row.customer_name}</p>
                    <Badge variant="outline" className="mt-0.5 text-[10px]">
                      {row.customer_type === "walking" ? "Walking" : "Regular"}
                    </Badge>
                  </div>
                ),
              },
              {
                id: "balance",
                header: "Credit Balance",
                cell: (row) => formatCurrency(row.balance),
              },
              {
                id: "total_paid",
                header: "Total Paid",
                cell: (row) => formatCurrency(row.total_paid),
              },
              {
                id: "collections_period",
                header: "Collections (period)",
                cell: (row) => (
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(row.collections_in_period)}
                  </span>
                ),
              },
              {
                id: "picked",
                header: "Picked Value",
                cell: (row) => formatCurrency(row.picked_value),
              },
              {
                id: "pending",
                header: "Pending Pickup",
                cell: (row) => formatCurrency(row.pending_order_credit),
              },
              {
                id: "report",
                header: "Report",
                cell: (row) => (
                  <CustomerStatementExport
                    customerId={row.customer_id}
                    customerName={row.customer_name}
                    period={period}
                    monthYear={monthYear}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    resolvedFrom={metrics.period?.from}
                    resolvedTo={metrics.period?.to}
                  />
                ),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
