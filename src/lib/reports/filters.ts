import {
  DEFAULT_PRODUCTION_FILTERS,
  periodLabel,
  resolveDateRange,
  type ProductionFilterState,
  type ReportPeriod,
} from "@/lib/production/filters";
import { resolveFinanceDateRange, type FinancePeriod } from "@/lib/finance/periods";
import type {
  AuditReportFilters,
  CustomersReportFilters,
  DocumentsReportFilters,
  ExecutiveReportFilters,
  FinanceReportFilters,
  HrReportFilters,
  InventoryReportFilters,
  ModuleReportFilters,
  OrdersReportFilters,
  ProductionReportFilters,
  ReportModule,
} from "@/lib/reports/types";

export { isDateInRange, periodLabel, resolveDateRange, todayIsoDate } from "@/lib/production/filters";

export function defaultProductionFilters(): ProductionReportFilters {
  return DEFAULT_PRODUCTION_FILTERS();
}

export function defaultFinanceFilters(): FinanceReportFilters {
  const { from, to } = resolveFinanceDateRange("this_month");
  return {
    period: "monthly",
    dateFrom: from,
    dateTo: to,
    status: "all",
    reportType: "revenue",
    financePeriod: "this_month",
  };
}

export function defaultInventoryFilters(): InventoryReportFilters {
  const { from, to } = resolveDateRange("monthly");
  return {
    period: "monthly",
    dateFrom: from,
    dateTo: to,
    category: "all",
    itemType: "all",
    health: "all",
    lowStockOnly: false,
  };
}

export function defaultHrFilters(): HrReportFilters {
  const { from, to } = resolveDateRange("weekly");
  return {
    period: "weekly",
    dateFrom: from,
    dateTo: to,
    attendanceStatus: "all",
    departmentId: "all",
  };
}

export function defaultOrdersFilters(): OrdersReportFilters {
  const { from, to } = resolveDateRange("monthly");
  return {
    period: "monthly",
    dateFrom: from,
    dateTo: to,
    status: "all",
    riskOnly: false,
  };
}

export function defaultCustomersFilters(): CustomersReportFilters {
  return { activeOnly: true, minBalance: "", maxBalance: "" };
}

export function defaultAuditFilters(): AuditReportFilters {
  const { from, to } = resolveDateRange("weekly");
  return { period: "weekly", dateFrom: from, dateTo: to, entityType: "all", action: "all" };
}

export function defaultDocumentsFilters(): DocumentsReportFilters {
  return { tag: "all", restrictedOnly: false };
}

export function defaultExecutiveFilters(): ExecutiveReportFilters {
  const { from, to } = resolveDateRange("monthly");
  return { period: "monthly", dateFrom: from, dateTo: to };
}

export function defaultFiltersForModule(module: ReportModule): ModuleReportFilters {
  switch (module) {
    case "production":
      return defaultProductionFilters();
    case "finance":
      return defaultFinanceFilters();
    case "inventory":
      return defaultInventoryFilters();
    case "hr":
      return defaultHrFilters();
    case "orders":
      return defaultOrdersFilters();
    case "customers":
      return defaultCustomersFilters();
    case "audit":
      return defaultAuditFilters();
    case "documents":
      return defaultDocumentsFilters();
    default:
      return defaultExecutiveFilters();
  }
}

function applyPeriod(
  base: { period: ReportPeriod; dateFrom: string; dateTo: string },
  input?: Record<string, unknown>
) {
  const period = (input?.period as ReportPeriod) ?? base.period;
  const customFrom = typeof input?.dateFrom === "string" ? input.dateFrom : undefined;
  const customTo = typeof input?.dateTo === "string" ? input.dateTo : undefined;
  const range = resolveDateRange(period, customFrom, customTo);
  return { period, dateFrom: range.from, dateTo: range.to };
}

