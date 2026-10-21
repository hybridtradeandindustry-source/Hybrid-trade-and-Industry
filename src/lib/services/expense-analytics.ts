import { isDateInRange } from "@/lib/production/filters";
import type { FinancePeriod } from "@/lib/finance/periods";
import { resolveFinanceDateRange } from "@/lib/finance/periods";
import type {
  MaterialPurchase,
  OperatingExpense,
  SageTransaction,
  ViewScope,
} from "@/types";
import { FACTORY_IDS } from "@/types";

import type {
  ExpenseAnalyticsSummary,
  ExpenseSourceType,
  UnifiedExpenseLine,
} from "@/types";

export type { ExpenseAnalyticsSummary, ExpenseSourceType, UnifiedExpenseLine };

const FACTORY_LABELS: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

const SOURCE_LABELS: Record<ExpenseSourceType, string> = {
  operating_expense: "Operating Expenses",
  supplier_payment: "Supplier Payments",
  material_purchase: "Material Purchases",
  payroll: "Payroll",
  cogs: "Cost of Goods Sold",
  sage_expense: "Finance Ledger",
};

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function inScope(factoryId: string | null | undefined, scope: ViewScope): boolean {
  const scoped = scopeFactoryId(scope);
  if (!scoped) return true;
  return factoryId === scoped;
}

function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export type ExpenseAnalyticsInput = {
  scope: ViewScope;
  period: FinancePeriod;
  periodOptions?: { dateFrom?: string; dateTo?: string; monthYear?: string };
  operatingExpenses: OperatingExpense[];
  supplierPayments: Array<{
    id: string;
    amount: number;
    payment_date: string;
    payment_method: string;
    supplier_name?: string | null;
    purchase_factory_id?: string | null;
    purchase_number?: string | null;
    reference?: string | null;
  }>;
  materialPurchases: MaterialPurchase[];
  sageTransactions: SageTransaction[];
  payrollRuns: Array<{
    id: string;
    period_start: string;
    period_end: string;
    total_expense: number;
    factory_id?: string | null;
    paid_at?: string | null;
    status: string;
  }>;
};

