"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import type { ViewScope } from "@/types";

function useScope() {
  return useAppStore((s) => s.viewScope);
}

function useInvalidate(keys: string[]) {
  const qc = useQueryClient();
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function useDashboard() {
  const scope = useScope();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["dashboard", scope],
    queryFn: () => api.get<Record<string, unknown>>("/api/dashboard", { scope }, user),
    enabled: !!user,
  });
}

export function useFinance(status = "all") {
  const scope = useScope();
  const { user } = useAuth();
  const invalidate = useInvalidate(["finance", "dashboard"]);

  const query = useQuery({
    queryKey: ["finance", scope, status],
    queryFn: () => api.get<Record<string, unknown>>("/api/finance", { scope, status }, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/finance", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate, syncMutation: mutate, verifyMutation: mutate };
}

export function useFinanceDashboard(
  period: string = "this_month",
  options?: { monthYear?: string; dateFrom?: string; dateTo?: string }
) {
  const scope = useScope();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["finance", "dashboard", scope, period, options?.monthYear, options?.dateFrom, options?.dateTo],
    queryFn: () =>
      api.get<Record<string, unknown>>(
        "/api/finance",
        {
          scope,
          view: "dashboard",
          period,
          ...(options?.monthYear ? { monthYear: options.monthYear } : {}),
          ...(options?.dateFrom ? { dateFrom: options.dateFrom } : {}),
          ...(options?.dateTo ? { dateTo: options.dateTo } : {}),
        },
        user
      ),
    enabled: !!user,
  });
}

export function useBlockFactoryDashboard(period = "this_month") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["block-factory", "dashboard", period],
    queryFn: () =>
      api.get<import("@/lib/services/block-factory-dashboard").BlockFactoryDashboardData>(
        "/api/block-factory",
        { period },
        user
      ),
    enabled: !!user,
  });
}

export function usePurchasing() {
  const scope = useScope();
  const { user } = useAuth();
  // Purchase actions ripple well past the purchases table: stock and item unit cost,
  // supplier balance and total_purchases, and — for cement/poliche — the daily-log waste
  // costs priced off that unit cost.
  const invalidate = useInvalidate([
    "purchasing",
    "inventory",
    "finance",
    "block-factory",
    "dashboard",
    "suppliers",
    "supplier-detail",
    "production",
    "daily-logs",
    "production-batch-detail",
  ]);

  const query = useQuery({
    queryKey: ["purchasing", scope],
    queryFn: () =>
      api.get<import("@/lib/services/purchasing").PurchasingData>("/api/purchasing", { scope }, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/purchasing", { scope, ...body }, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate };
}

export function useExpenses(
  period: string = "this_month",
  options?: { monthYear?: string; dateFrom?: string; dateTo?: string }
) {
  const scope = useScope();
  const { user } = useAuth();
  const invalidate = useInvalidate(["expenses", "finance", "dashboard"]);

  const query = useQuery({
    queryKey: ["expenses", scope, period, options?.monthYear, options?.dateFrom, options?.dateTo],
    queryFn: () =>
      api.get<import("@/types").ExpensesDataPayload>(
        "/api/expenses",
        {
          scope,
          period,
          monthYear: options?.monthYear,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
        },
        user
      ),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/expenses", { scope, ...body }, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate };
}

export function useSuppliers() {
  const { user } = useAuth();
  const invalidate = useInvalidate(["suppliers", "purchasing", "finance", "dashboard"]);

  const query = useQuery({
    queryKey: ["suppliers"],
    queryFn: () => api.get<import("@/types").Supplier[]>("/api/suppliers", undefined, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/suppliers", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate };
}

export function useSupplierDetail(supplierId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["supplier-detail", supplierId],
    queryFn: () =>
      api.get<import("@/lib/services/supplier-detail").SupplierDetail>(
        `/api/suppliers/${supplierId}`,
        undefined,
        user
      ),
    enabled: !!user && !!supplierId,
  });
}

export function useBanks(includeInactive = false) {
  const { user } = useAuth();
  const invalidate = useInvalidate(["banks"]);

  const query = useQuery({
    queryKey: ["banks", includeInactive ? "all" : "active"],
    queryFn: () =>
      api.get<import("@/types").Bank[]>(
        "/api/banks",
        includeInactive ? { all: "1" } : undefined,
        user
      ),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/banks", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate };
}

/** Every bank account across every bank — the level payments actually get attributed to. */
export function useBankAccounts() {
  const { user } = useAuth();
  const invalidate = useInvalidate(["banks", "bank-accounts"]);

  const query = useQuery({
    queryKey: ["banks", "with-accounts"],
    queryFn: () =>
      api.get<{ banks: import("@/types").Bank[]; accounts: import("@/types").BankAccount[] }>(
        "/api/banks",
        { with_accounts: "1", all: "1" },
        user
      ),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/banks", body, user),
    onSuccess: invalidate,
  });

  return {
    ...query,
    data: query.data?.accounts,
    mutate,
  };
}

export function useBankDetail(bankId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bank-detail", bankId],
    queryFn: () =>
      api.get<import("@/lib/services/bank-detail").BankDetail>(
        `/api/banks/${bankId}`,
        undefined,
        user
      ),
    enabled: !!user && !!bankId,
  });
}

export function useProduction() {
  const scope = useScope();
  const { user } = useAuth();
  const invalidate = useInvalidate(["production", "inventory", "orders", "dashboard", "block-factory", "ai"]);

  const query = useQuery({
    queryKey: ["production", scope],
    queryFn: () => api.get<Record<string, unknown>>("/api/production", { scope }, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{
        count?: unknown;
        orderAdvanced?: { orderId: string; orderNumber: string } | null;
      }>("/api/production", body, user),
    onSuccess: invalidate,
  });

  const exportReportMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<{ filename: string; mimeType: string; data: string }>(
        "/api/production",
        { action: "export_report", scope, ...body },
        user
      ),
  });

  return { ...query, mutate, createMutation: mutate, exportReportMutation };
}

/** Block batches for batch selection in Orders — always scope:block, independent of the global viewScope. */
export function useBlockBatchesForOrders() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["production", "block", "for-orders"],
    queryFn: () => api.get<Record<string, unknown>>("/api/production", { scope: "block" }, user),
    enabled: !!user,
  });
}

export function useCustomerDetail(customerId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["customer-detail", customerId],
    queryFn: () =>
      api.get<import("@/lib/services/customer-detail").CustomerDetail>(
        `/api/customers/${customerId}`,
        undefined,
        user
      ),
    enabled: !!user && !!customerId,
  });
}

