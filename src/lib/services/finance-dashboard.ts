import { isDateInRange } from "@/lib/production/filters";
import { orderCreditAmount } from "@/types";
import type {
  Customer,
  CustomerFinancialRow,
  CustomerPayment,
  FinanceDashboardMetrics,
  FinanceTrendPoint,
  FinancialAlert,
  Order,
  ReconciliationRecord,
  SageTransaction,
  ViewScope,
} from "@/types";
import { FACTORY_IDS } from "@/types";

export type FinanceSupplierPayment = {
  amount: number;
  payment_date: string;
  purchase_factory_id?: string | null;
};

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function filterByScope<T extends { factory_id?: string | null }>(
  items: T[],
  scope: ViewScope
): T[] {
  const factoryId = scopeFactoryId(scope);
  if (!factoryId) return items;
  return items.filter((item) => item.factory_id === factoryId);
}

function filterSupplierPaymentsByScope(
  payments: FinanceSupplierPayment[],
  scope: ViewScope
): FinanceSupplierPayment[] {
  const factoryId = scopeFactoryId(scope);
  if (!factoryId) return payments;
  // Payments not tied to a specific purchase (e.g. a general credit payment
  // to a shared supplier) can't be attributed to either factory, so they're
  // only included in "combined" — including them in every scope (the old
  // `!payment.purchase_factory_id ||` fallback) leaked Block-factory
  // payments into the Recycling view and vice versa.
  return payments.filter((payment) => payment.purchase_factory_id === factoryId);
}

function orderActivityDate(order: Order): string {
  return (order.delivery_date ?? order.created_at).slice(0, 10);
}

/**
 * The deposit taken at order creation is recorded in BOTH `orders.amount_paid`
 * AND as a `customer_payments` row tied to that order_id (with
 * affects_balance:false — it's a history record, not a second payment).
 * `paymentsByOrder` already includes that deposit, so it must be used
 * INSTEAD of `order.amount_paid`, never added on top of it — doing both
 * double-counts the same money and understates how much is still owed.
 * Only fall back to `order.amount_paid` when no payment row exists at all
 * (e.g. amount_paid was edited directly after creation).
 */
function orderAmountPaid(order: Order, paymentsByOrder: Map<string, number>): number {
  return paymentsByOrder.get(order.id) ?? Number(order.amount_paid ?? 0);
}

/**
 * Outstanding balance for a picked order, mirroring `orderCreditAmount`'s formula but using
 * the ledger-reconstructed `orderAmountPaid` (which also captures payments made after order
 * creation) instead of the frozen `order.amount_paid`. Withholding and store credit applied
 * at order time are snapshotted directly on the order row, not in the payment ledger, so they
 * must be added here too — otherwise a picked order with withholding/store-credit still shows
 * that portion as owed even though it's already effectively settled.
 */
function orderOutstandingAmount(order: Order, paymentsByOrder: Map<string, number>): number {
  const paid =
    orderAmountPaid(order, paymentsByOrder) +
    Number(order.withholding_amount ?? 0) +
    Number(order.store_credit_applied ?? 0);
  return Math.max(0, Number(order.total_amount) - paid);
}

