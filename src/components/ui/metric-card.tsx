import * as React from "react";
import { InfoIcon, TrendingDownIcon, TrendingUpIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface MetricCardProps extends React.ComponentProps<typeof Card> {
  title: string;
  value: React.ReactNode;
  change?: {
    value: number;
    label?: string;
  };
  icon?: React.ReactNode;
  loading?: boolean;
  /** Explanation shown in a hover tooltip via an info icon next to the title. */
  info?: React.ReactNode;
}

function MetricCard({
  className,
  title,
  value,
  change,
  icon,
  loading = false,
  info,
  ...props
}: MetricCardProps) {
  const isPositive = change ? change.value >= 0 : undefined;

  return (
    <Card
      data-slot="metric-card"
      className={cn("overflow-hidden", className)}
      {...props}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon
                  className="size-3.5 shrink-0 text-muted-foreground/70 hover:text-muted-foreground"
                  tabIndex={0}
                />
              </TooltipTrigger>
              <TooltipContent className="max-w-64">{info}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {icon && (
          <div className="flex size-9 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-muted-foreground">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {change && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                {isPositive ? (
                  <TrendingUpIcon className="size-3.5 text-success" />
                ) : (
                  <TrendingDownIcon className="size-3.5 text-destructive" />
                )}
                <span
                  className={cn(
                    "font-medium",
                    isPositive ? "text-success" : "text-destructive"
                  )}
                >
                  {isPositive ? "+" : ""}
                  {change.value}%
                </span>
                {change.label && (
                  <span className="text-muted-foreground">{change.label}</span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export { MetricCard };
