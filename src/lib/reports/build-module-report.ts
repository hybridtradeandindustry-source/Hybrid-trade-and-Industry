import {
  fetchDocumentsReportData,
  fetchHrReportData,
  fetchInventoryReportData,
  fetchOrdersReportData,
  fetchProductionReportData,
} from "@/lib/reports/supabase-data-access";
import {
  filterProductionBatches,
  filterProductionCounts,
  getBatchDate,
  isRecyclingCount,
  periodLabel,
} from "@/lib/production/filters";
import { describeFilters, isDateInRange, normalizeFilters } from "@/lib/reports/filters";
import { resolveReportTemplate, REPORT_TEMPLATES } from "@/lib/reports/template-registry";
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
  ReportBuildResult,
  ReportTemplateDefinition,
} from "@/lib/reports/types";
import { resolveCategoryName, resolveItemTypeName } from "@/lib/inventory/inventory-config";
import {
  filterInventoryItems,
  getAvailableQuantity,
  getStockHealth,
  scopeToFactoryId,
} from "@/lib/inventory/inventory-utils";
import { generateProductionReport } from "@/lib/production/export-report";
import {
  CHECKPOINT_LABELS,
  FACTORY_IDS,
  ORDER_STATUS_LABELS,
  type ViewScope,
} from "@/types";
import type { GeneratedReportFile, ReportFormat } from "@/lib/reports/types";
import { exportReportFile } from "@/lib/reports/export-engine";
import { buildFinanceReportByType } from "@/lib/reports/build-finance-reports";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

function employeeName(first?: string | null, last?: string | null, fallback?: string) {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name || fallback || "—";
}

function buildProductionReport(
  scope: ViewScope,
  filters: ProductionReportFilters,
  batches: import("@/types").ProductionBatch[],
  counts: import("@/types").ProductionCount[]
): ReportBuildResult {
  const filteredBatches = filterProductionBatches(batches, filters);
  const filteredCounts = filterProductionCounts(counts, filters);

  const batchRows = filteredBatches.map((b) => ({
    Date: getBatchDate(b),
    "Batch Number": b.batch_number,
    Factory: FACTORY_NAMES[b.factory_id] ?? b.factory_id,
    Status: b.status.replace(/_/g, " "),
  }));

  const countRows = filteredCounts.map((c) => {
    const batch = batches.find((b) => b.id === c.batch_id);
    if (isRecyclingCount(c)) {
      return {
        Date: c.production_date,
        Factory: FACTORY_NAMES[c.factory_id] ?? c.factory_id,
        Type: "Recycling cycle",
        "Material In": c.material_received ?? 0,
        Output: c.processed_output ?? 0,
        Waste: c.waste_rejected ?? 0,
      };
    }
    return {
      Date: c.production_date,
      Factory: FACTORY_NAMES[c.factory_id] ?? c.factory_id,
      Type: c.checkpoint ? CHECKPOINT_LABELS[c.checkpoint] : "Block count",
      Batch: batch?.batch_number ?? "—",
      Good: c.good_count ?? 0,
      Damaged: c.damaged_count ?? 0,
    };
  });

  return {
    title: `${periodLabel(filters.period)} Production Report`,
    filterSummary: describeFilters("production", filters),
    sheets: [
      { name: "Batches", rows: batchRows },
      { name: "Production Counts", rows: countRows },
    ],
  };
}

function buildFinanceReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  templateSlug?: string,
  data?: import("@/lib/reports/finance-data-access").FinanceReportData
): ReportBuildResult {
  const slugToType: Record<string, FinanceReportFilters["reportType"]> = {
    "finance-reconciliation": "reconciliation",
    "finance-dashboard-summary": "dashboard-summary",
    "finance-customer-statements": "customer-statements",
    "finance-aging": "aging",
    "finance-payments": "payments",
    "finance-revenue": "revenue",
    "finance-expenses": "expenses",
    "finance-profitability": "profitability",
    "finance-bank-transactions": "bank-transactions",
  };

  const reportType = (templateSlug && slugToType[templateSlug]) || filters.reportType;

  if (reportType === "reconciliation") {
    return buildFinanceReportByType(scope, { ...filters, reportType }, data ?? emptyFinanceData());
  }

  if (!data) {
    throw new Error("Finance report data is required");
  }

  return buildFinanceReportByType(scope, { ...filters, reportType }, data);
}