export function computeFinanceDashboard(input: {
  orders: Order[];
  payments: CustomerPayment[];
  supplierPayments?: FinanceSupplierPayment[];
  customers: Customer[];
  transactions: SageTransaction[];
  reconciliation: ReconciliationRecord[];
  scope: ViewScope;
  dateFrom: string;
  dateTo: string;
  periodLabel: string;
}): {
  metrics: FinanceDashboardMetrics;
  customers: CustomerFinancialRow[];
  alerts: FinancialAlert[];
  trend: FinanceTrendPoint[];
} {
  const orders = filterByScope(input.orders, input.scope);
  const transactions = filterByScope(input.transactions, input.scope);
  const reconciliation = filterByScope(input.reconciliation, input.scope);
  const supplierPayments = filterSupplierPaymentsByScope(
    input.supplierPayments ?? [],
    input.scope
  );
  const { dateFrom, dateTo, periodLabel } = input;

  const pickedInPeriod = orders.filter(
    (o) =>
      o.status === "picked" && isDateInRange(orderActivityDate(o), dateFrom, dateTo)
  );
  const revenueFromOrders = pickedInPeriod.reduce((s, o) => s + o.total_amount, 0);
  const revenueFromSage = transactions
    .filter(
      (t) =>
        t.transaction_type === "revenue" &&
        isDateInRange(t.transaction_date, dateFrom, dateTo)
    )
    .reduce((s, t) => s + Math.abs(t.amount), 0);
  const revenue = Math.max(revenueFromOrders, revenueFromSage);

  const expenses = transactions
    .filter(
      (t) =>
        (t.transaction_type === "expense" ||
          t.transaction_type === "cogs" ||
          t.transaction_type === "payroll_expense" ||
          t.amount < 0) &&
        isDateInRange(t.transaction_date, dateFrom, dateTo)
    )
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const payrollExpenses = transactions
    .filter(
      (t) =>
        t.transaction_type === "payroll_expense" &&
        isDateInRange(t.transaction_date, dateFrom, dateTo)
    )
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  // customers.balance and customer_payments are a single global ledger — they
  // can't be split by factory. Scoped receivables/collections are instead
  // derived directly from this scope's orders (already factory-filtered
  // above) plus payments tied to those orders via order_id, mirroring the
  // Credit page's approach. Payments not linked to any order can't be
  // attributed to a factory, so they're only included when scope is
  // "combined" (where attribution doesn't matter).
  const scopedOrderIds = input.scope === "combined" ? null : new Set(orders.map((o) => o.id));
  // Only `kind: "payment"` (or legacy rows with no kind) rows are real cash collected —
  // refund/store_credit_issue move money the other way, and store_credit_apply is spending
  // an existing wallet balance, not new cash in. store_credit_applied is already added back
  // separately in orderOutstandingAmount, so including its ledger row here would double-count it.
  const actualPayments = input.payments.filter((p) => !p.kind || p.kind === "payment");
  const relevantPayments =
    scopedOrderIds === null
      ? actualPayments
      : actualPayments.filter((p) => !!p.order_id && scopedOrderIds.has(p.order_id));

  const paymentsByOrder = new Map<string, number>();
  for (const p of relevantPayments) {
    if (!p.order_id) continue;
    paymentsByOrder.set(p.order_id, (paymentsByOrder.get(p.order_id) ?? 0) + p.amount);
  }

  const paymentsInPeriod = relevantPayments.filter((p) =>
    isDateInRange(p.payment_date, dateFrom, dateTo)
  );
  const collections = paymentsInPeriod.reduce((s, p) => s + p.amount, 0);

  const supplierPaymentsInPeriod = supplierPayments
    .filter((p) => isDateInRange(p.payment_date, dateFrom, dateTo))
    .reduce((s, p) => s + p.amount, 0);

  const operatingCashOut = transactions
    .filter(
      (t) =>
        t.transaction_type === "expense" &&
        isDateInRange(t.transaction_date, dateFrom, dateTo)
    )
    .reduce((s, t) => s + Math.abs(t.amount), 0);

  const cashOut = supplierPaymentsInPeriod + operatingCashOut;
  const cashFlow = collections - cashOut;

  const pickedOrders = orders.filter((o) => o.status === "picked");
  const receivables = pickedOrders.reduce(
    (s, o) => s + orderOutstandingAmount(o, paymentsByOrder),
    0
  );

  const pendingOrderCredit = orders
    .filter((o) => o.status === "ordered")
    .reduce((s, o) => s + orderCreditAmount(o), 0);
  const outstandingBalance = receivables + pendingOrderCredit;

  const reconciliationPending = reconciliation.filter((r) => r.status === "pending").length;
  const reconciliationVariance = reconciliation
    .filter((r) => r.status === "variance" || r.status === "pending")
    .reduce((s, r) => s + Math.abs(r.variance), 0);

  const netProfit = revenue - expenses;

  const customerIdsInScope = new Set(orders.map((o) => o.customer_id));
  // "combined" keeps every active customer (matches prior behavior); a
  // scoped view only lists customers who actually have an order in scope.
  const customersForRows =
    input.scope === "combined"
      ? input.customers.filter((c) => c.is_active)
      : input.customers.filter((c) => c.is_active && customerIdsInScope.has(c.id));

  const customerRows: CustomerFinancialRow[] = customersForRows
    .map((customer) => {
      const customerOrders = orders.filter((o) => o.customer_id === customer.id);
      const customerPickedOrders = customerOrders.filter((o) => o.status === "picked");
      const scopedBalance = customerPickedOrders.reduce(
        (s, o) => s + orderOutstandingAmount(o, paymentsByOrder),
        0
      );

      const customerPayments = relevantPayments.filter(
        (p) =>
          p.customer_id === customer.id ||
          (p.order_id && customerOrders.some((o) => o.id === p.order_id))
      );
      const totalPaid = customerPayments.reduce((s, p) => s + p.amount, 0);
      const collectionsInPeriod = customerPayments
        .filter((p) => isDateInRange(p.payment_date, dateFrom, dateTo))
        .reduce((s, p) => s + p.amount, 0);

      const pendingCredit = customerOrders
        .filter((o) => o.status === "ordered")
        .reduce((s, o) => s + orderCreditAmount(o), 0);
      const pickedValue = customerPickedOrders.reduce((s, o) => s + o.total_amount, 0);

      // "combined" scope has no factory attribution issue, so the real
      // global ledger balance is the most accurate figure there.
      const balance = input.scope === "combined" ? customer.balance : scopedBalance;

      return {
        customer_id: customer.id,
        customer_name: customer.name,
        customer_type: customer.customer_type ?? "regular",
        balance,
        total_paid: totalPaid,
        collections_in_period: collectionsInPeriod,
        credit_outstanding: balance,
        pending_order_credit: pendingCredit,
        picked_value: pickedValue,
      };
    })
    .sort((a, b) => b.credit_outstanding - a.credit_outstanding);

  const alerts: FinancialAlert[] = [];

  if (reconciliationPending > 0) {
    alerts.push({
      id: "recon-pending",
      severity: "warning",
      title: "Pending reconciliations",
      description: `${reconciliationPending} record(s) awaiting verification`,
      amount: reconciliationVariance,
    });
  }

  const highBalanceCustomers = customerRows.filter((c) => c.balance >= 15000);
  for (const c of highBalanceCustomers.slice(0, 3)) {
    alerts.push({
      id: `high-balance-${c.customer_id}`,
      severity: c.balance >= 20000 ? "critical" : "warning",
      title: `High outstanding balance — ${c.customer_name}`,
      description: `Customer owes ${c.balance.toLocaleString()} with ${c.pending_order_credit.toLocaleString()} on open orders`,
      amount: c.balance,
    });
  }

  if (outstandingBalance > revenue * 0.5 && revenue > 0) {
    alerts.push({
      id: "high-outstanding-ratio",
      severity: "warning",
      title: "Elevated receivables",
      description: `${((outstandingBalance / revenue) * 100).toFixed(0)}% of period revenue is still outstanding`,
      amount: outstandingBalance,
    });
  }

  if (cashFlow < 0 && collections > 0) {
    alerts.push({
      id: "negative-cash-flow",
      severity: "warning",
      title: "Negative cash flow",
      description: `Cash out (${cashOut.toLocaleString()}) exceeded collections (${collections.toLocaleString()}) this period`,
      amount: Math.abs(cashFlow),
    });
  }

  if (expenses > revenue && revenue > 0) {
    alerts.push({
      id: "expenses-exceed-revenue",
      severity: "critical",
      title: "Expenses exceed revenue",
      description: `Period expenses (${expenses.toLocaleString()}) are above revenue (${revenue.toLocaleString()})`,
      amount: expenses - revenue,
    });
  }

  const trend = buildFinanceTrend(
    orders,
    relevantPayments,
    supplierPayments,
    transactions,
    dateFrom,
    dateTo
  );

  return {
    metrics: {
      period: { from: dateFrom, to: dateTo, label: periodLabel },
      revenue,
      receivables,
      collections,
      supplierPayments: supplierPaymentsInPeriod,
      operatingCashOut,
      cashOut,
      expenses,
      payrollExpenses,
      cashFlow,
      outstandingBalance,
      pendingOrderCredit,
      reconciliationPending,
      reconciliationVariance,
      netProfit,
    },
    customers: customerRows,
    alerts,
    trend,
  };
}

