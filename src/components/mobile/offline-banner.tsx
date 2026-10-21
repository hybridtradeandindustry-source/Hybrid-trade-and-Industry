"use client";

import { CloudOff, CloudUpload, Loader2 } from "lucide-react";
import { useOfflineStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";

interface OfflineBannerProps {
  className?: string;
}

export function OfflineBanner({ className }: OfflineBannerProps) {
  const { isOnline, queue } = useOfflineStore();
  const pending = queue.filter((q) => q.status === "pending").length;
  const syncing = queue.filter((q) => q.status === "syncing").length;
  const failed = queue.filter((q) => q.status === "failed").length;

  if (isOnline && pending === 0 && syncing === 0 && failed === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b px-4 py-3 text-sm font-medium",
        !isOnline
          ? "border-warning/30 bg-warning/10 text-warning-foreground"
          : failed > 0
            ? "border-destructive/30 bg-destructive/10 text-destructive"
            : "border-primary/30 bg-primary/10 text-primary",
        className
      )}
      role="status"
      aria-live="polite"
    >
      {!isOnline ? (
        <CloudOff className="size-5 shrink-0" aria-hidden />
      ) : syncing > 0 ? (
        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
      ) : (
        <CloudUpload className="size-5 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        {!isOnline ? (
          <p>Offline — changes will sync when connected</p>
        ) : syncing > 0 ? (
          <p>Syncing {syncing} item{syncing !== 1 ? "s" : ""}…</p>
        ) : failed > 0 ? (
          <p>{failed} sync failed — will retry automatically</p>
        ) : (
          <p>{pending} item{pending !== 1 ? "s" : ""} queued for sync</p>
        )}
      </div>
    </div>
  );
}
