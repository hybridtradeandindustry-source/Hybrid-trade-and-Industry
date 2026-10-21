import * as React from "react";

import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps extends React.ComponentProps<"div"> {
  size?: "sm" | "default" | "lg";
  label?: string;
}

const sizeClasses = {
  sm: "size-4 border-2",
  default: "size-6 border-2",
  lg: "size-10 border-[3px]",
} as const;

function LoadingSpinner({
  className,
  size = "default",
  label = "Loading",
  ...props
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-label={label}
      data-slot="loading-spinner"
      className={cn("inline-flex items-center justify-center", className)}
      {...props}
    >
      <div
        className={cn(
          "animate-spin rounded-full border-primary/20 border-t-primary",
          sizeClasses[size]
        )}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export { LoadingSpinner };