export function buildExpenseAnalytics(input: ExpenseAnalyticsInput): {
  summary: ExpenseAnalyticsSummary;
  unifiedLines: UnifiedExpenseLine[];
} {
  const { from, to, label } = resolveFinanceDateRange(input.period, input.periodOptions);
  const scope = input.scope;
  const operatingExpenseIds = new Set(
    input.operatingExpenses.filter((e) => e.status === "posted").map((e) => e.id)
  );

  const unifiedLines: UnifiedExpenseLine[] = [];

  for (const exp of input.operatingExpenses) {
    if (!inScope(exp.factory_id, scope)) continue;
    if (exp.status === "cancelled") continue;
    if (!isDateInRange(exp.expense_date, from, to)) continue;

    unifiedLines.push({
      id: exp.id,
      source_type: "operating_expense",
      date: exp.expense_date,
      description: exp.description,
      category: exp.category_name ?? exp.category_code ?? "Operating",
      vendor: exp.vendor_name,
      amount: exp.amount,
      factory_id: exp.factory_id,
      payment_method: exp.payment_method,
      status: exp.status,
      reference_id: exp.reference,
      in_finance_ledger: exp.status === "posted" && !!exp.sage_transaction_id,
      detail_path: null,
    });
  }

  for (const pay of input.supplierPayments) {
    if (!inScope(pay.purchase_factory_id, scope)) continue;
    if (!isDateInRange(pay.payment_date, from, to)) continue;

    unifiedLines.push({
      id: pay.id,
      source_type: "supplier_payment",
      date: pay.payment_date,
      description: pay.purchase_number
        ? `Payment for ${pay.purchase_number}`
        : "Supplier payment",
      category: "Purchasing",
      vendor: pay.supplier_name,
      amount: pay.amount,
      factory_id: pay.purchase_factory_id,
      payment_method: pay.payment_method,
      status: "paid",
      reference_id: pay.reference,
      in_finance_ledger: false,
      detail_path: "/dashboard/purchasing",
    });
  }

  for (const purchase of input.materialPurchases) {
    if (!inScope(purchase.factory_id, scope)) continue;
    const activityDate = (purchase.received_at ?? purchase.purchase_date).slice(0, 10);
    if (purchase.status !== "received") continue;
    if (!isDateInRange(activityDate, from, to)) continue;

    unifiedLines.push({
      id: purchase.id,
      source_type: "material_purchase",
      date: activityDate,
      description: `${purchase.material_type} — ${purchase.purchase_number}`,
      category: "Material Purchase",
      vendor: purchase.supplier_name,
      amount: Number(purchase.total_cost),
      factory_id: purchase.factory_id,
      payment_method: purchase.payment_method ?? undefined,
      status: purchase.payment_status ?? purchase.status,
      reference_id: purchase.purchase_number,
      in_finance_ledger: false,
      detail_path: "/dashboard/purchasing",
    });
  }

  for (const run of input.payrollRuns) {
    if (!inScope(run.factory_id, scope)) continue;
    const payDate = (run.paid_at ?? run.period_end).slice(0, 10);
    if (run.status !== "paid") continue;
    if (!isDateInRange(payDate, from, to)) continue;

    unifiedLines.push({
      id: run.id,
      source_type: "payroll",
      date: payDate,
      description: `Payroll ${run.period_start} → ${run.period_end}`,
      category: "Payroll",
      vendor: "Employees",
      amount: Number(run.total_expense),
      factory_id: run.factory_id,
      payment_method: "bank",
      status: "paid",
      in_finance_ledger: true,
      detail_path: "/dashboard/hr",
    });
  }

  const sageInPeriod = input.sageTransactions.filter(
    (t) =>
      inScope(t.factory_id, scope) &&
      isDateInRange(t.transaction_date, from, to) &&
      (t.transaction_type === "expense" ||
        t.transaction_type === "cogs" ||
        t.transaction_type === "payroll_expense" ||
        t.amount < 0)
  );

  for (const tx of sageInPeriod) {
    const ref =
      (tx as SageTransaction & { reference?: string | null }).reference ??
      tx.reference_id ??
      null;
    const linkedOperating = ref && operatingExpenseIds.has(ref);
    if (linkedOperating && tx.transaction_type === "expense") continue;

    const sourceType: ExpenseSourceType =
      tx.transaction_type === "cogs"
        ? "cogs"
        : tx.transaction_type === "payroll_expense"
          ? "payroll"
          : "sage_expense";

    const alreadyFromPayroll =
      sourceType === "payroll" &&
      input.payrollRuns.some((r) => r.status === "paid" && isDateInRange((r.paid_at ?? r.period_end).slice(0, 10), from, to));
    if (alreadyFromPayroll && sourceType === "payroll") continue;

    unifiedLines.push({
      id: tx.id,
      source_type: sourceType,
      date: tx.transaction_date,
      description: tx.description ?? "Sage transaction",
      category: SOURCE_LABELS[sourceType],
      amount: Math.abs(Number(tx.amount)),
      factory_id: tx.factory_id,
      status: "posted",
      reference_id: ref ?? null,
      in_finance_ledger: true,
      detail_path: "/dashboard/finance",
    });
  }

  unifiedLines.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);

  const periodLines = unifiedLines.filter((l) => isDateInRange(l.date, from, to));

  const operatingExpenses = periodLines
    .filter((l) => l.source_type === "operating_expense" && l.status === "posted")
    .reduce((s, l) => s + l.amount, 0);
  const supplierPayments = periodLines
    .filter((l) => l.source_type === "supplier_payment")
    .reduce((s, l) => s + l.amount, 0);
  const payrollExpenses = periodLines
    .filter((l) => l.source_type === "payroll")
    .reduce((s, l) => s + l.amount, 0);
  const cogs = periodLines
    .filter((l) => l.source_type === "cogs")
    .reduce((s, l) => s + l.amount, 0);
  const materialPurchasesReceived = periodLines
    .filter((l) => l.source_type === "material_purchase")
    .reduce((s, l) => s + l.amount, 0);

  const pendingOperating = input.operatingExpenses
    .filter(
      (e) =>
        e.status === "pending" &&
        inScope(e.factory_id, scope) &&
        isDateInRange(e.expense_date, from, to)
    )
    .reduce((s, e) => s + e.amount, 0);

  const totalPlExpenses = sageInPeriod.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const totalCashOut = supplierPayments + operatingExpenses;

  const bySourceMap = new Map<string, { amount: number; count: number }>();
  for (const line of periodLines) {
    const key = SOURCE_LABELS[line.source_type];
    const cur = bySourceMap.get(key) ?? { amount: 0, count: 0 };
    bySourceMap.set(key, { amount: cur.amount + line.amount, count: cur.count + 1 });
  }

  const byCategoryMap = new Map<string, { amount: number; count: number }>();
  for (const line of periodLines) {
    const cur = byCategoryMap.get(line.category) ?? { amount: 0, count: 0 };
    byCategoryMap.set(line.category, { amount: cur.amount + line.amount, count: cur.count + 1 });
  }

  const byFactoryMap = new Map<string, { factory_id: string | null; amount: number }>();
  for (const line of periodLines) {
    const fid = line.factory_id ?? "unassigned";
    const label = line.factory_id ? (FACTORY_LABELS[line.factory_id] ?? fid) : "Unassigned";
    const cur = byFactoryMap.get(label) ?? { factory_id: line.factory_id ?? null, amount: 0 };
    byFactoryMap.set(label, { factory_id: cur.factory_id, amount: cur.amount + line.amount });
  }

  const byPaymentMap = new Map<string, { amount: number; count: number }>();
  for (const line of periodLines) {
    const method = line.payment_method ?? "other";
    const cur = byPaymentMap.get(method) ?? { amount: 0, count: 0 };
    byPaymentMap.set(method, { amount: cur.amount + line.amount, count: cur.count + 1 });
  }

  const vendorMap = new Map<string, { amount: number; count: number }>();
  for (const line of periodLines) {
    if (!line.vendor?.trim()) continue;
    const cur = vendorMap.get(line.vendor) ?? { amount: 0, count: 0 };
    vendorMap.set(line.vendor, { amount: cur.amount + line.amount, count: cur.count + 1 });
  }

  const trendMonths: string[] = [];
  const end = new Date(to);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    trendMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const monthlyTrend = trendMonths.map((key) => {
    const monthLines = unifiedLines.filter((l) => monthKey(l.date) === key);
    const operating = monthLines
      .filter((l) => l.source_type === "operating_expense" && l.status === "posted")
      .reduce((s, l) => s + l.amount, 0);
    const purchasing = monthLines
      .filter((l) => l.source_type === "supplier_payment")
      .reduce((s, l) => s + l.amount, 0);
    const payroll = monthLines
      .filter((l) => l.source_type === "payroll")
      .reduce((s, l) => s + l.amount, 0);
    const cogsMonth = monthLines
      .filter((l) => l.source_type === "cogs")
      .reduce((s, l) => s + l.amount, 0);
    return {
      month: key,
      label: monthLabel(key),
      operating,
      purchasing,
      payroll,
      cogs: cogsMonth,
      total: operating + purchasing + payroll + cogsMonth,
    };
  });

  const postedOperating = input.operatingExpenses.filter(
    (e) => e.status === "posted" && inScope(e.factory_id, scope)
  );
  const unpostedOperating = input.operatingExpenses.filter(
    (e) => e.status === "pending" && inScope(e.factory_id, scope)
  );

  return {
    summary: {
      period: { from, to, label },
      totalPlExpenses,
      operatingExpenses,
      supplierPayments,
      payrollExpenses,
      cogs,
      materialPurchasesReceived,
      pendingOperating,
      totalCashOut,
      transactionCount: periodLines.length,
      bySource: [...bySourceMap.entries()]
        .map(([source, data]) => ({ source, ...data }))
        .sort((a, b) => b.amount - a.amount),
      byCategory: [...byCategoryMap.entries()]
        .map(([category, data]) => ({ category, ...data }))
        .sort((a, b) => b.amount - a.amount),
      byFactory: [...byFactoryMap.entries()]
        .map(([factory, data]) => ({ factory, ...data }))
        .sort((a, b) => b.amount - a.amount),
      byPaymentMethod: [...byPaymentMap.entries()]
        .map(([method, data]) => ({ method, amount: data.amount, count: data.count }))
        .sort((a, b) => b.amount - a.amount),
      topVendors: [...vendorMap.entries()]
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      monthlyTrend,
      financeSync: {
        postedOperatingCount: postedOperating.length,
        unpostedOperatingCount: unpostedOperating.length,
        sageExpenseTotal: sageInPeriod
          .filter((t) => t.transaction_type === "expense")
          .reduce((s, t) => s + Math.abs(Number(t.amount)), 0),
        sageLinkedOperating: postedOperating.filter((e) => e.sage_transaction_id).length,
        supplierPaymentsInPeriod: supplierPayments,
      },
    },
    unifiedLines,
  };
}

export { SOURCE_LABELS, FACTORY_LABELS as EXPENSE_FACTORY_LABELS };
