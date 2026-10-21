"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CreditCard, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreditDashboard } from "@/hooks/use-api";
import { useAppStore } from "@/stores/app-store";
import { FACTORY_OPTIONS } from "@/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { CreditDashboardData, CreditInvoiceRow } from "@/lib/services/credit-dashboard";

const STATUS_VARIANT: Record<CreditInvoiceRow["payment_status"], "outline" | "secondary" | "destructive"> = {
  paid: "secondary",
  partial: "outline",
  unpaid: "destructive",
};

export default function CreditPage() {
  const { data, isLoading } = useCreditDashboard();
  const [search, setSearch] = useState("");
  const { viewScope } = useAppStore();
  const scopeLabel = FACTORY_OPTIONS.find((o) => o.value === viewScope)?.label ?? "Overall Company";

  const dashboard = data as CreditDashboardData | undefined;
  const invoices = dashboard?.invoices ?? [];

  const filteredInvoices = useMemo(() => {
    const outstanding = invoices.filter((i) => i.remaining_balance > 0);
    if (!search.trim()) return outstanding;
    const q = search.trim().toLowerCase();
    return outstanding.filter(
      (i) =>
        i.customer_name.toLowerCase().includes(q) || i.order_number.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
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
        title="Credit Management"
        description={`${scopeLabel} credit sales — outstanding balances, overdue invoices, and payment status. Switch factory scope in the top bar to focus a factory.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Outstanding Credit"
          value={formatCurrency(dashboard?.totalOutstandingCredit ?? 0)}
          icon={<CreditCard className="size-4" />}
          info="Total unpaid balance owed by customers across all credit sales."
        />
        <MetricCard
          title="Overdue Payments"
          value={formatCurrency(dashboard?.overdueAmount ?? 0)}
          change={dashboard?.overdueCount ? { value: -dashboard.overdueCount, label: `${dashboard.overdueCount} invoices` } : undefined}
          icon={<AlertTriangle className="size-4" />}
          className={dashboard?.overdueCount ? "border-destructive/30" : undefined}
          info="Total amount past its due date and still unpaid."
        />
        <MetricCard
          title="Customers with Balance"
          value={dashboard?.customersWithBalance.length ?? 0}
          icon={<Users className="size-4" />}
          info="Number of customers who currently owe an outstanding balance."
        />
        <MetricCard
          title="Recently Paid"
          value={dashboard?.recentlyPaid.length ?? 0}
          icon={<CheckCircle2 className="size-4" />}
          info="Number of credit accounts with a payment recorded recently."
        />
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Outstanding Invoices</CardTitle>
          <CardDescription>Credit sales awaiting full payment — {filteredInvoices.length} shown</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by customer or order number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          <DataTable
            data={filteredInvoices}
            getRowKey={(row) => row.order_id}
            emptyMessage="No outstanding credit invoices."
            columns={[
              {
                id: "invoice",
                header: "Invoice #",
                cell: (row) => <span className="font-mono text-sm">{row.order_number}</span>,
              },
              { id: "customer", header: "Customer", cell: (row) => row.customer_name },
              {
                id: "credit",
                header: "Credit Amount",
                cell: (row) => formatCurrency(row.credit_amount),
              },
              { id: "paid", header: "Paid", cell: (row) => formatCurrency(row.amount_paid) },
              {
                id: "remaining",
                header: "Remaining",
                cell: (row) => (
                  <span className="font-medium text-destructive">
                    {formatCurrency(row.remaining_balance)}
                  </span>
                ),
              },
              {
                id: "due",
                header: "Due Date",
                cell: (row) => (row.due_date ? formatDate(row.due_date) : "—"),
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <div className="flex items-center gap-1.5">
                    <Badge variant={STATUS_VARIANT[row.payment_status]} className="capitalize">
                      {row.payment_status}
                    </Badge>
                    {row.is_overdue && (
                      <Badge variant="destructive" className="text-[10px]">
                        Overdue
                      </Badge>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Recently Paid Invoices</CardTitle>
          <CardDescription>Credit sales fully settled</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={dashboard?.recentlyPaid ?? []}
            getRowKey={(row) => row.order_id}
            emptyMessage="No recently paid invoices."
            columns={[
              {
                id: "invoice",
                header: "Invoice #",
                cell: (row) => <span className="font-mono text-sm">{row.order_number}</span>,
              },
              { id: "customer", header: "Customer", cell: (row) => row.customer_name },
              { id: "paid", header: "Paid", cell: (row) => formatCurrency(row.amount_paid) },
              {
                id: "last_payment",
                header: "Last Payment",
                cell: (row) => (row.last_payment_date ? formatDate(row.last_payment_date) : "—"),
              },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
