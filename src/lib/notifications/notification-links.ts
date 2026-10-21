import type { Notification } from "@/types";

const EMPLOYEE_TABS = ["overview", "leave", "attendance", "payroll", "history", "documents"] as const;
export type EmployeeDetailTab = (typeof EMPLOYEE_TABS)[number];

function inferEmployeeTab(notification: Notification): EmployeeDetailTab | null {
  const haystack = `${notification.title} ${notification.message}`.toLowerCase();
  if (haystack.includes("leave")) return "leave";
  if (haystack.includes("attendance") || haystack.includes("correction")) return "attendance";
  if (haystack.includes("payroll") || haystack.includes("payslip")) return "payroll";
  return null;
}

function employeeHref(employeeId: string, tab?: EmployeeDetailTab | null): string {
  if (tab && tab !== "overview") {
    return `/dashboard/hr/${employeeId}?tab=${tab}`;
  }
  return `/dashboard/hr/${employeeId}`;
}

/** Resolve a dashboard path from notification entity metadata. */
export function getNotificationHref(notification: Notification): string | null {
  const { entity_type, entity_id } = notification;
  if (!entity_type) return "/dashboard/notifications";

  switch (entity_type) {
    case "inventory_items":
      return entity_id ? `/dashboard/inventory?itemId=${entity_id}` : "/dashboard/inventory";
    case "stock_counts":
      return "/dashboard/inventory";
    case "leave_requests":
      return entity_id ? `/dashboard/hr/leave/${entity_id}` : "/dashboard/hr";
    case "hr_attendance_corrections":
      return entity_id ? `/dashboard/hr/correction/${entity_id}` : "/dashboard/hr";
    case "reconciliation_records":
      return "/dashboard/finance";
    case "orders":
      return entity_id ? `/dashboard/orders?orderId=${entity_id}` : "/dashboard/orders";
    case "production_batches":
    case "production_counts":
      return "/dashboard/production";
    case "employees": {
      if (!entity_id) return "/dashboard/hr";
      return employeeHref(entity_id, inferEmployeeTab(notification));
    }
    case "hr_departments":
    case "hr_positions":
      return "/dashboard/hr";
    case "documents":
      return "/dashboard/documents";
    case "ai_alerts":
      return "/dashboard/ai";
    case "reports":
      return "/dashboard/reports";
    case "inventory_catalog_change_requests":
      return "/dashboard/admin";
    default:
      return entity_id ? `/dashboard/notifications?entity=${entity_id}` : "/dashboard/notifications";
  }
}

export function parseEmployeeDetailTab(value: string | null): EmployeeDetailTab {
  if (value && EMPLOYEE_TABS.includes(value as EmployeeDetailTab)) {
    return value as EmployeeDetailTab;
  }
  return "overview";
}