export function normalizeFilters(
  module: ReportModule,
  input?: Record<string, unknown>
): ModuleReportFilters {
  const defaults = defaultFiltersForModule(module);

  switch (module) {
    case "production": {
      const base = applyPeriod(defaults as ProductionReportFilters, input);
      const d = defaults as ProductionReportFilters;
      return {
        ...base,
        batchStatus:
          (input?.batchStatus as ProductionFilterState["batchStatus"]) ?? d.batchStatus,
        countType: (input?.countType as ProductionFilterState["countType"]) ?? d.countType,
      };
    }
    case "finance": {
      const financePeriod = (input?.financePeriod as FinancePeriod) ?? "this_month";
      const range = resolveFinanceDateRange(financePeriod, {
        monthYear: typeof input?.monthYear === "string" ? input.monthYear : undefined,
        dateFrom: typeof input?.dateFrom === "string" ? input.dateFrom : undefined,
        dateTo: typeof input?.dateTo === "string" ? input.dateTo : undefined,
      });
      return {
        period: "monthly",
        dateFrom: range.from,
        dateTo: range.to,
        status: (input?.status as FinanceReportFilters["status"]) ?? "all",
        reportType: (input?.reportType as FinanceReportFilters["reportType"]) ?? "revenue",
        financePeriod,
        monthYear: typeof input?.monthYear === "string" ? input.monthYear : undefined,
        customerId: typeof input?.customerId === "string" ? input.customerId : undefined,
      };
    }
    case "inventory": {
      const base = applyPeriod(defaults as InventoryReportFilters, input);
      const d = defaults as InventoryReportFilters;
      return {
        ...base,
        category: typeof input?.category === "string" ? input.category : d.category,
        itemType: typeof input?.itemType === "string" ? input.itemType : d.itemType,
        health: typeof input?.health === "string" ? input.health : d.health,
        lowStockOnly: input?.lowStockOnly === true,
      };
    }
    case "hr": {
      const base = applyPeriod(defaults as HrReportFilters, input);
      const d = defaults as HrReportFilters;
      return {
        ...base,
        attendanceStatus:
          typeof input?.attendanceStatus === "string" ? input.attendanceStatus : d.attendanceStatus,
        departmentId:
          typeof input?.departmentId === "string" ? input.departmentId : d.departmentId,
      };
    }
    case "orders": {
      const base = applyPeriod(defaults as OrdersReportFilters, input);
      return {
        ...base,
        status: (input?.status as OrdersReportFilters["status"]) ?? "all",
        riskOnly: input?.riskOnly === true,
      };
    }
    case "customers": {
      const d = defaults as CustomersReportFilters;
      return {
        activeOnly: input?.activeOnly !== false,
        minBalance: typeof input?.minBalance === "string" ? input.minBalance : d.minBalance,
        maxBalance: typeof input?.maxBalance === "string" ? input.maxBalance : d.maxBalance,
      };
    }
    case "audit": {
      const base = applyPeriod(defaults as AuditReportFilters, input);
      const d = defaults as AuditReportFilters;
      return {
        ...base,
        entityType: typeof input?.entityType === "string" ? input.entityType : d.entityType,
        action: typeof input?.action === "string" ? input.action : d.action,
      };
    }
    case "documents": {
      const d = defaults as DocumentsReportFilters;
      return {
        tag: typeof input?.tag === "string" ? input.tag : d.tag,
        restrictedOnly: input?.restrictedOnly === true,
      };
    }
    default:
      return applyPeriod(defaults as ExecutiveReportFilters, input);
  }
}

export function describeFilters(module: ReportModule, filters: ModuleReportFilters): string[] {
  const lines: string[] = [];

  if ("period" in filters) {
    lines.push(`Period: ${periodLabel(filters.period)} (${filters.dateFrom} → ${filters.dateTo})`);
  }

  switch (module) {
    case "production": {
      const f = filters as ProductionReportFilters;
      if (f.batchStatus !== "all") lines.push(`Batch status: ${f.batchStatus.replace(/_/g, " ")}`);
      if (f.countType !== "all") lines.push(`Count type: ${f.countType}`);
      break;
    }
    case "finance": {
      const f = filters as FinanceReportFilters;
      lines.push(
        `Period: ${f.financePeriod.replace(/_/g, " ")} (${f.dateFrom} → ${f.dateTo})`
      );
      if (f.status !== "all") lines.push(`Reconciliation status: ${f.status}`);
      if (f.customerId) lines.push(`Customer filter applied`);
      break;
    }
    case "inventory": {
      const f = filters as InventoryReportFilters;
      if (f.category !== "all") lines.push(`Category filter applied`);
      if (f.itemType !== "all") lines.push(`Item type filter applied`);
      if (f.health !== "all") lines.push(`Stock health: ${f.health}`);
      if (f.lowStockOnly) lines.push("Low stock items only");
      break;
    }
    case "hr": {
      const f = filters as HrReportFilters;
      if (f.attendanceStatus !== "all") lines.push(`Attendance status: ${f.attendanceStatus}`);
      if (f.departmentId !== "all") lines.push(`Department filter applied`);
      break;
    }
    case "orders": {
      const f = filters as OrdersReportFilters;
      if (f.status !== "all") lines.push(`Order status: ${f.status.replace(/_/g, " ")}`);
      if (f.riskOnly) lines.push("AI risk flagged orders only");
      break;
    }
    case "customers": {
      const f = filters as CustomersReportFilters;
      if (f.activeOnly) lines.push("Active customers only");
      if (f.minBalance) lines.push(`Min balance: ${f.minBalance}`);
      if (f.maxBalance) lines.push(`Max balance: ${f.maxBalance}`);
      break;
    }
    case "audit": {
      const f = filters as AuditReportFilters;
      if (f.entityType !== "all") lines.push(`Entity type: ${f.entityType}`);
      if (f.action !== "all") lines.push(`Action: ${f.action}`);
      break;
    }
    case "documents": {
      const f = filters as DocumentsReportFilters;
      if (f.tag !== "all") lines.push(`Tag: ${f.tag}`);
      if (f.restrictedOnly) lines.push("Restricted documents only");
      break;
    }
    default:
      break;
  }

  return lines;
}