function emptyFinanceData(): import("@/lib/reports/finance-data-access").FinanceReportData {
  return {
    orders: [],
    customers: [],
    payments: [],
    supplierPayments: [],
    banks: [],
    transactions: [],
    reconciliation: [],
  };
}

function buildInventoryReport(
  scope: ViewScope,
  filters: InventoryReportFilters,
  payload: Awaited<ReturnType<typeof fetchInventoryReportData>>
): ReportBuildResult {
  const cfg = {
    itemTypes: payload.itemTypes as import("@/types").InventoryItemType[],
    categories: payload.categories as import("@/types").InventoryCategoryDef[],
    units: [] as import("@/types").InventoryUnitDef[],
    customFieldDefs: [],
    skuRules: [],
    unitConversions: [],
  };
  let items = payload.items as import("@/types").InventoryItem[];

  items = filterInventoryItems(items, {
    factoryId: scopeToFactoryId(scope),
    category: filters.category,
    itemType: filters.itemType,
    health: filters.health,
  });

  if (filters.lowStockOnly) {
    items = items.filter(
      (i) =>
        i.quantity - (i.reserved_quantity ?? 0) <= i.low_stock_threshold ||
        (i.reorder_quantity != null && i.quantity <= i.reorder_quantity)
    );
  }

  const valuationRows = items.map((i) => ({
    SKU: i.sku,
    Name: i.name,
    Factory: FACTORY_NAMES[i.factory_id] ?? i.factory_id,
    "Item Type": resolveItemTypeName(cfg, i.item_type_id),
    Category: resolveCategoryName(cfg, i.category_id),
    Quantity: i.quantity,
    Reserved: i.reserved_quantity ?? 0,
    Available: getAvailableQuantity(i),
    "Unit Cost": i.unit_cost ?? 0,
    "Total Value": Number(((i.unit_cost ?? 0) * i.quantity).toFixed(2)),
    Threshold: i.low_stock_threshold,
    Health: getStockHealth(i),
    Location: i.location ?? "—",
  }));

  const totalValue = valuationRows.reduce(
    (sum, row) => sum + Number(row["Total Value"] ?? 0),
    0
  );

  return {
    title: "Inventory Valuation Report",
    filterSummary: [...describeFilters("inventory", filters), `Total inventory value: ${totalValue.toFixed(2)}`],
    sheets: [
      { name: "Inventory Items", rows: valuationRows },
      {
        name: "Summary",
        rows: [
          { Metric: "Item count", Value: valuationRows.length },
          { Metric: "Total units", Value: valuationRows.reduce((s, r) => s + Number(r.Quantity), 0) },
          { Metric: "Total value", Value: totalValue.toFixed(2) },
        ],
      },
    ],
  };
}

function buildHrReport(
  scope: ViewScope,
  filters: HrReportFilters,
  hr: Awaited<ReturnType<typeof fetchHrReportData>>
): ReportBuildResult {
  const employeeById = new Map(hr.employees.map((e) => [e.id, e]));
  const deptById = new Map(hr.departments.map((d) => [d.id, d]));

  let attendance = hr.attendance.filter((a) =>
    isDateInRange(a.shift_date, filters.dateFrom, filters.dateTo)
  );

  if (filters.attendanceStatus !== "all") {
    attendance = attendance.filter((a) => a.status === filters.attendanceStatus);
  }

  if (filters.departmentId !== "all") {
    attendance = attendance.filter((a) => {
      const emp = employeeById.get(a.employee_id);
      return emp?.department_id === filters.departmentId;
    });
  }

  const attendanceRows = attendance.map((a) => {
    const emp = employeeById.get(a.employee_id);
    const dept = emp?.department_id ? deptById.get(emp.department_id) : null;
    return {
      Date: a.shift_date,
      Employee: emp
        ? `${emp.employee_number} — ${employeeName(emp.first_name, emp.last_name)}`
        : a.employee_id,
      Department: dept?.name ?? emp?.department ?? "—",
      Position: emp?.position ?? "—",
      Factory: FACTORY_NAMES[emp?.factory_id ?? ""] ?? "—",
      "Clock In": a.clock_in ?? "—",
      "Clock Out": a.clock_out ?? "—",
      Status: a.status ?? "—",
    };
  });

  const activeEmployees = hr.employees.filter((e) => e.is_active);

  return {
    title: "HR Attendance Report",
    filterSummary: describeFilters("hr", filters),
    sheets: [
      { name: "Attendance", rows: attendanceRows },
      {
        name: "Workforce Summary",
        rows: [
          { Metric: "Active employees", Value: activeEmployees.length },
          { Metric: "Departments", Value: hr.departments.filter((d) => d.is_active).length },
          { Metric: "Positions", Value: hr.positions.filter((p) => p.is_active).length },
          { Metric: "Pending leave", Value: hr.leaveRequests.filter((l) => l.status === "pending").length },
        ],
      },
    ],
  };
}

