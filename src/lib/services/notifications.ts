import { v4 as uuidv4 } from "uuid";
import { APP_CONFIG, requireSupabase } from "@/lib/config";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/demo-auth";
import type { AiAlert, AiRole, LeaveRequest, Notification, NotificationType } from "@/types";

export interface CreateNotificationInput {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  actorUserId?: string | null;
}

export interface NotificationListResult {
  notifications: Notification[];
  unreadCount: number;
}

const WAREHOUSE_ROLES = ["warehouse_officer", "factory_manager", "ceo"];
const HR_APPROVAL_ROLES = ["hr_manager", "ceo"];
const FINANCE_ROLES = ["finance_manager", "ceo"];
const CATALOG_APPROVAL_ROLES = ["ceo", "factory_manager"];
const PRODUCTION_DATA_ROLES = ["factory_manager", "production_supervisor", "ceo"];

const AI_ROLE_SLUGS: Record<AiRole, string[]> = {
  ceo: ["ceo"],
  finance: ["finance_manager", "ceo"],
  production: ["factory_manager", "production_supervisor", "ceo"],
  warehouse: ["warehouse_officer", "factory_manager", "ceo"],
  hr: ["hr_manager", "ceo"],
  sales: ["sales_manager", "ceo"],
};

function normalizeEntityId(entityId?: string | null): string | null {
  if (!entityId) return null;
  const trimmed = entityId.trim();
  if (!trimmed) return null;

  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(trimmed) ? trimmed : null;
}

async function findUserIdsByRoles(
  organizationId: string,
  roleSlugs: string[]
): Promise<string[]> {
  

  const supabase = await createServiceClient();
  const { data: roles } = await supabase
    .from("roles")
    .select("id")
    .eq("organization_id", organizationId)
    .in("slug", roleSlugs);
  const roleIds = (roles ?? []).map((r) => r.id);
  if (!roleIds.length) return [];

  const { data: assignments } = await supabase
    .from("user_roles")
    .select("user_id")
    .in("role_id", roleIds);
  return [...new Set((assignments ?? []).map((a) => a.user_id as string))];
}