function buildFinanceTrend(
  orders: Order[],
  payments: CustomerPayment[],
  supplierPayments: FinanceSupplierPayment[],
  transactions: SageTransaction[],
  dateFrom: string,
  dateTo: string
): FinanceTrendPoint[] {
  const points: FinanceTrendPoint[] = [];
  const start = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  const dayMs = 86400000;

  for (let t = start.getTime(); t <= end.getTime(); t += dayMs) {
    const date = new Date(t).toISOString().slice(0, 10);
    const revenue = orders
      .filter((o) => o.status === "picked" && orderActivityDate(o) === date)
      .reduce((s, o) => s + o.total_amount, 0);
    const expenses = transactions
      .filter(
        (tx) =>
          tx.transaction_date.slice(0, 10) === date &&
          (tx.transaction_type === "expense" ||
            tx.transaction_type === "cogs" ||
            tx.amount < 0)
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const collections = payments
      .filter((p) => p.payment_date.slice(0, 10) === date)
      .reduce((s, p) => s + p.amount, 0);
    const supplierPaymentsDay = supplierPayments
      .filter((p) => p.payment_date.slice(0, 10) === date)
      .reduce((s, p) => s + p.amount, 0);
    const operatingCashOut = transactions
      .filter(
        (tx) =>
          tx.transaction_date.slice(0, 10) === date && tx.transaction_type === "expense"
      )
      .reduce((s, tx) => s + Math.abs(tx.amount), 0);
    const cashFlow = collections - supplierPaymentsDay - operatingCashOut;

    points.push({
      date,
      revenue,
      expenses,
      collections,
      supplierPayments: supplierPaymentsDay,
      cashFlow,
    });
  }

  if (points.length > 31) {
    const bucketSize = Math.ceil(points.length / 12);
    const buckets: FinanceTrendPoint[] = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const slice = points.slice(i, i + bucketSize);
      buckets.push({
        date: slice[0].date,
        revenue: slice.reduce((s, p) => s + p.revenue, 0),
        expenses: slice.reduce((s, p) => s + p.expenses, 0),
        collections: slice.reduce((s, p) => s + p.collections, 0),
        supplierPayments: slice.reduce((s, p) => s + p.supplierPayments, 0),
        cashFlow: slice.reduce((s, p) => s + p.cashFlow, 0),
      });
    }
    return buckets;
  }

  return points;
}