function buildOrdersReport(
  filters: OrdersReportFilters,
  orders: import("@/types").Order[]
): ReportBuildResult {
  let filtered = orders.filter((o) => {
    const date = o.delivery_date?.slice(0, 10) ?? o.created_at.slice(0, 10);
    if (!isDateInRange(date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.status !== "all" && o.status !== filters.status) return false;
    if (filters.riskOnly && !o.ai_risk_flag) return false;
    return true;
  });

  return {
    title: "Sales Pipeline Report",
    filterSummary: describeFilters("orders", filters),
    sheets: [
      {
        name: "Sales",
        rows: filtered.map((o) => ({
          "Sale #": o.order_number,
          Customer: o.customer?.name ?? o.customer_id,
          Factory: FACTORY_NAMES[o.factory_id] ?? o.factory_id,
          Status: ORDER_STATUS_LABELS[o.status] ?? o.status,
          Amount: o.total_amount,
          "Delivery Date": o.delivery_date?.slice(0, 10) ?? "—",
          "Created Date": o.created_at.slice(0, 10),
          "AI Risk": o.ai_risk_flag ? "Yes" : "No",
          "Risk Reason": o.ai_risk_reason ?? "—",
          "Line Items": o.items?.length ?? 0,
        })),
      },
      {
        name: "Pipeline Summary",
        rows: Object.entries(
          filtered.reduce<Record<string, { count: number; value: number }>>((acc, o) => {
            const key = ORDER_STATUS_LABELS[o.status] ?? o.status;
            acc[key] = acc[key] ?? { count: 0, value: 0 };
            acc[key].count += 1;
            acc[key].value += o.total_amount;
            return acc;
          }, {})
        ).map(([status, stats]) => ({
          Status: status,
          Orders: stats.count,
          "Total Value": stats.value,
        })),
      },
    ],
  };
}

function buildCustomersReport(
  filters: CustomersReportFilters,
  orders: import("@/types").Order[],
  customers: import("@/types").Customer[]
): ReportBuildResult {
  let filteredCustomers = customers;

  if (filters.activeOnly) {
    filteredCustomers = filteredCustomers.filter((c) => c.is_active);
  }

  if (filters.minBalance) {
    const min = Number(filters.minBalance);
    if (!Number.isNaN(min)) filteredCustomers = filteredCustomers.filter((c) => c.balance >= min);
  }

  if (filters.maxBalance) {
    const max = Number(filters.maxBalance);
    if (!Number.isNaN(max)) filteredCustomers = filteredCustomers.filter((c) => c.balance <= max);
  }

  const rows = filteredCustomers.map((c) => {
    const customerOrders = orders.filter((o) => o.customer_id === c.id);
    const openOrders = customerOrders.filter(
      (o) => o.status !== "picked" && o.status !== "cancelled"
    );
    const pipelineValue = openOrders.reduce((s, o) => s + o.total_amount, 0);
    return {
      Customer: c.name,
      Email: c.email ?? "—",
      Phone: c.phone ?? "—",
      Balance: c.balance,
      Status: c.is_active ? "Active" : "Inactive",
      "Total Orders": customerOrders.length,
      "Open Orders": openOrders.length,
      "Pipeline Value": pipelineValue,
      "Picked Value": customerOrders
        .filter((o) => o.status === "picked")
        .reduce((s, o) => s + o.total_amount, 0),
    };
  });

  return {
    title: "Customer Account Summary",
    filterSummary: describeFilters("customers", filters),
    sheets: [
      { name: "Customers", rows },
      {
        name: "Totals",
        rows: [
          { Metric: "Customers", Value: rows.length },
          { Metric: "Total balance", Value: rows.reduce((s, r) => s + Number(r.Balance), 0) },
          { Metric: "Open pipeline", Value: rows.reduce((s, r) => s + Number(r["Pipeline Value"]), 0) },
        ],
      },
    ],
  };
}

function buildAuditReportFromLogs(logs: import("@/types").AuditLog[], filters: AuditReportFilters): ReportBuildResult {
  return {
    title: "Audit Activity Log",
    filterSummary: describeFilters("audit", filters),
    sheets: [
      {
        name: "Audit Events",
        rows: logs.map((log) => ({
          Timestamp: log.created_at.replace("T", " ").slice(0, 19),
          "Entity Type": log.entity_type,
          "Entity ID": log.entity_id,
          Action: log.action,
          User: log.user_id ?? "—",
          "Old Values": log.old_values ? JSON.stringify(log.old_values) : "—",
          "New Values": log.new_values ? JSON.stringify(log.new_values) : "—",
        })),
      },
    ],
  };
}

function buildDocumentsReport(
  filters: DocumentsReportFilters,
  documents: import("@/types").Document[]
): ReportBuildResult {
  let docs = documents;
  if (filters.tag !== "all") {
    docs = docs.filter((d) => d.tag === filters.tag);
  }

  if (filters.restrictedOnly) {
    docs = docs.filter((d) => d.is_restricted);
  }

  return {
    title: "Document Register",
    filterSummary: describeFilters("documents", filters),
    sheets: [
      {
        name: "Documents",
        rows: docs.map((d) => ({
          Name: d.name,
          Tag: d.tag,
          Restricted: d.is_restricted ? "Yes" : "No",
          "Entity Type": d.entity_type ?? "—",
          "Entity ID": d.entity_id ?? "—",
          "File URL": d.file_url,
        })),
      },
    ],
  };
}

function buildExecutiveReport(
  filters: ExecutiveReportFilters,
  metrics: import("@/types").DashboardMetrics,
  orders: import("@/types").Order[],
  inventoryItems: import("@/types").InventoryItem[],
  hr: Awaited<ReturnType<typeof fetchHrReportData>>
): ReportBuildResult {
  const filteredOrders = orders.filter((o) => {
    const date = o.created_at.slice(0, 10);
    return isDateInRange(date, filters.dateFrom, filters.dateTo);
  });

  return {
    title: `${periodLabel(filters.period)} Executive Summary`,
    filterSummary: describeFilters("executive", filters),
    sheets: [
      {
        name: "KPIs",
        rows: [
          { Metric: "Revenue", Value: metrics.revenue },
          { Metric: "Production output", Value: metrics.production },
          { Metric: "Withholding collected", Value: metrics.withholdingCollected },
          { Metric: "Active orders", Value: metrics.activeOrders },
          { Metric: "Open risk alerts", Value: metrics.openRiskAlerts },
        ],
      },
      {
        name: "Orders in Period",
        rows: filteredOrders.map((o) => ({
          "Order #": o.order_number,
          Status: ORDER_STATUS_LABELS[o.status] ?? o.status,
          Amount: o.total_amount,
          Customer: o.customer?.name ?? "—",
        })),
      },
      {
        name: "Inventory Snapshot",
        rows: [
          { Metric: "Active SKUs", Value: inventoryItems.filter((i) => i.is_active).length },
          {
            Metric: "Low stock items",
            Value: inventoryItems.filter(
              (i) => i.is_active && i.quantity - (i.reserved_quantity ?? 0) <= i.low_stock_threshold
            ).length,
          },
        ],
      },
      {
        name: "Workforce",
        rows: [
          { Metric: "Active employees", Value: hr.employees.filter((e) => e.is_active).length },
          { Metric: "Pending leave", Value: hr.leaveRequests.filter((l) => l.status === "pending").length },
        ],
      },
    ],
  };
}

export async function buildModuleReport(
  template: ReportTemplateDefinition,
  scope: ViewScope,
  filters: ModuleReportFilters,
  orgId?: string
): Promise<ReportBuildResult> {
  const resolvedOrgId = orgId ?? "11111111-1111-1111-1111-111111111111";

  switch (template.module) {
    case "production": {
      const { batches, counts } = await fetchProductionReportData(scope, resolvedOrgId);
      return buildProductionReport(scope, filters as ProductionReportFilters, batches, counts);
    }
    case "finance": {
      const { fetchFinanceReportData } = await import("@/lib/reports/finance-data-access");
      const financeData = await fetchFinanceReportData(scope, resolvedOrgId);
      return buildFinanceReport(scope, filters as FinanceReportFilters, template.slug, financeData);
    }
    case "inventory": {
      const payload = await fetchInventoryReportData(scope, resolvedOrgId);
      return buildInventoryReport(scope, filters as InventoryReportFilters, payload);
    }
    case "hr": {
      const hr = await fetchHrReportData(scope, resolvedOrgId);
      return buildHrReport(scope, filters as HrReportFilters, hr);
    }
    case "orders": {
      const { orders } = await fetchOrdersReportData(scope, resolvedOrgId);
      return buildOrdersReport(filters as OrdersReportFilters, orders as import("@/types").Order[]);
    }
    case "customers": {
      const { orders, customers } = await fetchOrdersReportData(scope, resolvedOrgId);
      return buildCustomersReport(
        filters as CustomersReportFilters,
        orders as import("@/types").Order[],
        customers
      );
    }
    case "audit":
      throw new Error("Audit reports must be generated via generateFilteredReport");
    case "documents": {
      const { documents } = await fetchDocumentsReportData(resolvedOrgId);
      return buildDocumentsReport(filters as DocumentsReportFilters, documents as import("@/types").Document[]);
    }
    default: {
      const [{ batches: _b, counts: _c }, inventoryPayload, hr, { orders }] = await Promise.all([
        fetchProductionReportData(scope, resolvedOrgId),
        fetchInventoryReportData(scope, resolvedOrgId),
        fetchHrReportData(scope, resolvedOrgId),
        fetchOrdersReportData(scope, resolvedOrgId),
      ]);
      const { fetchDashboardMetrics } = await import("@/lib/services/dashboard-metrics");
      const metrics = await fetchDashboardMetrics(scope);
      return buildExecutiveReport(
        filters as ExecutiveReportFilters,
        metrics,
        orders as import("@/types").Order[],
        inventoryPayload.items as import("@/types").InventoryItem[],
        hr
      );
    }
  }
}

export async function generateFilteredReport(input: {
  templateId: string;
  format: ReportFormat;
  scope: ViewScope;
  filters?: Record<string, unknown>;
  templateSlug?: string;
  templateModule?: string;
  templateName?: string;
  orgId?: string;
}): Promise<GeneratedReportFile> {
  const template = resolveReportTemplate(input.templateId, {
    slug: input.templateSlug,
    module: input.templateModule,
    name: input.templateName,
  });
  const filters = normalizeFilters(template.module, input.filters);

  if (template.module === "production") {
    const { batches, counts } = await fetchProductionReportData(input.scope, input.orgId ?? "11111111-1111-1111-1111-111111111111");
    return generateProductionReport({
      batches,
      counts,
      filters: filters as ProductionReportFilters,
      scope: input.scope,
      format: input.format,
    });
  }

  if (template.module === "audit") {
    const { fetchAuditLogsForReport } = await import("@/lib/services/audit");
    const logs = await fetchAuditLogsForReport(filters as AuditReportFilters);
    const report = buildAuditReportFromLogs(logs, filters as AuditReportFilters);
    return exportReportFile(report, input.format, input.scope);
  }

  if (template.module === "finance") {
    const { fetchFinanceReportData } = await import("@/lib/reports/finance-data-access");
    const data = await fetchFinanceReportData(input.scope, input.orgId);
    const report = buildFinanceReport(
      input.scope,
      filters as FinanceReportFilters,
      template.slug,
      data
    );
    return exportReportFile(report, input.format, input.scope);
  }

  const report = await buildModuleReport(template, input.scope, filters, input.orgId);
  return exportReportFile(report, input.format, input.scope);
}

export { REPORT_TEMPLATES };
