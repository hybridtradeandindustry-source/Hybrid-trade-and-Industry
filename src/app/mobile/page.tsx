"use client";

import {
  ArrowRightLeft,
  ClipboardList,
  Factory,
  Package,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { BigActionButton } from "@/components/mobile/big-action-button";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import { useOfflineStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

type MobileAction = {
  href: string;
  icon: typeof Factory;
  label: string;
  description: string;
  variant?: "default" | "secondary" | "accent";
};

const ALL_ACTIONS: MobileAction[] = [
  {
    href: "/mobile/production",
    icon: Factory,
    label: "Log Production Count",
    description: "Record batch counts at checkpoints",
    variant: "default",
  },
  {
    href: "/mobile/stock-count",
    icon: ClipboardList,
    label: "Stock Count",
    description: "Count inventory on the floor",
    variant: "secondary",
  },
  {
    href: "/mobile/inventory-movement",
    icon: ArrowRightLeft,
    label: "Log Inventory Movement",
    description: "Record stock in or out",
    variant: "secondary",
  },
  {
    href: "/mobile/delivery",
    icon: Truck,
    label: "Confirm Delivery",
    description: "Capture proof of delivery",
    variant: "accent",
  },
];

function getActionsForRole(role: string): MobileAction[] {
  switch (role) {
    case "floor_employee":
    case "production_supervisor":
      return ALL_ACTIONS.filter((a) =>
        ["/mobile/production", "/mobile/stock-count"].includes(a.href)
      );
    case "warehouse_officer":
      return ALL_ACTIONS.filter((a) =>
        ["/mobile/stock-count", "/mobile/inventory-movement"].includes(a.href)
      );
    case "driver":
      return ALL_ACTIONS.filter((a) => a.href === "/mobile/delivery");
    case "factory_manager":
      return ALL_ACTIONS;
    default:
      return ALL_ACTIONS;
  }
}

export default function MobileHomePage() {
  const { user, isLoading } = useAuth();
  const { queue, isOnline } = useOfflineStore();

  if (isLoading) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center">
        <div className="size-10 animate-pulse rounded-full bg-primary/20" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex size-20 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Package className="size-10" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to continue</h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Use your worker account to access floor tasks. Demo: floor@hybridfactory.com
          </p>
        </div>
        <Button asChild size="lg" className="h-14 min-w-[200px] text-base">
          <Link href="/login">Sign In</Link>
        </Button>
      </div>
    );
  }

  const actions = getActionsForRole(user.role);
  const pendingQueue = queue.filter((q) => q.status !== "syncing");

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-muted-foreground">Welcome back</p>
        <h1 className="text-2xl font-bold tracking-tight">{user.full_name}</h1>
        <p className="mt-1 text-sm text-primary">{user.roleName}</p>
      </section>

      <section className="grid gap-4">
        {actions.map((action) => (
          <BigActionButton key={action.href} {...action} />
        ))}
      </section>

      {pendingQueue.length > 0 ? (
        <section id="sync-queue" className="rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Sync Queue</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isOnline ? "Waiting to sync" : "Saved offline"} — {pendingQueue.length}{" "}
            item{pendingQueue.length !== 1 ? "s" : ""}
          </p>
          <ul className="mt-3 space-y-2">
            {pendingQueue.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5 text-sm"
              >
                <span className="capitalize">{item.type.replace(/_/g, " ")}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    item.status === "failed"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-warning/15 text-warning-foreground"
                  )}
                >
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
