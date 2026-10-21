import type { ReportTemplateDefinition } from "@/lib/reports/types";

export const REPORT_TEMPLATES: ReportTemplateDefinition[] = [
  {
    id: "rpt-1",
    slug: "daily-production",
    name: "Production Summary",
    category: "Production",
    module: "production",
    description: "Batch status and production counts with date, factory, and checkpoint filters.",
    defaultFormat: "PDF",
  },
  {
    id: "rpt-2",
    slug: "finance-reconciliation",
    name: "Finance Reconciliation",
    category: "Finance",
    module: "finance",
    description: "Operational vs Sage amounts with variance and reconciliation status.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-10",
    slug: "finance-customer-statements",
    name: "Customer Statements",
    category: "Finance",
    module: "finance",
    description: "Per-customer balances, collections, and order activity for the selected period.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-11",
    slug: "finance-aging",
    name: "Accounts Receivable Aging",
    category: "Finance",
    module: "finance",
    description: "Outstanding credit by aging bucket (0–30, 31–60, 61–90, 90+ days).",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-12",
    slug: "finance-payments",
    name: "Payment Report",
    category: "Finance",
    module: "finance",
    description: "All customer payments with method, reference, and period totals.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-13",
    slug: "finance-revenue",
    name: "Revenue Summary",
    category: "Finance",
    module: "finance",
    description: "Picked order revenue with payment and credit breakdown for the period.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-14",
    slug: "finance-expenses",
    name: "Expense Report",
    category: "Finance",
    module: "finance",
    description: "Sage expense transactions grouped by factory.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-15",
    slug: "finance-profitability",
    name: "Profitability Report",
    category: "Finance",
    module: "finance",
    description: "Revenue minus expenses with margin for the selected period.",
    defaultFormat: "PDF",
  },
  {
    id: "rpt-16",
    slug: "finance-bank-transactions",
    name: "Bank Transaction Report",
    category: "Finance",
    module: "finance",
    description: "Bank payments from customers and Sage bank entries.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-17",
    slug: "finance-dashboard-summary",
    name: "Finance Dashboard Summary",
    category: "Finance",
    module: "finance",
    description: "KPIs, customer balances, alerts, and trend for the selected period.",
    defaultFormat: "PDF",
  },
  {
    id: "rpt-3",
    slug: "inventory-valuation",
    name: "Inventory Valuation",
    category: "Inventory",
    module: "inventory",
    description: "Stock levels, unit costs, and total value with category and health filters.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-4",
    slug: "executive-dashboard",
    name: "Executive Dashboard Export",
    category: "Executive",
    module: "executive",
    description: "Cross-module KPI summary for leadership review.",
    defaultFormat: "PDF",
  },
  {
    id: "rpt-5",
    slug: "hr-attendance",
    name: "HR Attendance Report",
    category: "HR",
    module: "hr",
    description: "Daily attendance, clock times, and workforce status by department.",
    defaultFormat: "PDF",
  },
  {
    id: "rpt-6",
    slug: "sales-pipeline",
    name: "Sales & Orders Pipeline",
    category: "Sales",
    module: "orders",
    description: "Order pipeline with customer, value, delivery dates, and risk flags.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-7",
    slug: "customer-accounts",
    name: "Customer Account Summary",
    category: "Sales",
    module: "customers",
    description: "Customer balances, order activity, and pipeline exposure.",
    defaultFormat: "Excel",
  },
  {
    id: "rpt-8",
    slug: "audit-activity",
    name: "Audit Activity Log",
    category: "Compliance",
    module: "audit",
    description: "System audit trail filtered by entity, action, and date range.",
    defaultFormat: "PDF",
  },
  {
    id: "rpt-9",
    slug: "document-register",
    name: "Document Register",
    category: "Documents",
    module: "documents",
    description: "Registered documents with tags, restrictions, and linked entities.",
    defaultFormat: "PDF",
  },
];

export function resolveReportTemplate(
  templateId: string,
  meta?: { slug?: string; module?: string; name?: string }
): ReportTemplateDefinition {
  const byId = REPORT_TEMPLATES.find((t) => t.id === templateId);
  if (byId) return byId;

  const bySlug = REPORT_TEMPLATES.find(
    (t) => t.slug === templateId || (meta?.slug && t.slug === meta.slug)
  );
  if (bySlug) return { ...bySlug, id: templateId };

  const moduleSlugMap: Record<string, string> = {
    production: "daily-production",
    finance: "finance-reconciliation",
    inventory: "inventory-valuation",
    executive: "executive-dashboard",
    hr: "hr-attendance",
    orders: "sales-pipeline",
    sales: "sales-pipeline",
    customers: "customer-accounts",
    audit: "audit-activity",
    documents: "document-register",
  };

  const moduleKey = meta?.module === "sales" ? "orders" : meta?.module;
  if (moduleKey && moduleSlugMap[moduleKey]) {
    const match = REPORT_TEMPLATES.find((t) => t.slug === moduleSlugMap[moduleKey]);
    if (match) {
      return {
        ...match,
        id: templateId,
        name: meta?.name ?? match.name,
      };
    }
  }

  return {
    id: templateId,
    slug: meta?.slug ?? templateId,
    name: meta?.name ?? "Custom Report",
    category: "General",
    module: (moduleKey as ReportTemplateDefinition["module"]) ?? "executive",
    description: "Generated report",
    defaultFormat: "PDF",
  };
}
