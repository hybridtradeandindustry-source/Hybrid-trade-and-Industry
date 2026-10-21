"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  PieChart,
  ShoppingCart,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart as RechartsPie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SOURCE_LABELS } from "@/lib/services/expense-analytics";
import {
  CHART_COLORS,
  CHART_GRID_STROKE,
  CHART_LABEL_STYLE,
  CHART_TICK_FILL,
  CHART_TOOLTIP_STYLE,
} from "@/lib/theme/chart-theme";
import { formatCurrency } from "@/lib/utils";
import type { ExpenseAnalyticsSummary } from "@/types";

const chartTooltipStyle = {
  contentStyle: CHART_TOOLTIP_STYLE,
  labelStyle: CHART_LABEL_STYLE,
};

const PIE_COLORS = [
  CHART_COLORS.c1,
  CHART_COLORS.c2,
  CHART_COLORS.c3,
  CHART_COLORS.c4,
  CHART_COLORS.c5,
  CHART_COLORS.info,
];

type Props = {
  analytics: ExpenseAnalyticsSummary;
};

export function ExpensesAnalyticsPanel({ analytics }: Props) {
  const sourceChart = analytics.bySource.map((row) => ({
    name: row.source,
    value: row.amount,
    count: row.count,
  }));

  const categoryChart = analytics.byCategory.slice(0, 8).map((row) => ({
    name: row.category.length > 18 ? `${row.category.slice(0, 16)}…` : row.category,
    fullName: row.category,
    amount: row.amount,
  }));

  const factoryChart = analytics.byFactory.map((row) => ({
    name: row.factory,
    amount: row.amount,
  }));

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <MetricCard
          title="Total P&L Expenses"
          value={formatCurrency(analytics.totalPlExpenses)}
          icon={<BarChart3 className="size-4" />}
          info="All expense types from finance ledger in period"
        />
        <MetricCard
          title="Cash Out"
          value={formatCurrency(analytics.totalCashOut)}
          icon={<Wallet className="size-4" />}
          info="Operating expenses posted + supplier payments"
        />
        <MetricCard
          title="Supplier Payments"
          value={formatCurrency(analytics.supplierPayments)}
          icon={<ShoppingCart className="size-4" />}
          info="Purchasing payments in period"
        />
        <MetricCard
          title="Payroll"
          value={formatCurrency(analytics.payrollExpenses)}
          icon={<Users className="size-4" />}
          info="Paid payroll runs in period"
        />
        <MetricCard
          title="Pending Operating"
          value={formatCurrency(analytics.pendingOperating)}
          icon={<Clock className="size-4" />}
          info={`${analytics.financeSync.unpostedOperatingCount} not yet posted to finance`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="COGS"
          value={formatCurrency(analytics.cogs)}
          info="Cost of goods sold from finance ledger"
        />
        <MetricCard
          title="Material Purchases"
          value={formatCurrency(analytics.materialPurchasesReceived)}
          info="Received purchase orders (accrual view)"
        />
        <MetricCard
          title="Operating (Posted)"
          value={formatCurrency(analytics.operatingExpenses)}
          info="Posted operating expenses in period"
        />
        <MetricCard
          title="Transactions"
          value={String(analytics.transactionCount)}
          icon={<TrendingUp className="size-4" />}
          info="Unified expense lines in selected period"
        />
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            Finance Sync Status
          </CardTitle>
          <CardDescription>
            Operating expenses sync to Sage when posted. Supplier payments and material purchases
            flow through Purchasing; payroll posts to the finance ledger when paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            Posted operating
            <span className="font-mono">{analytics.financeSync.postedOperatingCount}</span>
          </Badge>
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            Pending operating
            <span className="font-mono">{analytics.financeSync.unpostedOperatingCount}</span>
          </Badge>
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            Sage-linked
            <span className="font-mono">{analytics.financeSync.sageLinkedOperating}</span>
          </Badge>
          <Badge variant="outline" className="gap-2 px-3 py-1.5">
            Sage expense total
            <span className="font-mono">{formatCurrency(analytics.financeSync.sageExpenseTotal)}</span>
          </Badge>
          <Button variant="outline" size="sm" asChild className="ml-auto">
            <Link href="/dashboard/finance">
              Open Finance
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PieChart className="size-4" />
              Expenses by Source
            </CardTitle>
            <CardDescription>Breakdown of all expense types in period</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {sourceChart.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expense data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={sourceChart}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {sourceChart.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(value) => formatCurrency(Number(value))}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Top Categories</CardTitle>
            <CardDescription>Highest spending categories in period</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {categoryChart.length === 0 ? (
              <p className="text-sm text-muted-foreground">No category data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis type="number" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={100}
                    tick={{ fill: CHART_TICK_FILL, fontSize: 10 }}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(value) => formatCurrency(Number(value))}
                    labelFormatter={(_, payload) =>
                      (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ""
                    }
                  />
                  <Bar dataKey="amount" fill={CHART_COLORS.c1} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Monthly Expense Trend</CardTitle>
            <CardDescription>Last 6 months — operating, purchasing, payroll, COGS</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {analytics.monthlyTrend.every((m) => m.total === 0) ? (
              <p className="text-sm text-muted-foreground">No trend data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="label" tick={{ fill: CHART_TICK_FILL, fontSize: 10 }} />
                  <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  <Legend />
                  <Bar dataKey="operating" name="Operating" stackId="a" fill={CHART_COLORS.c1} />
                  <Bar dataKey="purchasing" name="Purchasing" stackId="a" fill={CHART_COLORS.c2} />
                  <Bar dataKey="payroll" name="Payroll" stackId="a" fill={CHART_COLORS.c3} />
                  <Bar dataKey="cogs" name="COGS" stackId="a" fill={CHART_COLORS.c4} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4" />
              By Factory
            </CardTitle>
            <CardDescription>Expense allocation across factories</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {factoryChart.length === 0 ? (
              <p className="text-sm text-muted-foreground">No factory breakdown for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={factoryChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
                  <XAxis dataKey="name" tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                  <YAxis tick={{ fill: CHART_TICK_FILL, fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(v) => formatCurrency(Number(v))} />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke={CHART_COLORS.c2}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {analytics.topVendors.length > 0 && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Top Vendors & Payees</CardTitle>
            <CardDescription>Highest spend by vendor in selected period</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {analytics.topVendors.map((row) => (
              <Badge key={row.name} variant="outline" className="gap-2 px-3 py-1.5">
                {row.name}
                <span className="font-mono text-xs">{formatCurrency(row.amount)}</span>
                <span className="text-muted-foreground">({row.count})</span>
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { SOURCE_LABELS };
