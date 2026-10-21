"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useOfflineSync } from "@/hooks/use-api";
import { useOfflineStore } from "@/stores/app-store";

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { queue, isOnline, setOnline, removeFromQueue } = useOfflineStore();
  const syncMutation = useOfflineSync();

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      toast.success("Back online — syncing queued submissions");
    };
    const handleOffline = () => {
      setOnline(false);
      toast.warning("You are offline. Submissions will sync when connected.");
    };

    setOnline(navigator.onLine);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline]);

  useEffect(() => {
    if (!isOnline || queue.length === 0 || syncMutation.isPending) return;

    const pending = queue.filter((q) => q.status === "pending");
    if (pending.length === 0) return;

    syncMutation.mutate(
      pending.map((item) => ({ type: item.type, payload: item.payload })),
      {
        onSuccess: () => {
          pending.forEach((item) => removeFromQueue(item.id));
          toast.success(`${pending.length} submission(s) synced successfully`);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Sync failed");
        },
      }
    );
  }, [isOnline, queue, syncMutation, removeFromQueue]);

  return <>{children}</>;
}