export function computeAgingBuckets(
  orders: Order[],
  customers: Customer[],
  asOfDate: string
): Array<{ bucket: string; amount: number; orderCount: number }> {
  const asOf = new Date(`${asOfDate}T12:00:00`).getTime();
  const buckets = {
    current: { amount: 0, orderCount: 0 },
    days_31_60: { amount: 0, orderCount: 0 },
    days_61_90: { amount: 0, orderCount: 0 },
    over_90: { amount: 0, orderCount: 0 },
  };

  for (const order of orders.filter((o) => o.status === "picked")) {
    const credit = orderCreditAmount(order);
    if (credit <= 0) continue;
    const orderDate = new Date(`${orderActivityDate(order)}T12:00:00`).getTime();
    const days = Math.floor((asOf - orderDate) / 86400000);
    const key =
      days <= 30
        ? "current"
        : days <= 60
          ? "days_31_60"
          : days <= 90
            ? "days_61_90"
            : "over_90";
    buckets[key].amount += credit;
    buckets[key].orderCount += 1;
  }

  const customerBalanceTotal = customers.reduce((s, c) => s + c.balance, 0);
  const orderCreditTotal = Object.values(buckets).reduce((s, b) => s + b.amount, 0);
  if (customerBalanceTotal > orderCreditTotal) {
    buckets.current.amount += customerBalanceTotal - orderCreditTotal;
  }

  return [
    { bucket: "Current (0–30 days)", ...buckets.current },
    { bucket: "31–60 days", ...buckets.days_31_60 },
    { bucket: "61–90 days", ...buckets.days_61_90 },
    { bucket: "Over 90 days", ...buckets.over_90 },
  ];
}
