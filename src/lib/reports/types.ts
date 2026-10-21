import type {
  BatchStatusFilter,
  CountTypeFilter,
  ReportPeriod,
} from "@/lib/production/filters";
import type { FinancePeriod } from "@/lib/finance/periods";
import type { OrderStatus, ReconciliationStatus, ViewScope } from "@/types";

export type FinanceReportType =
  | "reconciliation"
  | "dashboard-summary"
  | "customer-statements"
  | "aging"
  | "payments"
  | "revenue"
  | "expenses"
  | "profitability"
  | "bank-transactions";

export type ReportFormat = "PDF" | "Excel";

export type ReportModule =
  | "production"
  | "finance"
  | "inventory"
  | "executive"
  | "hr"
  | "orders"
  | "customers"
  | "audit"
  | "documents";

export interface BaseReportFilters {
  period: ReportPeriod;
  dateFrom: string;
  dateTo: string;
}

export interface ProductionReportFilters extends BaseReportFilters {
  batchStatus: BatchStatusFilter;
  countType: CountTypeFilter;
}

export interface FinanceReportFilters extends BaseReportFilters {
  status: ReconciliationStatus | "all";
  reportType: FinanceReportType;
  financePeriod: FinancePeriod;
  monthYear?: string;
  customerId?: string;
}

export interface InventoryReportFilters extends BaseReportFilters {
  category: string;
  itemType: string;
  health: string;
  lowStockOnly: boolean;
}

export interface HrReportFilters extends BaseReportFilters {
  attendanceStatus: string;
  departmentId: string;
}

export interface OrdersReportFilters extends BaseReportFilters {
  status: OrderStatus | "all";
  riskOnly: boolean;
}

export interface CustomersReportFilters {
  activeOnly: boolean;
  minBalance: string;
  maxBalance: string;
}

export interface AuditReportFilters extends BaseReportFilters {
  entityType: string;
  action: string;
}

export interface DocumentsReportFilters {
  tag: string;
  restrictedOnly: boolean;
}

export interface ExecutiveReportFilters extends BaseReportFilters {}

export type ModuleReportFilters =
  | ProductionReportFilters
  | FinanceReportFilters
  | InventoryReportFilters
  | HrReportFilters
  | OrdersReportFilters
  | CustomersReportFilters
  | AuditReportFilters
  | DocumentsReportFilters
  | ExecutiveReportFilters;

export interface ReportTemplateDefinition {
  id: string;
  slug: string;
  name: string;
  category: string;
  module: ReportModule;
  description: string;
  defaultFormat: ReportFormat;
}

export interface ReportSheet {
  name: string;
  rows: Record<string, unknown>[];
}

export interface ReportBuildResult {
  title: string;
  filterSummary: string[];
  sheets: ReportSheet[];
}

export interface GeneratedReportFile {
  filename: string;
  mimeType: string;
  data: string;
}

export interface GenerateReportInput {
  templateId: string;
  format: ReportFormat;
  scope: ViewScope;
  filters?: Record<string, unknown>;
  orgId?: string;
}
