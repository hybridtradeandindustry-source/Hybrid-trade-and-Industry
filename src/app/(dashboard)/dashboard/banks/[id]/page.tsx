"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Landmark } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { useBankDetail, useBanks } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { BankAccount } from "@/types";

type AccountFormState = {
  account_number: string;
  account_name: string;
};

const emptyAccountForm = (): AccountFormState => ({ account_number: "", account_name: "" });

export default function BankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canManage = hasPermission("finance", "verify");

  const { data, isLoading, error, refetch } = useBankDetail(id);
  const { mutate } = useBanks();

  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [form, setForm] = useState<AccountFormState>(emptyAccountForm());

  const openCreateAccount = () => {
    setEditingAccount(null);
    setForm(emptyAccountForm());
    setAccountFormOpen(true);
  };

  const openEditAccount = (account: BankAccount) => {
    setEditingAccount(account);
    setForm({ account_number: account.account_number, account_name: account.account_name ?? "" });
    setAccountFormOpen(true);
  };

  const handleSubmitAccount = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage bank accounts");
      return;
    }
    if (!form.account_number.trim()) {
      toast.error("Account number is required");
      return;
    }

    const payload = editingAccount
      ? {
          action: "update_account",
          id: editingAccount.id,
          account_number: form.account_number.trim(),
          account_name: form.account_name || undefined,
        }
      : {
          action: "create_account",
          bank_id: id,
          account_number: form.account_number.trim(),
          account_name: form.account_name || undefined,
        };

    mutate.mutate(payload, {
      onSuccess: () => {
        toast.success(editingAccount ? "Account updated" : "Account added");
        setAccountFormOpen(false);
        setEditingAccount(null);
        refetch();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Account action failed"),
    });
  };

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

  if (error || !data) {
    return (
      <div className="space-y-8">
        <PageHeader title="Bank not found" description="This bank may have been deleted." />
        <Button variant="outline" asChild>
          <Link href="/dashboard/banks">
            <ArrowLeft className="size-4" />
            Back to Banks
          </Link>
        </Button>
      </div>
    );
  }

  const { bank, accounts, totalReceived, totalPaidOut, transactionCount, recentTransactions } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        title={bank.name}
        description={bank.code ? `Code: ${bank.code}` : "Bank details and account activity"}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/banks">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            {canManage && (
              <Button onClick={openCreateAccount} className="gap-1.5">
                <Landmark className="size-4" />
                Add Account
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Received"
          value={formatCurrency(totalReceived)}
          info="Total real cash payments received across every account under this bank — excludes refunds and store-credit ledger entries."
        />
        <MetricCard
          title="Total Paid Out"
          value={formatCurrency(totalPaidOut)}
          info="Total paid to suppliers from every account under this bank."
        />
        <MetricCard
          title="Net"
          value={formatCurrency(totalReceived - totalPaidOut)}
          info="Total received minus total paid out, across every account under this bank."
        />
        <MetricCard
          title="Accounts"
          value={accounts.length}
          info="Number of accounts configured under this bank."
        />
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>Received and paid out per account</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={accounts}
            getRowKey={(row) => row.id}
            emptyMessage="No accounts yet — add one to start recording payments against this bank."
            columns={[
              {
                id: "account",
                header: "Account",
                cell: (row) => (
                  <div>
                    <p className="font-mono text-sm">{row.account_number}</p>
                    {row.account_name && <p className="text-xs text-muted-foreground">{row.account_name}</p>}
                  </div>
                ),
              },
              {
                id: "received",
                header: "Received",
                cell: (row) => formatCurrency(row.received),
              },
              {
                id: "paid_out",
                header: "Paid Out",
                cell: (row) => formatCurrency(row.paidOut),
              },
              {
                id: "transactions",
                header: "Transactions",
                cell: (row) => row.transactionCount,
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <Badge variant={row.is_active ? "secondary" : "outline"} className="text-[10px]">
                    {row.is_active ? "Active" : "Inactive"}
                  </Badge>
                ),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  canManage ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActions onEdit={() => openEditAccount(row)} />
                    </div>
                  ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Recent Transactions</CardTitle>
          <CardDescription>
            Last {recentTransactions.length} of {transactionCount} across every account under this bank
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={recentTransactions}
            getRowKey={(row) => `${row.kind}-${row.id}`}
            emptyMessage="No transactions recorded yet"
            columns={[
              { id: "date", header: "Date", cell: (row) => formatDate(row.date) },
              {
                id: "kind",
                header: "Type",
                cell: (row) => (
                  <Badge variant={row.kind === "received" ? "secondary" : "outline"} className="text-[10px]">
                    {row.kind === "received" ? "Received" : "Paid Out"}
                  </Badge>
                ),
              },
              { id: "account", header: "Account", cell: (row) => row.account_number },
              { id: "description", header: "Description", cell: (row) => row.description },
              {
                id: "amount",
                header: "Amount",
                cell: (row) => (
                  <span className={row.kind === "received" ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                    {row.kind === "received" ? "+" : "-"}
                    {formatCurrency(row.amount)}
                  </span>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        title={editingAccount ? "Edit Account" : "Add Account"}
        description={
          editingAccount
            ? "Update this account's number or label."
            : `Add a new account under ${bank.name}.`
        }
        submitLabel={editingAccount ? "Save Changes" : "Add Account"}
        isSubmitting={mutate.isPending}
        onSubmit={handleSubmitAccount}
      >
        <div className="space-y-2">
          <Label htmlFor="account-number">Account Number</Label>
          <Input
            id="account-number"
            placeholder="e.g. 1000123456789"
            value={form.account_number}
            onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-name">Label (optional)</Label>
          <Input
            id="account-name"
            placeholder="e.g. Main, Payroll"
            value={form.account_name}
            onChange={(e) => setForm((f) => ({ ...f, account_name: e.target.value }))}
          />
        </div>
      </EntityFormDialog>
    </div>
  );
}
