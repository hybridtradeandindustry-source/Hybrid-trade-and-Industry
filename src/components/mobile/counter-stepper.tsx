"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CounterStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  variant?: "default" | "success" | "destructive";
  className?: string;
}

const variantStyles = {
  default: "text-foreground",
  success: "text-success",
  destructive: "text-destructive",
};

export function CounterStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99999,
  step = 1,
  variant = "default",
  className,
}: CounterStepperProps) {
  const decrement = () => onChange(Math.max(min, value - step));
  const increment = () => onChange(Math.min(max, value + step));

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-4",
        className
      )}
    >
      <p className="mb-3 text-sm font-medium text-muted-foreground">{label}</p>
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-14 shrink-0 rounded-xl text-xl"
          onClick={decrement}
          disabled={value <= min}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-6" />
        </Button>
        <span
          className={cn(
            "min-w-[4rem] text-center text-4xl font-bold tabular-nums tracking-tight",
            variantStyles[variant]
          )}
        >
          {value.toLocaleString()}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-14 shrink-0 rounded-xl text-xl"
          onClick={increment}
          disabled={value >= max}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-6" />
        </Button>
      </div>
    </div>
  );
}
