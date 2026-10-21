"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface BigActionButtonProps {
  href: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  variant?: "default" | "secondary" | "accent";
  className?: string;
}

const variantStyles = {
  default:
    "border-border bg-card hover:border-primary/25 hover:bg-accent/40 active:scale-[0.98]",
  secondary:
    "border-border bg-muted/30 hover:border-primary/20 hover:bg-muted/50 active:scale-[0.98]",
  accent:
    "border-success/20 bg-success/[0.04] hover:border-success/30 hover:bg-success/[0.08] active:scale-[0.98]",
};

export function BigActionButton({
  href,
  icon: Icon,
  label,
  description,
  variant = "default",
  className,
}: BigActionButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[120px] flex-col items-start justify-between rounded-2xl border p-5 shadow-sm transition-all duration-200",
        variantStyles[variant],
        className
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-xl bg-background/60 text-primary shadow-inner">
        <Icon className="size-7" strokeWidth={1.75} />
      </div>
      <div className="mt-4 w-full">
        <p className="text-lg font-semibold leading-tight tracking-tight">{label}</p>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
    </Link>
  );
}