export function useBatchDetail(batchId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["production-batch-detail", batchId],
    queryFn: () =>
      api.get<import("@/lib/services/production-batch-detail").BatchDetail>(
        `/api/production/batches/${batchId}`,
        undefined,
        user
      ),
    enabled: !!user && !!batchId,
  });
}

export function useFinanceSettings() {
  const { user } = useAuth();
  const invalidate = useInvalidate(["finance-settings"]);

  const query = useQuery({
    queryKey: ["finance-settings"],
    queryFn: () =>
      api.get<import("@/types").FinanceSettings>("/api/finance/settings", undefined, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (updates: {
      withholding_tax_rate_percent?: number;
      vat_rate_percent?: number;
    }) =>
      api.patch<import("@/types").FinanceSettings>(
        "/api/finance/settings",
        updates,
        user
      ),
    onSuccess: invalidate,
  });

  return { ...query, updateMutation: mutate };
}

export function useProductionSettings() {
  const { user } = useAuth();
  const invalidate = useInvalidate(["production-settings"]);

  const query = useQuery({
    queryKey: ["production-settings"],
    queryFn: () =>
      api.get<import("@/types").ProductionSettings>("/api/production/settings", undefined, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (
      updates: { default_daily_target_plates?: number; cement_kg_per_bag?: number }
    ) =>
      api.patch<import("@/types").ProductionSettings>(
        "/api/production/settings",
        updates,
        user
      ),
    onSuccess: invalidate,
  });

  return { ...query, updateMutation: mutate };
}

export function useDailyLogs(batchId: string | null) {
  const { user } = useAuth();
  const invalidate = useInvalidate(["daily-logs", "production"]);

  const query = useQuery({
    queryKey: ["daily-logs", batchId],
    queryFn: () =>
      api.get<{ logs: import("@/types").ProductionDailyLog[] }>(
        "/api/production",
        { daily_logs_batch_id: batchId ?? "" },
        user
      ),
    enabled: !!user && !!batchId,
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<import("@/types").ProductionDailyLog>(
        "/api/production",
        { action: "create_daily_log", ...body },
        user
      ),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      api.post("/api/production", { action: "delete_daily_log", id }, user),
    onSuccess: invalidate,
  });

  return { ...query, createMutation, deleteMutation };
}

export function useCreditDashboard() {
  const scope = useScope();
  const { user } = useAuth();
  return useQuery({
    queryKey: ["credit", scope],
    queryFn: () => api.get<Record<string, unknown>>("/api/credit", { scope }, user),
    enabled: !!user,
  });
}

export function useInventory() {
  const scope = useScope();
  const { user } = useAuth();
  const invalidate = useInvalidate(["inventory", "ai", "block-factory"]);

  const query = useQuery({
    queryKey: ["inventory", scope],
    queryFn: () => api.get<Record<string, unknown>>("/api/inventory", { scope }, user),
    enabled: !!user,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/inventory", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate, stockCountMutation: mutate, movementMutation: mutate };
}

/** Full org catalog for admin setup — always combined scope */
export function useInventoryCatalog() {
  const { user } = useAuth();
  const invalidate = useInvalidate(["inventory"]);

  const query = useQuery({
    queryKey: ["inventory", "catalog"],
    queryFn: () =>
      api.get<Record<string, unknown>>(
        "/api/inventory",
        { scope: "combined", includeInactiveCatalog: "1" },
        user
      ),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/inventory", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate, refetch: query.refetch };
}

export function useOrders() {
  const scope = useScope();
  const { user } = useAuth();
  const invalidate = useInvalidate(["orders", "customers", "dashboard", "inventory"]);

  const query = useQuery({
    queryKey: ["orders", scope],
    queryFn: () => api.get<unknown[]>("/api/orders", { scope }, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/orders", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate, updateMutation: mutate, createMutation: mutate, deliverMutation: mutate };
}

export function useCustomers() {
  const { user } = useAuth();
  const invalidate = useInvalidate(["customers", "orders", "dashboard", "ai"]);

  const query = useQuery({
    queryKey: ["customers"],
    queryFn: () => api.get<unknown[]>("/api/customers", undefined, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/customers", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate };
}

export function useHr(options?: { attendanceMonth?: number; attendanceYear?: number }) {
  const scope = useScope();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate(["hr", "dashboard"]);

  const query = useQuery({
    queryKey: ["hr", scope, options?.attendanceMonth, options?.attendanceYear],
    queryFn: () =>
      api.get<Record<string, unknown>>(
        "/api/hr",
        {
          scope,
          ...(options?.attendanceMonth
            ? { attendance_month: String(options.attendanceMonth) }
            : {}),
          ...(options?.attendanceYear ? { attendance_year: String(options.attendanceYear) } : {}),
        },
        user
      ),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/hr", body, user),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["employee-detail"] });
    },
  });

  return { ...query, mutate, approveMutation: mutate };
}

export function useEmployeeDetail(employeeId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = useInvalidate(["hr", "dashboard", "employee-detail"]);

  const query = useQuery({
    queryKey: ["employee-detail", employeeId],
    queryFn: () =>
      api.get<import("@/lib/services/employee-detail").EmployeeDetail>(
        `/api/hr/${employeeId}`,
        undefined,
        user
      ),
    enabled: !!user && !!employeeId,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/hr", body, user),
    onSuccess: () => {
      invalidate();
      if (employeeId) {
        void queryClient.invalidateQueries({ queryKey: ["employee-detail", employeeId] });
      }
    },
  });

  return { ...query, mutate };
}

export function useAi(role?: string) {
  const scope = useScope();
  const { user } = useAuth();
  const effectiveRole = role ?? user?.role ?? "ceo";
  const invalidate = useInvalidate(["ai"]);

  const query = useQuery({
    queryKey: ["ai", scope, effectiveRole],
    queryFn: () => api.get<Record<string, unknown>>("/api/ai", { scope, role: effectiveRole }, user),
    enabled: !!user,
  });

  const chatMutation = useMutation({
    mutationFn: (message: string) =>
      api.post<{
        reply: string;
        confidence: number;
        tools_used?: string[];
        data?: unknown[];
      }>("/api/ai", { message, role: effectiveRole, scope }, user),
    onSuccess: invalidate,
  });

  const resolveAlertMutation = useMutation({
    mutationFn: (id: string) => api.post("/api/ai", { action: "resolve_alert", id }, user),
    onSuccess: invalidate,
  });

  return { ...query, chatMutation, resolveAlertMutation };
}

export function useProductionCapacity(live = false) {
  const scope = useScope();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ai", "capacity", scope, live],
    queryFn: () =>
      api.get<import("@/types/production-intelligence").CapacityResult>(
        "/api/ai/capacity",
        { scope: scope === "recycling" ? "recycling" : "block", live: live ? "1" : undefined },
        user
      ),
    enabled: !!user && scope !== "recycling",
  });
}

export function useProductionIntelligence(live = false) {
  const scope = useScope();
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ai", "intelligence", scope, live],
    queryFn: () =>
      api.get<import("@/types/production-intelligence").ProductionIntelligence>(
        "/api/ai/intelligence",
        { scope: scope === "recycling" ? "recycling" : "block", live: live ? "1" : undefined },
        user
      ),
    enabled: !!user,
  });
}

export function useRefreshAi() {
  const { user } = useAuth();
  const invalidate = useInvalidate([
    "ai",
    "customers",
    "production",
    "inventory",
    "block-factory",
    "dashboard",
  ]);

  return useMutation({
    mutationFn: (body?: { useLlm?: boolean }) =>
      api.post("/api/ai/refresh", body ?? {}, user),
    onSuccess: invalidate,
  });
}

export function useNotifications(filters?: { type?: string; unreadOnly?: boolean }) {
  const { user } = useAuth();
  const invalidate = useInvalidate(["notifications"]);

  const query = useQuery({
    queryKey: ["notifications", filters?.type ?? "all", filters?.unreadOnly ?? false],
    queryFn: () =>
      api.get<{ notifications: unknown[]; unreadCount: number }>(
        "/api/notifications",
        {
          type: filters?.type && filters.type !== "all" ? filters.type : undefined,
          unreadOnly: filters?.unreadOnly ? "1" : undefined,
        },
        user
      ),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown> = { action: "mark_all_read" }) =>
      api.post<{ notifications: unknown[]; unreadCount: number }>("/api/notifications", body, user),
    onSuccess: invalidate,
  });

  const notifications = (query.data?.notifications ?? []) as import("@/types").Notification[];
  const unreadCount = query.data?.unreadCount ?? notifications.filter((n) => !n.is_read).length;

  return {
    ...query,
    data: notifications,
    notifications,
    unreadCount,
    mutate,
    markReadMutation: mutate,
  };
}

export function useUnreadNotificationCount() {
  const { unreadCount, isLoading } = useNotifications();
  return { unreadCount, isLoading };
}

export function useAudit(search?: string, action?: string) {
  const { user } = useAuth();
  const deferredSearch = search?.trim() || undefined;

  return useInfiniteQuery({
    queryKey: ["audit", deferredSearch, action ?? "all"],
    queryFn: ({ pageParam }) =>
      api.get<{
        logs: unknown[];
        nextCursor: string | null;
        hasMore: boolean;
      }>(
        "/api/audit",
        {
          search: deferredSearch,
          action: action && action !== "all" ? action : undefined,
          cursor: pageParam ?? undefined,
          limit: "50",
        },
        user
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!user,
    refetchOnMount: true,
  });
}

export function useDocuments(tag?: string) {
  const { user } = useAuth();
  const invalidate = useInvalidate(["documents"]);

  const query = useQuery({
    queryKey: ["documents", tag],
    queryFn: () => api.get<unknown[]>("/api/documents", tag ? { tag } : undefined, user),
    enabled: !!user,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/documents", body, user),
    onSuccess: invalidate,
  });

  return { ...query, mutate, uploadMutation: mutate };
}

export function useReports() {
  const { user } = useAuth();
  const scope = useScope();
  const invalidate = useInvalidate(["reports"]);

  const query = useQuery({
    queryKey: ["reports"],
    queryFn: () => api.get<Record<string, unknown>>("/api/reports", undefined, user),
    enabled: !!user,
  });

  const exportMutation = useMutation({
    mutationFn: (vars: {
      templateId: string;
      format: "PDF" | "Excel";
      filters?: Record<string, unknown>;
      templateSlug?: string;
      templateModule?: string;
      templateName?: string;
    }) =>
      api.post<{ filename: string; mimeType: string; data: string }>(
        "/api/reports",
        { ...vars, scope },
        user
      ),
  });

  const scheduleMutation = useMutation({
    mutationFn: (vars: { id: string; active: boolean }) =>
      api.post("/api/reports", { action: "toggle_schedule", ...vars }, user),
    onSuccess: invalidate,
  });

  return { ...query, exportMutation, scheduleMutation };
}

export function useAdmin() {
  const { user, hasPermission } = useAuth();
  const canManage = !!user && hasPermission("admin", "manage");
  const invalidate = useInvalidate(["admin-roles", "admin-users", "admin-permissions"]);

  const rolesQuery = useQuery({
    queryKey: ["admin-roles"],
    queryFn: () => api.get<unknown[]>("/api/admin/roles", undefined, user),
    enabled: canManage,
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api.get<unknown[]>("/api/admin/roles", { type: "users" }, user),
    enabled: canManage,
  });

  const permissionsQuery = useQuery({
    queryKey: ["admin-permissions"],
    queryFn: () => api.get<unknown[]>("/api/admin/roles", { type: "permissions" }, user),
    enabled: canManage,
  });

  const mutate = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/admin/roles", body, user),
    onSuccess: invalidate,
  });

  return { rolesQuery, usersQuery, permissionsQuery, mutate, canManage };
}

export function useAdminRoles() {
  return useAdmin().rolesQuery;
}

export function useOfflineSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (submissions: { type: string; payload: Record<string, unknown> }[]) =>
      api.post("/api/offline/sync", { submissions }, user),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function downloadBase64File(data: string, filename: string, mimeType: string) {
  const link = document.createElement("a");
  link.href = `data:${mimeType};base64,${data}`;
  link.download = filename;
  link.click();
}
