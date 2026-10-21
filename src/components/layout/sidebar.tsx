"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Brain,
  Building2,
  CreditCard,
  DollarSign,
  Factory,
  FileBarChart,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Package,
  Recycle,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/constants";
import { BrandLogo } from "@/components/brand/brand-logo";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { useUnreadNotificationCount } from "@/hooks/use-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const ICON_MAP = {
  LayoutDashboard,
  DollarSign,
  Factory,
  Package,
  Recycle,
  Receipt,
  Truck,
  Building2,
  ShoppingCart,
  Users,
  UserCog,
  FileBarChart,
  Brain,
  FolderOpen,
  Shield,
  Bell,
  Settings,
  CreditCard,
  Landmark,
} as const;

export function Sidebar() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();
  const { sidebarOpen, setSidebarOpen, viewScope } = useAppStore();
  const { unreadCount } = useUnreadNotificationCount();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.href === "/dashboard/stock-plastic" && viewScope === "block") return false;
    return hasPermission(item.permission.resource, item.permission.action);
  });

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border/60 px-5">
          <BrandLogo variant="sidebar" href="/dashboard" />
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {visibleItems.map((item) => {
              const Icon = ICON_MAP[item.icon as keyof typeof ICON_MAP];
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                    isActive
                      ? "bg-sidebar-accent text-foreground shadow-none ring-1 ring-border/80"
                      : "text-muted-foreground hover:bg-accent/80 hover:text-foreground"
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}
                    />
                  )}
                  {item.label}
                  {item.href === "/dashboard/notifications" && unreadCount > 0 ? (
                    <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1 text-[10px]">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        <div className="border-t border-border/60 p-4">
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <p className="text-xs font-medium text-foreground">AI Assistant</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Monitoring production, finance, and delivery risks in real time.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
