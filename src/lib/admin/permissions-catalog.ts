/** Canonical permission catalog — mirrors supabase/migrations seed + enterprise inventory perms */
export interface PermissionDef {
  resource: string;
  action: string;
  description: string;
}

export const PERMISSION_CATALOG: PermissionDef[] = [
  { resource: "dashboard", action: "read", description: "View dashboards" },
  { resource: "finance", action: "read", description: "View financial data" },
  { resource: "finance", action: "verify", description: "Verify and approve financial records" },
  { resource: "finance", action: "sync", description: "Trigger Sage 50 sync" },
  { resource: "finance", action: "manage", description: "Record and manage operating expenses" },
  { resource: "production", action: "read", description: "View production data" },
  { resource: "production", action: "create", description: "Create production counts" },
  { resource: "production", action: "verify", description: "Verify production entries" },
  { resource: "inventory", action: "read", description: "View inventory" },
  { resource: "inventory", action: "manage", description: "Manage inventory movements and SKUs" },
  { resource: "inventory", action: "count", description: "Perform stock counts" },
  { resource: "inventory", action: "configure", description: "Configure inventory catalog structure" },
  { resource: "inventory", action: "approve_catalog", description: "Approve catalog change requests" },
  { resource: "inventory", action: "requisition", description: "Create purchase requisitions" },
  { resource: "inventory", action: "bom", description: "Manage bill of materials" },
  { resource: "sales", action: "read", description: "View sales and orders" },
  { resource: "sales", action: "manage", description: "Manage orders and customers" },
  { resource: "sales", action: "deliver", description: "Confirm deliveries" },
  { resource: "hr", action: "read", description: "View HR data" },
  { resource: "hr", action: "manage", description: "Manage HR records" },
  { resource: "hr", action: "payroll", description: "Process payroll and payslips" },
  { resource: "hr", action: "approve_leave", description: "Approve or reject leave requests" },
  { resource: "hr", action: "manage_policies", description: "Configure HR policies, shifts, and workflows" },
  { resource: "hr", action: "self_service", description: "Employee self-service for leave and attendance" },
  { resource: "hr", action: "view_salary", description: "View sensitive salary and compensation data" },
  { resource: "hr", action: "approve_attendance", description: "Approve attendance corrections" },
  { resource: "hr", action: "adjust_leave", description: "Manual leave balance adjustments" },
  { resource: "reports", action: "read", description: "View reports" },
  { resource: "reports", action: "export", description: "Export reports" },
  { resource: "ai", action: "read", description: "View AI briefings" },
  { resource: "ai", action: "chat", description: "Chat with AI assistant" },
  { resource: "ai", action: "capacity", description: "View production capacity predictions" },
  { resource: "ai", action: "credit_score", description: "View customer credit scores" },
  { resource: "ai", action: "refresh", description: "Refresh AI intelligence and briefings" },
  { resource: "admin", action: "manage", description: "Manage roles and permissions" },
  { resource: "documents", action: "read", description: "View documents" },
  { resource: "documents", action: "upload", description: "Upload documents" },
  { resource: "notifications", action: "read", description: "View notifications" },
  { resource: "audit", action: "read", description: "View audit logs" },
];

export function permissionKey(resource: string, action: string) {
  return `${resource}:${action}`;
}

export function parsePermissionKey(key: string) {
  const [resource, action] = key.split(":");
  return { resource, action };
}

export function permissionsToKeys(permissions: Array<{ resource: string; action: string }>): string[] {
  if (permissions.some((p) => p.resource === "*")) return ["*:*"];
  return permissions.map((p) => permissionKey(p.resource, p.action));
}
