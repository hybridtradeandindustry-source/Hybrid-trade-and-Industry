import { requireSupabase } from "@/lib/config";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/demo-auth";
import type { AuditLog } from "@/types";
import { isDateInRange } from "@/lib/reports/filters";
import type { AuditReportFilters } from "@/lib/reports/types";

export interface LogAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  userId: string;
  organizationId: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

/** Write an immutable audit entry (demo memory or Supabase). */
export async function logAudit(input: LogAuditInput): Promise<void> {
  

  const supabase = await createServiceClient();
  const { error } = await supabase.from("audit_logs").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    action: input.action,
    old_values: input.oldValues ?? null,
    new_values: input.newValues ?? null,
    metadata: input.metadata ?? null,
  });
  if (error) throw new Error(error.message);
}

export function logAuditFromUser(
  user: ApiUser,
  entityType: string,
  entityId: string,
  action: string,
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null
): Promise<void> {
  return logAudit({
    entityType,
    entityId,
    action,
    userId: user.id,
    organizationId: user.organization_id,
    oldValues,
    newValues,
    metadata,
  });
}

function escapePostgrestFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function matchesAuditSearch(log: AuditLog, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;

  const entityLabel = log.entity_type.toLowerCase().replace(/_/g, " ");
  const haystack = [
    log.entity_type,
    entityLabel,
    log.entity_id,
    log.action,
    log.user_id ?? "",
    log.old_values ? JSON.stringify(log.old_values) : "",
    log.new_values ? JSON.stringify(log.new_values) : "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function buildAuditSearchFilter(search: string): string {
  const pattern = escapePostgrestFilterValue(`%${search.trim()}%`);
  return [
    `entity_type.ilike.${pattern}`,
    `entity_id.ilike.${pattern}`,
    `action.ilike.${pattern}`,
    `user_id.ilike.${pattern}`,
  ].join(",");
}

function buildAuditCursorFilter(cursor: { created_at: string; id: string }): string {
  const createdAt = escapePostgrestFilterValue(cursor.created_at);
  const id = escapePostgrestFilterValue(cursor.id);
  return `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`;
}

function filterDemoAuditLogs(
  logs: AuditLog[],
  options?: { search?: string; action?: string }
): AuditLog[] {
  let filtered = logs;
  if (options?.search?.trim()) {
    filtered = filtered.filter((log) => matchesAuditSearch(log, options.search!.trim()));
  }
  return filterByAction(filtered, options?.action);
}

export interface AuditLogsPage {
  logs: AuditLog[];
  nextCursor: string | null;
  hasMore: boolean;
}

const DEFAULT_PAGE_SIZE = 50;

function encodeCursor(log: AuditLog): string {
  return `${log.created_at}|${log.id}`;
}

function parseCursor(cursor: string): { created_at: string; id: string } | null {
  const sep = cursor.lastIndexOf("|");
  if (sep === -1) return null;
  return { created_at: cursor.slice(0, sep), id: cursor.slice(sep + 1) };
}

function filterByAction(logs: AuditLog[], action?: string): AuditLog[] {
  if (!action || action === "all") return logs;
  return logs.filter((log) => log.action === action);
}

/** Paginated audit logs for lazy-loaded UI. */
export async function queryAuditLogsPage(options?: {
  search?: string;
  action?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<AuditLogsPage> {
  const limit = options?.limit ?? DEFAULT_PAGE_SIZE;

  

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (options?.action && options.action !== "all") {
    query = query.eq("action", options.action);
  }

  if (options?.search?.trim()) {
    query = query.or(buildAuditSearchFilter(options.search));
  }

  if (options?.cursor) {
    const parsed = parseCursor(options.cursor);
    if (parsed) {
      query = query.or(buildAuditCursorFilter(parsed));
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as AuditLog[];
  const hasMore = rows.length > limit;
  if (hasMore) rows = rows.slice(0, limit);

  return {
    logs: rows,
    nextCursor: hasMore && rows.length > 0 ? encodeCursor(rows[rows.length - 1]) : null,
    hasMore,
  };
}

/** Query audit logs for UI and reports. */
export async function queryAuditLogs(options?: {
  search?: string;
  limit?: number;
}): Promise<AuditLog[]> {
  const limit = options?.limit ?? 500;

  

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.search?.trim()) {
    query = query.or(buildAuditSearchFilter(options.search));
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  return (data ?? []) as AuditLog[];
}

export async function fetchAuditLogsForReport(
  filters: AuditReportFilters
): Promise<AuditLog[]> {
  let logs = await queryAuditLogs({ limit: 5000 });

  logs = logs.filter((log) =>
    isDateInRange(log.created_at.slice(0, 10), filters.dateFrom, filters.dateTo)
  );

  if (filters.entityType !== "all") {
    logs = logs.filter((log) => log.entity_type === filters.entityType);
  }

  if (filters.action !== "all") {
    logs = logs.filter((log) => log.action === filters.action);
  }

  return logs;
}

export function auditLogsToReportRows(logs: AuditLog[]) {
  return logs.map((log) => ({
    Timestamp: log.created_at.replace("T", " ").slice(0, 19),
    "Entity Type": log.entity_type,
    "Entity ID": log.entity_id,
    Action: log.action,
    User: log.user_id ?? "—",
    "Old Values": log.old_values ? JSON.stringify(log.old_values) : "—",
    "New Values": log.new_values ? JSON.stringify(log.new_values) : "—",
  }));
}
