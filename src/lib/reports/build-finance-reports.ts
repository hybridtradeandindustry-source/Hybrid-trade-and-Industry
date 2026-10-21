import { computeAgingBuckets, computeFinanceDashboard } from "@/lib/services/finance-dashboard";
import { isDateInRange } from "@/lib/production/filters";
import type { FinanceReportData } from "@/lib/reports/finance-data-access";
import { orderCreditAmount } from "@/types";
import type { FinanceReportFilters, ReportBuildResult } from "@/lib/reports/types";
import type { ViewScope } from "@/types";
import { FACTORY_IDS } from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

export function buildFinanceReportByType(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  switch (filters.reportType) {
    case "customer-statements":
      return buildCustomerStatementsReport(scope, filters, data);
    case "aging":
      return buildAgingReport(scope, filters, data);
    case "payments":
      return buildPaymentsReport(scope, filters, data);
    case "revenue":
      return buildRevenueReport(scope, filters, data);
    case "expenses":
      return buildExpensesReport(scope, filters, data);
    case "profitability":
      return buildProfitabilityReport(scope, filters, data);
    case "bank-transactions":
      return buildBankTransactionsReport(scope, filters, data);
    case "dashboard-summary":
      return buildDashboardSummaryReport(scope, filters, data);
    default:
      return buildReconciliationOnlyReport(scope, filters, data);
  }
}

function buildDashboardSummaryReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  const periodLabel = filters.financePeriod.replace(/_/g, " ");
  const dashboard = computeFinanceDashboard({
    orders: data.orders,
    payments: data.payments,
    supplierPayments: data.supplierPayments.map((p) => ({
      amount: p.amount,
      payment_date: p.payment_date,
      purchase_factory_id: p.purchase_factory_id ?? null,
    })),
    customers: data.customers,
    transactions: data.transactions,
    reconciliation: data.reconciliation,
    scope,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    periodLabel,
  });

  const { metrics, customers, alerts, trend } = dashboard;

  return {
    title: "Finance Dashboard Summary",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      {
        name: "KPIs",
        rows: [
          { Metric: "Revenue", Value: metrics.revenue },
          { Metric: "Collections (cash in)", Value: metrics.collections },
          { Metric: "Receivables", Value: metrics.receivables },
          { Metric: "Outstanding Balance", Value: metrics.outstandingBalance },
          { Metric: "Pending Pickup Credit", Value: metrics.pendingOrderCredit },
          { Metric: "Supplier Payments (cash out)", Value: metrics.supplierPayments },
          { Metric: "Operating Cash Out", Value: metrics.operatingCashOut },
          { Metric: "Total Cash Out", Value: metrics.cashOut },
          { Metric: "Expenses (P&L)", Value: metrics.expenses },
          { Metric: "Cash Flow", Value: metrics.cashFlow },
          { Metric: "Net Profit", Value: metrics.netProfit },
          { Metric: "Reconciliation Pending", Value: metrics.reconciliationPending },
          { Metric: "Reconciliation Variance", Value: metrics.reconciliationVariance },
        ],
      },
      {
        name: "Customers",
        rows: customers.map((c) => ({
          Customer: c.customer_name,
          Type: c.customer_type,
          "Credit Balance": c.balance,
          "Pending Pickup": c.pending_order_credit,
          "Total Paid": c.total_paid,
          "Collections (period)": c.collections_in_period,
          "Picked Value": c.picked_value,
        })),
      },
      {
        name: "Alerts",
        rows: alerts.map((a) => ({
          Severity: a.severity,
          Title: a.title,
          Description: a.description,
          Amount: a.amount ?? "—",
        })),
      },
      {
        name: "Trend",
        rows: trend.map((t) => ({
          Date: t.date,
          Revenue: t.revenue,
          Expenses: t.expenses,
          Collections: t.collections,
          "Supplier Payments": t.supplierPayments,
          "Cash Flow": t.cashFlow,
        })),
      },
    ],
  };
}

function buildReconciliationOnlyReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  let rows = data.reconciliation;
  if (filters.status !== "all") {
    rows = rows.filter((row) => row.status === filters.status);
  }
  rows = rows.filter((row) => {
    const date = row.verified_at?.slice(0, 10);
    if (!date) return true;
    return isDateInRange(date, filters.dateFrom, filters.dateTo);
  });

  return {
    title: "Finance Reconciliation Report",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      {
        name: "Reconciliation",
        rows: rows.map((r) => ({
          Factory: FACTORY_NAMES[r.factory_id ?? ""] ?? r.factory_id ?? "—",
          "Record Type": r.operational_record_type,
          "Record ID": r.operational_record_id,
          "Ops Amount": r.operational_amount,
          "Sage Amount": r.sage_amount ?? 0,
          Variance: r.variance,
          Status: r.status,
          Verified: r.verified_at ? r.verified_at.slice(0, 10) : "—",
        })),
      },
    ],
  };
}

function buildCustomerStatementsReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  const orders = data.orders;
  const payments = data.payments;
  let customers = data.customers;
  if (filters.customerId) {
    customers = customers.filter((c) => c.id === filters.customerId);
  } else {
    customers = customers.filter((c) => c.is_active);
  }

  const summaryRows: Record<string, unknown>[] = [];
  const allOrderRows: Record<string, unknown>[] = [];
  const openOrderRows: Record<string, unknown>[] = [];
  const allPaymentRows: Record<string, unknown>[] = [];
  const periodActivityRows: Record<string, unknown>[] = [];

  for (const customer of customers) {
    const customerOrders = orders.filter((o) => o.customer_id === customer.id);
    const customerPayments = payments.filter((p) => p.customer_id === customer.id);
    // "Total Paid"/"Collections" mean cash actually collected — exclude refund/store_credit_issue
    // (money moving out or a wallet credit, not cash in) and store_credit_apply (spending an
    // existing wallet balance, not new cash), matching computeFinanceDashboard's collections logic.
    const actualCustomerPayments = customerPayments.filter((p) => !p.kind || p.kind === "payment");

    const openOrders = customerOrders.filter((o) => o.status === "ordered");
    const openOrderCredit = openOrders.reduce((s, o) => s + orderCreditAmount(o), 0);
    const totalPaid = actualCustomerPayments.reduce((s, p) => s + p.amount, 0);
    const pickedValue = customerOrders
      .filter((o) => o.status === "picked")
      .reduce((s, o) => s + o.total_amount, 0);

    const periodOrders = customerOrders.filter((o) =>
      isDateInRange(o.created_at.slice(0, 10), filters.dateFrom, filters.dateTo)
    );
    const periodPayments = actualCustomerPayments.filter((p) =>
      isDateInRange(p.payment_date, filters.dateFrom, filters.dateTo)
    );
    const periodOrderValue = periodOrders.reduce((s, o) => s + o.total_amount, 0);
    const periodCollections = periodPayments.reduce((s, p) => s + p.amount, 0);

    summaryRows.push({
      Customer: customer.name,
      Type: customer.customer_type ?? "regular",
      Phone: customer.phone ?? "—",
      Email: customer.email ?? "—",
      "Credit Balance": customer.balance,
      "Pending Pickup Credit": openOrderCredit,
      "Total Outstanding": customer.balance + openOrderCredit,
      "Total Paid (all time)": totalPaid,
      "Picked Orders Value": pickedValue,
      "Open Orders": openOrders.length,
      "Total Orders": customerOrders.length,
      "Period Order Value": periodOrderValue,
      "Collections (period)": periodCollections,
    });

    for (const order of customerOrders) {
      const orderDate = order.created_at.slice(0, 10);
      const inPeriod = isDateInRange(orderDate, filters.dateFrom, filters.dateTo);
      const credit = orderCreditAmount(order);
      const row = {
        Customer: customer.name,
        Date: orderDate,
        "Order #": order.order_number,
        Status: order.status,
        Factory: FACTORY_NAMES[order.factory_id] ?? order.factory_id,
        Total: order.total_amount,
        "Discount %": order.discount_percent ?? 0,
        Paid: order.amount_paid ?? 0,
        Credit: credit,
        "Payment Method": order.payment_method ?? "—",
        "In Period": inPeriod ? "Yes" : "No",
      };
      allOrderRows.push(row);
      if (order.status === "ordered") {
        openOrderRows.push({
          ...row,
          "Delivery Date": order.delivery_date?.slice(0, 10) ?? "—",
        });
      }
      if (inPeriod) {
        periodActivityRows.push({
          Customer: customer.name,
          Date: orderDate,
          Type: "Order",
          Reference: order.order_number,
          Description: `${order.status} — ${FACTORY_NAMES[order.factory_id] ?? order.factory_id}`,
          Amount: order.total_amount,
          Paid: order.amount_paid ?? 0,
          Credit: credit,
        });
      }
    }

    for (const payment of customerPayments) {
      const inPeriod = isDateInRange(payment.payment_date, filters.dateFrom, filters.dateTo);
      const paymentRow = {
        Customer: customer.name,
        Date: payment.payment_date,
        Amount: payment.amount,
        Method: payment.payment_method,
        Bank: payment.bank?.name ?? (payment.bank_id ? "—" : "N/A"),
        Reference: payment.reference ?? "—",
        Notes: payment.notes ?? "—",
        "Order #": payment.order_id ?? "—",
        "In Period": inPeriod ? "Yes" : "No",
      };
      allPaymentRows.push(paymentRow);
      if (inPeriod) {
        periodActivityRows.push({
          Customer: customer.name,
          Date: payment.payment_date,
          Type: "Payment",
          Reference: payment.reference ?? payment.id,
          Description: payment.payment_method + (payment.bank?.name ? ` — ${payment.bank.name}` : ""),
          Amount: -payment.amount,
          Paid: payment.amount,
          Credit: 0,
        });
      }
    }
  }

  periodActivityRows.sort((a, b) => String(a.Date).localeCompare(String(b.Date)));

  const customerName = customers.length === 1 ? customers[0].name : null;

  return {
    title: customerName ? `Customer Statement — ${customerName}` : "Customer Statements",
    filterSummary: [
      `Period: ${filters.dateFrom} → ${filters.dateTo}`,
      `Scope: ${scope === "combined" ? "Overall Company" : FACTORY_NAMES[scopeFactoryId(scope) ?? ""] ?? scope}`,
    ],
    sheets: [
      {
        name: "Account Summary",
        rows:
          summaryRows.length > 0
            ? summaryRows
            : [{ Message: "No customer account data found." }],
      },
      {
        name: "All Orders",
        rows:
          allOrderRows.length > 0
            ? allOrderRows
            : [{ Message: "No orders on file for this customer." }],
      },
      {
        name: "Open Orders",
        rows:
          openOrderRows.length > 0
            ? openOrderRows
            : [{ Message: "No orders waiting for pickup." }],
      },
      {
        name: "All Payments",
        rows:
          allPaymentRows.length > 0
            ? allPaymentRows
            : [{ Message: "No payments recorded for this customer." }],
      },
      {
        name: "Period Activity",
        rows:
          periodActivityRows.length > 0
            ? periodActivityRows
            : [{ Message: "No orders or payments in the selected period." }],
      },
    ],
  };
}

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function buildAgingReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  const orders = data.orders;
  const customers = data.customers;
  const buckets = computeAgingBuckets(orders, customers, filters.dateTo);

  const detailRows = orders
    .filter((o) => o.status === "picked" && orderCreditAmount(o) > 0)
    .map((o) => {
      const days = Math.floor(
        (new Date(`${filters.dateTo}T12:00:00`).getTime() -
          new Date(`${(o.delivery_date ?? o.created_at).slice(0, 10)}T12:00:00`).getTime()) /
          86400000
      );
      return {
        "Order #": o.order_number,
        Customer: o.customer?.name ?? o.customer_id,
        Date: (o.delivery_date ?? o.created_at).slice(0, 10),
        "Days Outstanding": days,
        "Credit Amount": orderCreditAmount(o),
        "Total Amount": o.total_amount,
        "Amount Paid": o.amount_paid ?? 0,
      };
    });

  return {
    title: "Accounts Receivable Aging",
    filterSummary: [`As of: ${filters.dateTo}`],
    sheets: [
      { name: "Aging Summary", rows: buckets },
      { name: "Outstanding Orders", rows: detailRows },
    ],
  };
}

function buildPaymentsReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  void scope;
  const bankName = (id?: string | null) =>
    data.banks.find((b) => b.id === id)?.name ?? "—";

  const payments = data.payments.filter((p) => {
    if (!isDateInRange(p.payment_date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.customerId && p.customer_id !== filters.customerId) return false;
    return true;
  });

  const customerName = (id: string) => data.customers.find((c) => c.id === id)?.name ?? id;

  const rows = payments.map((p) => ({
    Date: p.payment_date,
    Customer: customerName(p.customer_id),
    Amount: p.amount,
    Method: p.payment_method,
    Bank: p.payment_method === "bank" ? bankName(p.bank_id) : "—",
    Reference: p.reference ?? "—",
    "Order ID": p.order_id ?? "—",
    Notes: p.notes ?? "—",
  }));

  const byMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.payment_method] = (acc[p.payment_method] ?? 0) + p.amount;
    return acc;
  }, {});

  return {
    title: "Payment Report",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      { name: "Payments", rows },
      {
        name: "Summary",
        rows: [
          { Metric: "Total payments", Value: payments.length },
          { Metric: "Total amount", Value: payments.reduce((s, p) => s + p.amount, 0) },
          ...Object.entries(byMethod).map(([method, amount]) => ({
            Metric: `${method} total`,
            Value: amount,
          })),
        ],
      },
    ],
  };
}

function buildRevenueReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  void scope;
  const orders = data.orders.filter(
    (o) =>
      o.status === "picked" &&
      isDateInRange((o.delivery_date ?? o.created_at).slice(0, 10), filters.dateFrom, filters.dateTo)
  );

  const rows = orders.map((o) => ({
    Date: (o.delivery_date ?? o.created_at).slice(0, 10),
    "Order #": o.order_number,
    Customer: o.customer?.name ?? o.customer_id,
    Factory: FACTORY_NAMES[o.factory_id] ?? o.factory_id,
    Revenue: o.total_amount,
    Paid: o.amount_paid ?? 0,
    Unpaid: orderCreditAmount(o),
    "Discount %": o.discount_percent ?? 0,
  }));

  const totalRevenue = rows.reduce((s, r) => s + Number(r.Revenue), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.Paid), 0);
  const totalUnpaid = rows.reduce((s, r) => s + Number(r.Unpaid), 0);

  return {
    title: "Revenue Summary",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      { name: "Revenue Detail", rows },
      {
        name: "Summary",
        rows: [
          { Metric: "Orders", Value: rows.length },
          { Metric: "Total revenue", Value: totalRevenue },
          { Metric: "Paid in full / partial", Value: totalPaid },
          { Metric: "Unpaid (credit)", Value: totalUnpaid },
        ],
      },
    ],
  };
}

function buildExpensesReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  const transactions = data.transactions.filter(
      (t) =>
        (t.transaction_type === "expense" || t.amount < 0) &&
        isDateInRange(t.transaction_date, filters.dateFrom, filters.dateTo)
    );

  const rows = transactions.map((t) => ({
    Date: t.transaction_date,
    Description: t.description ?? "—",
    Factory: FACTORY_NAMES[t.factory_id ?? ""] ?? t.factory_id ?? "—",
    Amount: Math.abs(t.amount),
    Type: t.transaction_type ?? "expense",
    "Sage ID": t.sage_id,
  }));

  return {
    title: "Expense Report",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      { name: "Expenses", rows },
      {
        name: "Summary",
        rows: [
          { Metric: "Transactions", Value: rows.length },
          { Metric: "Total expenses", Value: rows.reduce((s, r) => s + Number(r.Amount), 0) },
        ],
      },
    ],
  };
}

function buildProfitabilityReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  const revenue = buildRevenueReport(scope, filters, data);
  const expenses = buildExpensesReport(scope, filters, data);

  const totalRevenue = revenue.sheets[1]?.rows.find((r) => r.Metric === "Total revenue")?.Value as number ?? 0;
  const totalExpenses = expenses.sheets[1]?.rows.find((r) => r.Metric === "Total expenses")?.Value as number ?? 0;
  const netProfit = totalRevenue - totalExpenses;
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0";

  return {
    title: "Profitability Report",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      {
        name: "P&L Summary",
        rows: [
          { Line: "Revenue", Amount: totalRevenue },
          { Line: "Expenses", Amount: totalExpenses },
          { Line: "Net Profit", Amount: netProfit },
          { Line: "Margin %", Amount: margin },
        ],
      },
      ...(revenue.sheets[0] ? [{ name: "Revenue Detail", rows: revenue.sheets[0].rows }] : []),
      ...(expenses.sheets[0] ? [{ name: "Expense Detail", rows: expenses.sheets[0].rows }] : []),
    ],
  };
}

function buildBankTransactionsReport(
  scope: ViewScope,
  filters: FinanceReportFilters,
  data: FinanceReportData
): ReportBuildResult {
  const bankPayments = data.payments.filter(
    (p) =>
      p.payment_method === "bank" &&
      isDateInRange(p.payment_date, filters.dateFrom, filters.dateTo)
  );
  const sageBank = data.transactions.filter(
      (t) =>
        t.transaction_type === "payment" &&
        isDateInRange(t.transaction_date, filters.dateFrom, filters.dateTo)
    );

  const paymentRows = bankPayments.map((p) => ({
    Date: p.payment_date,
    Source: "Customer Payment",
    Reference: p.reference ?? p.id,
    Customer: data.customers.find((c) => c.id === p.customer_id)?.name ?? p.customer_id,
    Bank: p.bank?.name ?? data.banks.find((b) => b.id === p.bank_id)?.name ?? "—",
    Amount: p.amount,
    Description: p.notes ?? "—",
  }));

  const sageRows = sageBank.map((t) => ({
    Date: t.transaction_date,
    Source: "Sage",
    Reference: t.sage_id,
    Customer: "—",
    Amount: Math.abs(t.amount),
    Description: t.description ?? "—",
  }));

  const allRows = [...paymentRows, ...sageRows].sort((a, b) =>
    String(a.Date).localeCompare(String(b.Date))
  );

  return {
    title: "Bank Transaction Report",
    filterSummary: [`Period: ${filters.dateFrom} → ${filters.dateTo}`],
    sheets: [
      { name: "Bank Transactions", rows: allRows },
      {
        name: "Summary",
        rows: [
          { Metric: "Customer bank payments", Value: bankPayments.length },
          { Metric: "Sage bank entries", Value: sageBank.length },
          {
            Metric: "Total amount",
            Value: allRows.reduce((s, r) => s + Number(r.Amount), 0),
          },
        ],
      },
    ],
  };
}
