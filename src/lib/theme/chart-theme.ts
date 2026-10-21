/** Shared Recharts styling — uses CSS variables from globals.css */

export const CHART_GRID_STROKE = "var(--border)";
export const CHART_TICK_FILL = "var(--muted-foreground)";

export const CHART_COLORS = {
  c1: "var(--chart-1)",
  c2: "var(--chart-2)",
  c3: "var(--chart-3)",
  c4: "var(--chart-4)",
  c5: "var(--chart-5)",
  success: "var(--success)",
  info: "var(--info)",
} as const;

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "0 4px 24px color-mix(in oklch, var(--foreground) 8%, transparent)",
  fontSize: 12,
} as const;

export const CHART_LABEL_STYLE = {
  color: "var(--foreground)",
} as const;

export const HEALTH_CHART_COLORS = {
  critical: "var(--destructive)",
  low: "var(--warning)",
  ok: "var(--success)",
  overstock: "var(--info)",
} as const;
