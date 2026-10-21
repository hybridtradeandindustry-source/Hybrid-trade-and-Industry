/** Muted, professional badge styles for RBAC / admin permission chips */

export const RESOURCE_COLORS: Record<string, string> = {
  dashboard: "border-border/60 bg-muted/50 text-foreground",
  finance: "border-chart-2/20 bg-chart-2/8 text-chart-2",
  production: "border-chart-3/20 bg-chart-3/8 text-chart-3",
  inventory: "border-chart-1/20 bg-chart-1/8 text-chart-1",
  sales: "border-chart-4/20 bg-chart-4/8 text-chart-4",
  hr: "border-chart-5/20 bg-chart-5/8 text-chart-5",
  reports: "border-border/60 bg-secondary text-secondary-foreground",
  ai: "border-primary/20 bg-primary/8 text-primary",
  documents: "border-border/60 bg-muted/50 text-muted-foreground",
  notifications: "border-border/60 bg-muted/40 text-muted-foreground",
  audit: "border-destructive/20 bg-destructive/8 text-destructive",
  admin: "border-primary/25 bg-primary/10 text-primary",
};

export function resourceLabelClass(resource: string) {
  return RESOURCE_COLORS[resource] ?? "border-border/60 bg-muted/40 text-muted-foreground";
}