async function hasDuplicateUnread(
  userId: string,
  type: NotificationType,
  entityType?: string | null,
  entityId?: string | null
): Promise<boolean> {
  

  const supabase = await createServiceClient();
  let query = supabase
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("is_read", false)
    .eq("type", type)
    .limit(1);
  if (entityType) query = query.eq("entity_type", entityType);
  const normalizedEntityId = normalizeEntityId(entityId);
  if (normalizedEntityId) query = query.eq("entity_id", normalizedEntityId);
  const { data } = await query.maybeSingle();
  return Boolean(data);
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<Notification> {
  const normalizedEntityId = normalizeEntityId(input.entityId);

  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entity_type: input.entityType ?? null,
      entity_id: normalizedEntityId,
      is_read: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Notification;
}

export async function notifyRoleUsers(
  organizationId: string,
  roleSlugs: string[],
  input: Omit<CreateNotificationInput, "userId" | "organizationId">,
  options?: { skipDuplicates?: boolean }
): Promise<Notification[]> {
  const userIds = await findUserIdsByRoles(organizationId, roleSlugs);
  const created: Notification[] = [];

  for (const userId of userIds) {
    if (options?.skipDuplicates) {
      const dup = await hasDuplicateUnread(
        userId,
        input.type,
        input.entityType,
        input.entityId
      );
      if (dup) continue;
    }
    created.push(
      await createNotification({
        organizationId,
        userId,
        ...input,
      })
    );
  }
  return created;
}

export async function listNotifications(
  user: ApiUser,
  filters?: { type?: string; unreadOnly?: boolean }
): Promise<NotificationListResult> {
  

  const supabase = await createClient();
  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (filters?.type && filters.type !== "all") {
    query = query.eq("type", filters.type);
  }
  if (filters?.unreadOnly) {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const notifications = (data ?? []) as Notification[];

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_read", false);

  return { notifications, unreadCount: count ?? 0 };
}

export async function getUnreadNotificationCount(user: ApiUser): Promise<number> {
  const { unreadCount } = await listNotifications(user, { unreadOnly: true });
  return unreadCount;
}

export async function markNotificationRead(id: string, user: ApiUser): Promise<void> {
  

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(user: ApiUser): Promise<NotificationListResult> {
  

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id)
    .eq("is_read", false);
  if (error) throw new Error(error.message);
  return listNotifications(user);
}

export async function deleteNotificationRecord(id: string, user: ApiUser): Promise<void> {
  

  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

export async function runLowStockNotificationCheck(organizationId: string): Promise<void> {
  

  const supabase = await createServiceClient();
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, name, sku, quantity, unit, low_stock_threshold")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  const low = (items ?? [])
    .filter((i) => Number(i.quantity) <= Number(i.low_stock_threshold))
    .slice(0, 5);

  for (const item of low) {
    await notifyRoleUsers(
      organizationId,
      WAREHOUSE_ROLES,
      {
        type: "system",
        title: `Low stock: ${item.name}`,
        message: `${item.sku} is at ${item.quantity} ${item.unit} (threshold ${item.low_stock_threshold})`,
        entityType: "inventory_items",
        entityId: item.id as string,
      },
      { skipDuplicates: true }
    );
  }
}

export async function notifyStockCountVariance(
  params: {
    stockCountId: string;
    itemId: string;
    itemName: string;
    systemQty: number;
    countedQty: number;
    variance: number;
  },
  actor: ApiUser
): Promise<void> {
  if (params.variance === 0) return;

  await notifyRoleUsers(
    actor.organization_id,
    WAREHOUSE_ROLES,
    {
      type: "task",
      title: "Stock count discrepancy",
      message: `${params.itemName}: system ${params.systemQty}, counted ${params.countedQty} (variance ${params.variance})`,
      entityType: "stock_counts",
      entityId: params.stockCountId,
      actorUserId: actor.id,
    },
    { skipDuplicates: true }
  );
}

export async function notifyLeaveRequestSubmitted(
  leave: LeaveRequest,
  actor: ApiUser
): Promise<void> {
  await notifyRoleUsers(
    actor.organization_id,
    HR_APPROVAL_ROLES,
    {
      type: "approval",
      title: "Leave request pending approval",
      message: `${leave.leave_type} leave ${leave.start_date} → ${leave.end_date}`,
      entityType: "employees",
      entityId: leave.employee_id,
      actorUserId: actor.id,
    },
    { skipDuplicates: true }
  );
}

export async function notifyLeaveRequestReviewed(
  leave: LeaveRequest,
  status: "approved" | "rejected",
  reviewer: ApiUser
): Promise<void> {
  const employeeUserId = await resolveEmployeeUserId(leave.employee_id, reviewer.organization_id);
  if (!employeeUserId) return;

  await createNotification({
    organizationId: reviewer.organization_id,
    userId: employeeUserId,
    type: status === "approved" ? "task" : "approval",
    title: `Leave request ${status}`,
    message: `Your ${leave.leave_type} leave (${leave.start_date} → ${leave.end_date}) was ${status}.`,
    entityType: "employees",
    entityId: leave.employee_id,
    actorUserId: reviewer.id,
  });
}

export async function notifyAttendanceCorrectionPending(
  correction: { id: string; employee_id: string; shift_date: string; reason: string },
  actor: ApiUser
): Promise<void> {
  await notifyRoleUsers(
    actor.organization_id,
    HR_APPROVAL_ROLES,
    {
      type: "approval",
      title: "Attendance correction pending",
      message: `Correction for ${correction.shift_date}: ${correction.reason}`,
      entityType: "hr_attendance_corrections",
      entityId: correction.id,
      actorUserId: actor.id,
    },
    { skipDuplicates: true }
  );
}

async function resolveEmployeeUserId(
  employeeId: string,
  organizationId: string
): Promise<string | null> {
  

  const supabase = await createServiceClient();
  const { data: emp } = await supabase
    .from("employees")
    .select("email")
    .eq("id", employeeId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!emp?.email) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("email", emp.email)
    .maybeSingle();
  return (profile?.id as string | null) ?? null;
}

export async function notifyReconciliationPending(
  reconciliationId: string,
  title: string,
  actor: ApiUser
): Promise<void> {
  await notifyRoleUsers(
    actor.organization_id,
    FINANCE_ROLES,
    {
      type: "approval",
      title: "Reconciliation needs review",
      message: title,
      entityType: "reconciliation_records",
      entityId: reconciliationId,
      actorUserId: actor.id,
    },
    { skipDuplicates: true }
  );
}

export async function notifyAiAlert(
  userId: string,
  alertId: string,
  title: string,
  message: string,
  organizationId: string = APP_CONFIG.orgId
): Promise<void> {
  await createNotification({
    organizationId,
    userId,
    type: "ai_alert",
    title,
    message,
    entityType: "ai_alerts",
    entityId: alertId,
  });
}

async function fetchUnresolvedAiAlerts(organizationId: string): Promise<AiAlert[]> {
  

  const supabase = await createServiceClient();
  const { data } = await supabase
    .from("ai_alerts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_resolved", false);
  return (data ?? []) as AiAlert[];
}

/** Mirror unresolved AI alerts into user notification inboxes (deduped). */
export async function syncAiAlertsToNotifications(
  organizationId: string = APP_CONFIG.orgId
): Promise<void> {
  const alerts = await fetchUnresolvedAiAlerts(organizationId);
  for (const alert of alerts) {
    const roleSlugs = AI_ROLE_SLUGS[alert.role] ?? ["ceo"];
    await notifyRoleUsers(
      organizationId,
      roleSlugs,
      {
        type: "ai_alert",
        title: alert.title,
        message: alert.message,
        entityType: "ai_alerts",
        entityId: alert.id,
      },
      { skipDuplicates: true }
    );
  }
}

/** Notify production roles when daily output or other required data is missing. */
export async function syncMissingDataNotifications(
  organizationId: string = APP_CONFIG.orgId
): Promise<void> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabase
    .from("production_counts")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("production_date", today);

  const gaps: string[] = [];
  if (!count) {
    gaps.push(`No production counts recorded for ${today}`);
  }

  for (const gap of gaps) {
    const entityId = gap.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);
    await notifyRoleUsers(
      organizationId,
      PRODUCTION_DATA_ROLES,
      {
        type: "missing_data",
        title: "Missing production data",
        message: gap,
        entityType: "missing_data",
        entityId,
      },
      { skipDuplicates: true }
    );
  }
}

export async function notifyCatalogChangeSubmitted(
  requestId: string,
  entityType: string,
  actor: ApiUser
): Promise<void> {
  await notifyRoleUsers(
    actor.organization_id,
    CATALOG_APPROVAL_ROLES,
    {
      type: "approval",
      title: "Catalog change pending approval",
      message: `New ${entityType.replace(/_/g, " ")} change request requires review`,
      entityType: "inventory_catalog_change_requests",
      entityId: requestId,
      actorUserId: actor.id,
    },
    { skipDuplicates: true }
  );
}

export async function notifyCatalogChangeReviewed(
  requestId: string,
  status: "approved" | "rejected",
  requesterId: string,
  reviewer: ApiUser
): Promise<void> {
  await createNotification({
    organizationId: reviewer.organization_id,
    userId: requesterId,
    type: status === "approved" ? "task" : "approval",
    title: `Catalog change ${status}`,
    message: `Your catalog change request was ${status}.`,
    entityType: "inventory_catalog_change_requests",
    entityId: requestId,
    actorUserId: reviewer.id,
  });
}
