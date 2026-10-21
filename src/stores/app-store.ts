import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewScope } from "@/types";

interface AppState {
  viewScope: ViewScope;
  sidebarOpen: boolean;
  setViewScope: (scope: ViewScope) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      viewScope: "combined",
      sidebarOpen: true,
      setViewScope: (scope) => set({ viewScope: scope }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    { name: "elecnova-app" }
  )
);

interface OfflineQueueItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "syncing" | "failed";
}

interface OfflineState {
  queue: OfflineQueueItem[];
  isOnline: boolean;
  addToQueue: (item: Omit<OfflineQueueItem, "id" | "createdAt" | "status">) => void;
  removeFromQueue: (id: string) => void;
  setOnline: (online: boolean) => void;
  markSyncing: (id: string) => void;
  markFailed: (id: string) => void;
}

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set) => ({
      queue: [],
      isOnline: true,
      addToQueue: (item) =>
        set((s) => ({
          queue: [
            ...s.queue,
            {
              ...item,
              id: crypto.randomUUID(),
              createdAt: new Date().toISOString(),
              status: "pending" as const,
            },
          ],
        })),
      removeFromQueue: (id) =>
        set((s) => ({ queue: s.queue.filter((q) => q.id !== id) })),
      setOnline: (online) => set({ isOnline: online }),
      markSyncing: (id) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.id === id ? { ...q, status: "syncing" as const } : q
          ),
        })),
      markFailed: (id) =>
        set((s) => ({
          queue: s.queue.map((q) =>
            q.id === id ? { ...q, status: "failed" as const } : q
          ),
        })),
    }),
    { name: "elecnova-offline" }
  )
);
