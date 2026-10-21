import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-card-foreground",
        destructive:
          "border-destructive/30 bg-destructive/10 text-destructive [&>svg]:text-destructive",
        success:
          "border-success/30 bg-success/10 text-success [&>svg]:text-success",
        warning:
          "border-warning/30 bg-warning/10 text-warning-foreground [&>svg]:text-warning",
        info: "border-info/30 bg-info/10 text-info [&>svg]:text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const alertIcons = {
  default: InfoIcon,
  destructive: AlertCircleIcon,
  success: CheckCircle2Icon,
  warning: TriangleAlertIcon,
  info: InfoIcon,
} as const;

function Alert({
  className,
  variant,
  showIcon = true,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    showIcon?: boolean;
  }) {
  const resolvedVariant = variant ?? "default";
  const Icon = alertIcons[resolvedVariant];

  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {showIcon && <Icon className="size-4" />}
      {props.children}
    </div>
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("mb-1 font-medium leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("text-sm opacity-90 [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
