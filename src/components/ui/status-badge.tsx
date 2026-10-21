import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
  {
    variants: {
      status: {
        draft: "border-muted-foreground/20 bg-muted text-muted-foreground",
        pending:
          "border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning/15",
        processing:
          "border-info/30 bg-info/10 text-info dark:bg-info/15",
        in_progress:
          "border-info/30 bg-info/10 text-info dark:bg-info/15",
        confirmed:
          "border-primary/30 bg-primary/10 text-primary dark:bg-primary/15",
        shipped:
          "border-chart-2/30 bg-chart-2/10 text-chart-2",
        delivered:
          "border-success/30 bg-success/10 text-success dark:bg-success/15",
        completed:
          "border-success/30 bg-success/10 text-success dark:bg-success/15",
        cancelled:
          "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15",
        rejected:
          "border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15",
        on_hold:
          "border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning/15",
        active:
          "border-success/30 bg-success/10 text-success dark:bg-success/15",
        inactive:
          "border-muted-foreground/20 bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      status: "pending",
    },
  }
);

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  processing: "Processing",
  in_progress: "In Progress",
  confirmed: "Confirmed",
  shipped: "Shipped",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  on_hold: "On Hold",
  active: "Active",
  inactive: "Inactive",
};

export type StatusBadgeStatus = NonNullable<
  VariantProps<typeof statusBadgeVariants>["status"]
>;

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusBadgeVariants> {
  label?: string;
  showDot?: boolean;
}

function StatusBadge({
  className,
  status,
  label,
  showDot = true,
  ...props
}: StatusBadgeProps) {
  const resolvedStatus = status ?? "pending";
  const displayLabel = label ?? statusLabels[resolvedStatus] ?? resolvedStatus;

  return (
    <span
      data-slot="status-badge"
      className={cn(statusBadgeVariants({ status: resolvedStatus }), className)}
      {...props}
    >
      {showDot && (
        <span
          className="size-1.5 shrink-0 rounded-full bg-current"
          aria-hidden="true"
        />
      )}
      {displayLabel}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
