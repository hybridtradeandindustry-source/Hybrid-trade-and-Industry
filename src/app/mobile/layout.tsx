"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListOrdered } from "lucide-react";
import { OfflineBanner } from "@/components/mobile/offline-banner";
import { useOfflineStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { APP_SHORT_NAME, APP_TAGLINE } from "@/constants";

function MobileBottomNav() {
  const pathname = usePathname();
  const { queue } = useOfflineStore();
  const pendingCount = queue.filter(
    (q) => q.status === "pending" || q.status === "syncing"
  ).length;

  const navItems = [
    { href: "/mobile", label: "Home", icon: Home, exact: true },
    {
      href: "/mobile#sync-queue",
      label: "Queue",
      icon: ListOrdered,
      exact: false,
      badge: pendingCount,
    },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/80 bg-card/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && item.label === "Queue"
              ? false
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                "relative flex min-h-[56px] min-w-[80px] flex-1 flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
                isActive
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="size-6" strokeWidth={isActive ? 2.25 : 1.75} />
              <span>{item.label}</span>
              {item.badge && item.badge > 0 ? (
                <span className="absolute right-4 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  const { setOnline } = useOfflineStore();

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, [setOnline]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-primary">Field App</p>
            <p className="text-sm font-semibold">{APP_SHORT_NAME}</p>
            <p className="text-[10px] text-muted-foreground">{APP_TAGLINE}</p>
          </div>
        </div>
        <OfflineBanner />
      </header>
      <main
        className="mx-auto max-w-lg px-4 pb-28 pt-4"
        style={{ paddingBottom: "calc(7rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
