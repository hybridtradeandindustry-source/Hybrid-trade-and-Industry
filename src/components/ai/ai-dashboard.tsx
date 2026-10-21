"use client";

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
  Area,
  AreaChart,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
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

export interface DashboardMetric {
  title: string;
  value: string;
  trend?: string;
  trendType?: "positive" | "negative" | "neutral";
}

export interface DashboardChart {
  title: string;
  type: "bar" | "line" | "area";
  data: Array<Record<string, any>>;
  dataKey: string;
}

export interface DashboardTable {
  title: string;
  headers: string[];
  rows: string[][];
}

export interface AiDashboardProps {
  data: {
    title: string;
    description?: string;
    metrics?: DashboardMetric[];
    charts?: DashboardChart[];
    tables?: DashboardTable[];
  };
}

export function AiDashboard({ data }: AiDashboardProps) {
  const { title, description, metrics, charts, tables } = data;

  return (
    <div className="w-full space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 my-4 shadow-sm backdrop-blur-sm">
      <div className="flex flex-col gap-1 border-b border-border/40 pb-3">
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <TrendingUp className="size-4.5 text-primary" />
          {title}
        </h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Metrics Grid */}
      {metrics && metrics.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3">
          {metrics.map((metric, i) => (
            <Card key={i} className="border-border/40 bg-background/60 shadow-none">
              <CardHeader className="p-3 pb-0">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  {metric.title}
                </span>
              </CardHeader>
              <CardContent className="p-3 pt-1 flex flex-col gap-1">
                <span className="text-lg font-bold text-foreground">{metric.value}</span>
                {metric.trend && (
                  <span className="flex items-center gap-1 text-[10px]">
                    {metric.trendType === "positive" && (
                      <ArrowUpRight className="size-3 text-success shrink-0" />
                    )}
                    {metric.trendType === "negative" && (
                      <ArrowDownRight className="size-3 text-destructive shrink-0" />
                    )}
                    <span
                      className={
                        metric.trendType === "positive"
                          ? "text-success font-medium"
                          : metric.trendType === "negative"
                          ? "text-destructive font-medium"
                          : "text-muted-foreground"
                      }
                    >
                      {metric.trend}
                    </span>
                  </span>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Charts Section */}
      {charts && charts.length > 0 && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          {charts.map((chart, i) => (
            <Card key={i} className="border-border/40 bg-background/60 shadow-none p-3 flex flex-col gap-2">
              <span className="text-xs font-semibold text-foreground px-1">{chart.title}</span>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {chart.type === "bar" ? (
                    <BarChart data={chart.data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_TICK_FILL} fontSize={10} tickLine={false} />
                      <YAxis stroke={CHART_TICK_FILL} fontSize={10} tickLine={false} />
                      <Tooltip {...chartTooltipStyle} cursor={{ fill: "var(--muted)", opacity: 0.1 }} />
                      <Bar dataKey={chart.dataKey} fill={CHART_COLORS.c1} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : chart.type === "area" ? (
                    <AreaChart data={chart.data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <defs>
                        <linearGradient id={`color-${i}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={CHART_COLORS.c2} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={CHART_COLORS.c2} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_TICK_FILL} fontSize={10} tickLine={false} />
                      <YAxis stroke={CHART_TICK_FILL} fontSize={10} tickLine={false} />
                      <Tooltip {...chartTooltipStyle} />
                      <Area
                        type="monotone"
                        dataKey={chart.dataKey}
                        stroke={CHART_COLORS.c2}
                        fillOpacity={1}
                        fill={`url(#color-${i})`}
                      />
                    </AreaChart>
                  ) : (
                    <LineChart data={chart.data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} vertical={false} />
                      <XAxis dataKey="name" stroke={CHART_TICK_FILL} fontSize={10} tickLine={false} />
                      <YAxis stroke={CHART_TICK_FILL} fontSize={10} tickLine={false} />
                      <Tooltip {...chartTooltipStyle} />
                      <Line type="monotone" dataKey={chart.dataKey} stroke={CHART_COLORS.success} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Tables Section */}
      {tables && tables.length > 0 && (
        <div className="space-y-3">
          {tables.map((table, idx) => (
            <Card key={idx} className="border-border/40 bg-background/60 shadow-none overflow-hidden">
              <CardHeader className="p-3 pb-1.5">
                <span className="text-xs font-semibold text-foreground">{table.title}</span>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/40">
                      {table.headers.map((h, i) => (
                        <th key={i} className="p-2 font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="p-2 text-foreground font-medium">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
