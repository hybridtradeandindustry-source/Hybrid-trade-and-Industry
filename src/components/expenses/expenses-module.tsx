"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Plus,
  Receipt,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { BankSelect } from "@/components/finance/bank-select";
import {
  ExpensesAnalyticsPanel,
  SOURCE_LABELS,
} from "@/components/expenses/expenses-analytics-panel";
import { useExpenses } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import {
  financePeriodLabel,
  monthYearOptions,
  type FinancePeriod,
} from "@/lib/finance/periods";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  FACTORY_IDS,
  type ExpenseAnalyticsSummary,
  type ExpenseSourceType,
  type OperatingExpense,
  type PaymentMethod,
  type UnifiedExpenseLine,
} from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

const STATUS_MAP: Record<
  OperatingExpense["status"],
  "active" | "inactive" | "pending"
> = {
  posted: "active",
  pending: "pending",
  cancelled: "inactive",
};

const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "specific_month", label: "Specific month" },
  { value: "custom", label: "Custom range" },
];

const SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All sources" },
  ...Object.entries(SOURCE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

type ExpenseForm = {
  category_id: string;
  vendor_name: string;
  description: string;
  amount: string;
  expense_date: string;
  payment_method: PaymentMethod;
  bank_account_id: string;
  reference: string;
  notes: string;
  post_immediately: boolean;
};

const emptyForm = (): ExpenseForm => ({
  category_id: "",
  vendor_name: "",
  description: "",
  amount: "",
  expense_date: new Date().toISOString().slice(0, 10),
  payment_method: "cash",
  bank_account_id: "",
  reference: "",
  notes: "",
  post_immediately: true,
});

const emptyAnalytics = (): ExpenseAnalyticsSummary => ({
  period: { from: "", to: "", label: "" },
  totalPlExpenses: 0,
  operatingExpenses: 0,
  supplierPayments: 0,
  payrollExpenses: 0,
  cogs: 0,
  materialPurchasesReceived: 0,
  pendingOperating: 0,
  totalCashOut: 0,
  transactionCount: 0,
  bySource: [],
  byCategory: [],
  byFactory: [],
  byPaymentMethod: [],
  topVendors: [],
  monthlyTrend: [],
  financeSync: {
    postedOperatingCount: 0,
    unpostedOperatingCount: 0,
    sageExpenseTotal: 0,
    sageLinkedOperating: 0,
    supplierPaymentsInPeriod: 0,
  },
});

function exportUnifiedCsv(lines: UnifiedExpenseLine[], periodLabel: string) {
  const headers = [
    "Date",
    "Source",
    "Category",
    "Description",
    "Vendor",
    "Amount",
    "Factory",
    "Payment Method",
    "Status",
    "In Finance Ledger",
    "Reference",
  ];
  const rows = lines.map((line) => [
    line.date,
    SOURCE_LABELS[line.source_type as ExpenseSourceType] ?? line.source_type,
    line.category,
    `"${line.description.replace(/"/g, '""')}"`,
    line.vendor ?? "",
    line.amount.toFixed(2),
    line.factory_id ? (FACTORY_NAMES[line.factory_id] ?? line.factory_id) : "",
    line.payment_method ?? "",
    line.status ?? "",
    line.in_finance_ledger ? "Yes" : "No",
    line.reference_id ?? "",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `expenses-${periodLabel.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExpensesModule() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const canManage =
    hasPermission("finance", "manage") || hasPermission("finance", "sync");
  const defaultFactoryId =
    viewScope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  const [period, setPeriod] = useState<FinancePeriod>("this_month");
  const [monthYear, setMonthYear] = useState(monthYearOptions()[0]?.value ?? "");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState("analytics");

  const periodOptions = useMemo(
    () =>
      period === "specific_month"
        ? { monthYear }
        : period === "custom"
          ? { dateFrom, dateTo }
          : undefined,
    [period, monthYear, dateFrom, dateTo]
  );

  const { data, isLoading, mutate } = useExpenses(period, periodOptions);
  const expenses = data?.expenses ?? [];
  const categories = data?.categories ?? [];
  const metrics = data?.metrics ?? {
    totalPending: 0,
    pendingCount: 0,
    postedThisMonth: 0,
    postedCountThisMonth: 0,
    totalPostedAllTime: 0,
    byCategory: [],
  };
  const analytics = data?.analytics ?? emptyAnalytics();
  const unifiedLines = data?.unifiedLines ?? [];

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OperatingExpense | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OperatingExpense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OperatingExpense | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);

  const filteredOperating = useMemo(() => {
    let rows = expenses;
    if (statusFilter !== "all") {
      rows = rows.filter((e) => e.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          (e.vendor_name ?? "").toLowerCase().includes(q) ||
          (e.category_name ?? "").toLowerCase().includes(q) ||
          (e.reference ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [expenses, search, statusFilter]);

  const filteredUnified = useMemo(() => {
    let rows = unifiedLines;
    if (sourceFilter !== "all") {
      rows = rows.filter((l) => l.source_type === sourceFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (l) =>
          l.description.toLowerCase().includes(q) ||
          (l.vendor ?? "").toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          (l.reference_id ?? "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [unifiedLines, search, sourceFilter]);

  const purchasingLines = useMemo(
    () =>
      unifiedLines.filter(
        (l) =>
          l.source_type === "supplier_payment" || l.source_type === "material_purchase"
      ),
    [unifiedLines]
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm(), category_id: categories[0]?.id ?? "" });
    setFormOpen(true);
  };

  const openEdit = (row: OperatingExpense) => {
    setActiveTab("operating");
    setEditing(row);
    setForm({
      category_id: row.category_id ?? "",
      vendor_name: row.vendor_name ?? "",
      description: row.description,
      amount: String(row.amount),
      expense_date: row.expense_date.slice(0, 10),
      payment_method: row.payment_method,
      bank_account_id: row.bank_account_id ?? "",
      reference: row.reference ?? "",
      notes: row.notes ?? "",
      post_immediately: false,
    });
    setFormOpen(true);
  };

  const post = (body: Record<string, unknown>, successMsg: string) => {
    mutate.mutate(body, {
      onSuccess: () => toast.success(successMsg),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Action failed"),
    });
  };

  const handleSubmit = () => {
    if (!form.description.trim()) {
      toast.error("Description is required");
      return;
    }
    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (form.payment_method === "bank" && !form.bank_account_id) {
      toast.error("Select a bank account");
      return;
    }

    const payload = {
      action: editing ? "update" : "create",
      ...(editing ? { id: editing.id } : {}),
      scope: viewScope === "recycling" ? "recycling" : "block",
      factory_id: editing?.factory_id ?? defaultFactoryId,
      category_id: form.category_id || undefined,
      vendor_name: form.vendor_name || undefined,
      description: form.description.trim(),
      amount,
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      bank_account_id: form.payment_method === "bank" ? form.bank_account_id : undefined,
      reference: form.reference || undefined,
      notes: form.notes || undefined,
      post_immediately: !editing && form.post_immediately,
    };

    mutate.mutate(payload, {
      onSuccess: () => {
        toast.success(editing ? "Expense updated" : "Expense recorded");
        setFormOpen(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
    });
  };

  const periodLabel = analytics.period?.label ?? financePeriodLabel(period);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-full max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Expense Analytics Hub"
        description="Unified view of all expenses — operating costs, purchasing, payroll, and finance ledger. Everything stays in sync with Finance."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/finance">
                Finance Module
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/purchasing">
                Purchasing
                <ShoppingCart className="size-4" />
              </Link>
            </Button>
            {canManage && (
              <Button onClick={openCreate} className="gap-1.5">
                <Plus className="size-4" />
                Add Expense
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium">{periodLabel}</p>
          {analytics.period?.from && analytics.period?.to && (
            <p className="text-xs text-muted-foreground">
              {formatDate(analytics.period.from)} – {formatDate(analytics.period.to)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as FinancePeriod)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {period === "specific_month" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Month</Label>
              <Select value={monthYear} onValueChange={setMonthYear}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthYearOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {period === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="all">All Expenses</TabsTrigger>
          <TabsTrigger value="operating">Operating</TabsTrigger>
          <TabsTrigger value="purchasing">Purchasing</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          <ExpensesAnalyticsPanel analytics={analytics} />
        </TabsContent>

        <TabsContent value="all" className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Period Total"
              value={formatCurrency(
                analytics.operatingExpenses +
                  analytics.supplierPayments +
                  analytics.payrollExpenses +
                  analytics.cogs
              )}
              info={`${analytics.transactionCount} transactions`}
            />
            <MetricCard
              title="Cash Out"
              value={formatCurrency(analytics.totalCashOut)}
              icon={<Wallet className="size-4" />}
            />
            <MetricCard
              title="P&L Expenses"
              value={formatCurrency(analytics.totalPlExpenses)}
              icon={<Receipt className="size-4" />}
            />
          </div>

          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Unified Expense Ledger</CardTitle>
                <CardDescription>
                  All expense sources in one place — operating, purchasing, payroll, COGS, and
                  finance ledger entries.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-48"
                />
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_FILTER_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportUnifiedCsv(filteredUnified, periodLabel)}
                  disabled={filteredUnified.length === 0}
                >
                  <Download className="size-4" />
                  Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                data={filteredUnified}
                getRowKey={(row) => `${row.source_type}-${row.id}`}
                emptyMessage="No expenses in this period."
                columns={[
                  {
                    id: "date",
                    header: "Date",
                    cell: (row) => formatDate(row.date),
                  },
                  {
                    id: "source",
                    header: "Source",
                    cell: (row) => (
                      <Badge variant="outline" className="text-[10px]">
                        {SOURCE_LABELS[row.source_type] ?? row.source_type}
                      </Badge>
                    ),
                  },
                  {
                    id: "description",
                    header: "Description",
                    cell: (row) => (
                      <div>
                        <p className="font-medium">{row.description}</p>
                        {row.vendor && (
                          <p className="text-xs text-muted-foreground">{row.vendor}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "category",
                    header: "Category",
                    cell: (row) => row.category,
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => formatCurrency(row.amount),
                  },
                  {
                    id: "ledger",
                    header: "Finance",
                    cell: (row) =>
                      row.in_finance_ledger ? (
                        <Badge variant="secondary" className="text-[10px]">
                          Synced
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Operational
                        </Badge>
                      ),
                  },
                  {
                    id: "link",
                    header: "",
                    cell: (row) => (
                      <div className="flex items-center gap-1">
                        {canManage && row.source_type === "operating_expense" && row.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              const expense = expenses.find((e) => e.id === row.id);
                              if (expense) openEdit(expense);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {row.detail_path ? (
                          <Button variant="ghost" size="sm" asChild className="h-7">
                            <Link href={row.detail_path}>View</Link>
                          </Button>
                        ) : null}
                      </div>
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operating" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Posted This Month"
              value={formatCurrency(metrics.postedThisMonth)}
              icon={<Receipt className="size-4" />}
              info={`${metrics.postedCountThisMonth} expense(s) posted this month`}
            />
            <MetricCard
              title="Pending Approval"
              value={formatCurrency(metrics.totalPending)}
              icon={<Wallet className="size-4" />}
              info={`${metrics.pendingCount} waiting to post`}
            />
            <MetricCard
              title="Posted (Period)"
              value={formatCurrency(analytics.operatingExpenses)}
              info="Posted operating expenses in selected period"
            />
            <MetricCard
              title="Top Category"
              value={analytics.byCategory[0]?.category ?? metrics.byCategory[0]?.category ?? "—"}
              info={
                (analytics.byCategory[0] ?? metrics.byCategory[0])
                  ? formatCurrency((analytics.byCategory[0] ?? metrics.byCategory[0])!.amount)
                  : "No data"
              }
            />
          </div>

          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle>Operating Expense Register</CardTitle>
                <CardDescription>
                  Create, edit, and post operating expenses. Posted entries sync to the finance
                  ledger automatically.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Search description, vendor, reference…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-56"
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="posted">Posted</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                data={filteredOperating}
                getRowKey={(row) => row.id}
                emptyMessage="No operating expenses yet."
                columns={[
                  {
                    id: "date",
                    header: "Date",
                    cell: (row) => formatDate(row.expense_date),
                  },
                  {
                    id: "category",
                    header: "Category",
                    cell: (row) => row.category_name ?? "—",
                  },
                  {
                    id: "description",
                    header: "Description",
                    cell: (row) => (
                      <div>
                        <p className="font-medium">{row.description}</p>
                        {row.vendor_name && (
                          <p className="text-xs text-muted-foreground">{row.vendor_name}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "factory",
                    header: "Factory",
                    cell: (row) => (
                      <Badge variant="outline" className="text-[10px]">
                        {FACTORY_NAMES[row.factory_id ?? ""] ?? "—"}
                      </Badge>
                    ),
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => formatCurrency(row.amount),
                  },
                  {
                    id: "payment",
                    header: "Payment",
                    cell: (row) => <span className="capitalize">{row.payment_method}</span>,
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={STATUS_MAP[row.status]} label={row.status} />
                        {row.sage_transaction_id && (
                          <Badge variant="secondary" className="text-[9px]">
                            Sage
                          </Badge>
                        )}
                      </div>
                    ),
                  },
                  ...(canManage
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: OperatingExpense) => (
                            <div className="flex items-center gap-1">
                              {row.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  disabled={mutate.isPending}
                                  onClick={() =>
                                    post({ action: "post", id: row.id }, "Posted to finance")
                                  }
                                >
                                  Post
                                </Button>
                              )}
                              <RowActions
                                onEdit={
                                  row.status !== "cancelled" ? () => openEdit(row) : undefined
                                }
                                onDelete={
                                  row.status === "pending" ? () => setDeleteTarget(row) : undefined
                                }
                                extraActions={
                                  row.status === "posted"
                                    ? [
                                        {
                                          label: "Cancel & reverse",
                                          destructive: true,
                                          onClick: () => setCancelTarget(row),
                                        },
                                      ]
                                    : row.status === "pending"
                                      ? [
                                          {
                                            label: "Cancel",
                                            onClick: () => setCancelTarget(row),
                                          },
                                        ]
                                      : []
                                }
                              />
                            </div>
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchasing" className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              title="Supplier Payments"
              value={formatCurrency(analytics.supplierPayments)}
              icon={<ShoppingCart className="size-4" />}
              info="Cash paid to suppliers in period"
            />
            <MetricCard
              title="Material Purchases"
              value={formatCurrency(analytics.materialPurchasesReceived)}
              info="Received purchase orders (accrual)"
            />
            <MetricCard
              title="Purchasing Lines"
              value={String(purchasingLines.length)}
              info="Payments + received purchases in period"
            />
          </div>

          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Purchasing Spend</CardTitle>
                <CardDescription>
                  Supplier payments and received material purchases. Manage full purchasing workflow
                  in the Purchasing module.
                </CardDescription>
              </div>
              <Button asChild>
                <Link href="/dashboard/purchasing">
                  Open Purchasing
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                data={purchasingLines}
                getRowKey={(row) => `${row.source_type}-${row.id}`}
                emptyMessage="No purchasing expenses in this period."
                columns={[
                  {
                    id: "date",
                    header: "Date",
                    cell: (row) => formatDate(row.date),
                  },
                  {
                    id: "type",
                    header: "Type",
                    cell: (row) => (
                      <Badge variant="outline" className="text-[10px]">
                        {SOURCE_LABELS[row.source_type]}
                      </Badge>
                    ),
                  },
                  {
                    id: "description",
                    header: "Description",
                    cell: (row) => (
                      <div>
                        <p className="font-medium">{row.description}</p>
                        {row.vendor && (
                          <p className="text-xs text-muted-foreground">{row.vendor}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => formatCurrency(row.amount),
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => row.status ?? "—",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "Edit Expense" : "Add Expense"}
        submitLabel={
          editing ? "Save Changes" : form.post_immediately ? "Save & Post" : "Save as Pending"
        }
        isSubmitting={mutate.isPending}
        contentClassName="sm:max-w-xl max-h-[90vh] overflow-y-auto"
        onSubmit={handleSubmit}
      >
        {editing?.status === "posted" && (
          <p className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            This expense is posted to finance. Saving will update the linked Sage ledger entry.
          </p>
        )}
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            value={form.category_id}
            onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="What was this expense for?"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Amount</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Vendor / Payee (optional)</Label>
          <Input
            value={form.vendor_name}
            onChange={(e) => setForm((f) => ({ ...f, vendor_name: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select
              value={form.payment_method}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  payment_method: v as PaymentMethod,
                  bank_account_id: v === "cash" ? "" : f.bank_account_id,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              placeholder="Invoice #, receipt #"
            />
          </div>
        </div>
        {form.payment_method === "bank" && (
          <BankSelect
            value={form.bank_account_id}
            onChange={(v) => setForm((f) => ({ ...f, bank_account_id: v }))}
            required
          />
        )}
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
        {!editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.post_immediately}
              onChange={(e) =>
                setForm((f) => ({ ...f, post_immediately: e.target.checked }))
              }
              className="rounded border-border"
            />
            Post to finance immediately
          </label>
        )}
      </EntityFormDialog>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Cancel expense?"
        description={
          cancelTarget?.status === "posted"
            ? "This will reverse the Sage transaction and mark the expense as cancelled."
            : "This expense will be marked as cancelled."
        }
        confirmLabel="Cancel Expense"
        variant="destructive"
        onConfirm={() => {
          if (!cancelTarget) return;
          post({ action: "cancel", id: cancelTarget.id }, "Expense cancelled");
          setCancelTarget(null);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete expense?"
        description="This permanently removes the pending expense record."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (!deleteTarget) return;
          post({ action: "delete", id: deleteTarget.id }, "Expense deleted");
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
