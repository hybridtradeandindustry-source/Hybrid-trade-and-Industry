"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FinanceOverview } from "@/components/finance/finance-overview";
import { FinanceReportsPanel } from "@/components/finance/finance-reports-panel";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useFinance } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import {
  cn,
  formatCurrency,
  formatDate,
  formatDateTime,
} from "@/lib/utils";
import {
  FACTORY_IDS,
  type ReconciliationRecord,
  type ReconciliationStatus,
  type SageSyncLog,
  type SageTransaction,
  type ViewScope,
} from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

const RECONCILIATION_STATUSES: ReconciliationStatus[] = [
  "pending",
  "matched",
  "variance",
  "approved",
];

const TRANSACTION_TYPES = ["invoice", "payment", "credit", "debit", "other"];

type DeleteTarget =
  | { type: "reconciliation"; item: ReconciliationRecord }
  | { type: "transaction"; item: SageTransaction };

function resolveDefaultFactoryId(viewScope: ViewScope): string {
  if (viewScope === "block") return FACTORY_IDS.block;
  if (viewScope === "recycling") return FACTORY_IDS.recycling;
  return FACTORY_IDS.block;
}

function FactorySelect({
  viewScope,
  value,
  onChange,
}: {
  viewScope: ViewScope;
  value: string;
  onChange: (v: string) => void;
}) {
  if (viewScope !== "combined") return null;
  return (
    <div className="space-y-2">
      <Label>Factory</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select factory" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FACTORY_IDS.block}>Block Factory</SelectItem>
          <SelectItem value={FACTORY_IDS.recycling}>Plastic Recycling</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export default function FinancePage() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const defaultFactoryId = resolveDefaultFactoryId(viewScope);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReconciliationRecord | null>(null);
  const [mainTab, setMainTab] = useState("dashboard");
  const [activeTab, setActiveTab] = useState("reconciliation");

  const [reconDialogOpen, setReconDialogOpen] = useState(false);
  const [editingRecon, setEditingRecon] = useState<ReconciliationRecord | null>(null);
  const [reconForm, setReconForm] = useState<{
    factory_id: string;
    operational_record_type: string;
    operational_record_id: string;
    operational_amount: string;
    sage_amount: string;
    status: ReconciliationStatus;
  }>({
    factory_id: defaultFactoryId,
    operational_record_type: "order",
    operational_record_id: "",
    operational_amount: "",
    sage_amount: "",
    status: "pending" as ReconciliationStatus,
  });

  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<SageTransaction | null>(null);
  const [txForm, setTxForm] = useState<{
    factory_id: string;
    description: string;
    amount: string;
    transaction_type: string;
    transaction_date: string;
  }>({
    factory_id: defaultFactoryId,
    description: "",
    amount: "",
    transaction_type: "other",
    transaction_date: new Date().toISOString().slice(0, 10),
  });

  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const { data, isLoading, mutate } = useFinance(statusFilter);

  const syncLog = (data?.syncLog ?? {
    status: "success",
    records_processed: 0,
    started_at: new Date().toISOString(),
    completed_at: null,
  }) as SageSyncLog;

  const records = useMemo(() => {
    let filtered = (data?.reconciliation ?? []) as ReconciliationRecord[];
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.operational_record_id.toLowerCase().includes(q) ||
          r.operational_record_type.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [data?.reconciliation, search]);

  const transactions = (data?.transactions ?? []) as SageTransaction[];

  const canSync = hasPermission("finance", "sync");
  const canVerify = hasPermission("finance", "verify");

  const handleSync = () => {
    if (!canSync) {
      toast.error("You don't have permission to sync Sage data");
      return;
    }
    mutate.mutate(
      { action: "sync" },
      {
        onSuccess: () => toast.success("Sage sync completed successfully"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Sync failed"),
      }
    );
  };

  const handleVerify = (id: string) => {
    mutate.mutate(
      { action: "verify", id, status: "approved" },
      {
        onSuccess: () => toast.success("Reconciliation marked for review"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Verification failed"),
      }
    );
  };

  const openCreateRecon = () => {
    setEditingRecon(null);
    setReconForm({
      factory_id: defaultFactoryId,
      operational_record_type: "order",
      operational_record_id: "",
      operational_amount: "",
      sage_amount: "",
      status: "pending",
    });
    setReconDialogOpen(true);
  };

  const openEditRecon = (item: ReconciliationRecord) => {
    setEditingRecon(item);
    setReconForm({
      factory_id: item.factory_id ?? defaultFactoryId,
      operational_record_type: item.operational_record_type,
      operational_record_id: item.operational_record_id,
      operational_amount: String(item.operational_amount),
      sage_amount: item.sage_amount != null ? String(item.sage_amount) : "",
      status: item.status,
    });
    setReconDialogOpen(true);
  };

  const submitRecon = () => {
    if (!canVerify) {
      toast.error("You don't have permission to manage reconciliations");
      return;
    }
    if (!reconForm.operational_record_id.trim()) {
      toast.error("Record ID is required");
      return;
    }
    if (!reconForm.operational_amount || Number.isNaN(Number(reconForm.operational_amount))) {
      toast.error("Operational amount is required");
      return;
    }
    const payload = {
      factory_id: reconForm.factory_id,
      operational_record_type: reconForm.operational_record_type,
      operational_record_id: reconForm.operational_record_id,
      operational_amount: Number(reconForm.operational_amount),
      sage_amount: reconForm.sage_amount ? Number(reconForm.sage_amount) : undefined,
      status: reconForm.status,
    };
    if (editingRecon) {
      mutate.mutate(
        { action: "update_reconciliation", id: editingRecon.id, ...payload },
        {
          onSuccess: () => {
            toast.success("Reconciliation updated");
            setReconDialogOpen(false);
            if (selected?.id === editingRecon.id) {
              setSelected((prev) =>
                prev ? { ...prev, ...payload, variance: payload.operational_amount - (payload.sage_amount ?? 0) } : null
              );
            }
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
        }
      );
    } else {
      mutate.mutate(
        { action: "create_reconciliation", ...payload },
        {
          onSuccess: () => {
            toast.success("Reconciliation created");
            setReconDialogOpen(false);
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
        }
      );
    }
  };

  const openCreateTx = () => {
    setEditingTx(null);
    setTxForm({
      factory_id: defaultFactoryId,
      description: "",
      amount: "",
      transaction_type: "other",
      transaction_date: new Date().toISOString().slice(0, 10),
    });
    setTxDialogOpen(true);
  };

  const openEditTx = (item: SageTransaction) => {
    setEditingTx(item);
    setTxForm({
      factory_id: item.factory_id ?? defaultFactoryId,
      description: item.description ?? "",
      amount: String(item.amount),
      transaction_type: item.transaction_type ?? "other",
      transaction_date: item.transaction_date,
    });
    setTxDialogOpen(true);
  };

  const submitTx = () => {
    if (!canSync) {
      toast.error("You don't have permission to manage transactions");
      return;
    }
    const payload = {
      description: txForm.description,
      amount: Number(txForm.amount),
      transaction_type: txForm.transaction_type,
      factory_id: txForm.factory_id,
      transaction_date: txForm.transaction_date,
    };
    if (editingTx) {
      mutate.mutate(
        { action: "update_transaction", id: editingTx.id, ...payload },
        {
          onSuccess: () => {
            toast.success("Transaction updated");
            setTxDialogOpen(false);
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
        }
      );
    } else {
      mutate.mutate(
        { action: "create_transaction", ...payload },
        {
          onSuccess: () => {
            toast.success("Transaction created");
            setTxDialogOpen(false);
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Create failed"),
        }
      );
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "reconciliation") {
      if (!canVerify) {
        toast.error("You don't have permission to delete reconciliations");
        return;
      }
      mutate.mutate(
        { action: "delete_reconciliation", id: deleteTarget.item.id },
        {
          onSuccess: () => {
            toast.success("Reconciliation deleted");
            if (selected?.id === deleteTarget.item.id) setSelected(null);
            setDeleteTarget(null);
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
        }
      );
    } else {
      if (!canSync) {
        toast.error("You don't have permission to delete transactions");
        return;
      }
      mutate.mutate(
        { action: "delete_transaction", id: deleteTarget.item.id },
        {
          onSuccess: () => {
            toast.success("Transaction deleted");
            setDeleteTarget(null);
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
        }
      );
    }
  };

  const getFactoryName = (factoryId?: string | null) =>
    factoryId ? (FACTORY_NAMES[factoryId] ?? "—") : "—";

  const statusVariant = (status: ReconciliationStatus) => {
    if (status === "matched") return "completed";
    if (status === "variance") return "on_hold";
    if (status === "approved") return "confirmed";
    return "pending";
  };

  const syncing = mutate.isPending;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Finance"
        description="Real-time KPIs, receivables, cash flow, and Sage reconciliation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/expenses">Operating Expenses</Link>
            </Button>
            {mainTab === "reconciliation" ? (
              <>
              {canVerify && activeTab === "reconciliation" && (
                <Button variant="outline" onClick={openCreateRecon}>
                  <Plus className="size-4" />
                  Add Reconciliation
                </Button>
              )}
              {canSync && activeTab === "transactions" && (
                <Button variant="outline" onClick={openCreateTx}>
                  <Plus className="size-4" />
                  Add Transaction
                </Button>
              )}
              {canSync && (
                <Button onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                  Sync Now
                </Button>
              )}
              </>
            ) : null}
          </div>
        }
      />

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-6">
          <FinanceOverview />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <FinanceReportsPanel />
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-6 space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : (
          <>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Sync Status</p>
                <div className="mt-2 flex items-center gap-2">
                  <StatusBadge
                    status={syncLog.status === "success" ? "completed" : syncLog.status === "running" ? "processing" : "pending"}
                    label={syncLog.status.charAt(0).toUpperCase() + syncLog.status.slice(1)}
                  />
                </div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Records Processed</p>
                <p className="mt-2 text-2xl font-bold">{syncLog.records_processed}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Last Sync Started</p>
                <p className="mt-2 text-sm font-medium">{formatDateTime(syncLog.started_at)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Last Sync Completed</p>
                <p className="mt-2 text-sm font-medium">
                  {syncLog.completed_at ? formatDateTime(syncLog.completed_at) : "—"}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="transactions">Sage Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="reconciliation" className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by record ID or type..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="variance">Variance</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <DataTable
                data={records}
                loading={isLoading}
                getRowKey={(row) => row.id}
                emptyMessage="No reconciliation records match your filters"
                columns={[
                  {
                    id: "type",
                    header: "Type",
                    cell: (row) => (
                      <Badge variant="outline" className="capitalize">
                        {row.operational_record_type}
                      </Badge>
                    ),
                  },
                  {
                    id: "record",
                    header: "Record ID",
                    cell: (row) => row.operational_record_id,
                  },
                  {
                    id: "operational",
                    header: "Operational",
                    cell: (row) => formatCurrency(row.operational_amount),
                  },
                  {
                    id: "sage",
                    header: "Sage",
                    cell: (row) =>
                      row.sage_amount != null ? formatCurrency(row.sage_amount) : "—",
                  },
                  {
                    id: "variance",
                    header: "Variance",
                    cell: (row) => (
                      <span
                        className={cn(
                          "font-medium",
                          row.variance !== 0 && "text-destructive"
                        )}
                      >
                        {formatCurrency(row.variance)}
                      </span>
                    ),
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge status={statusVariant(row.status)} label={row.status} />
                    ),
                  },
                  {
                    id: "actions",
                    header: "",
                    cell: (row) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(row)}>
                          Details
                        </Button>
                        {canVerify && (
                          <RowActions
                            onEdit={() => openEditRecon(row)}
                            onDelete={() => setDeleteTarget({ type: "reconciliation", item: row })}
                          />
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Drill-Down Panel</CardTitle>
                <CardDescription>
                  {selected ? "Record details" : "Select a record to view details"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selected ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Record Type</p>
                      <p className="font-medium capitalize">{selected.operational_record_type}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Record ID</p>
                      <p className="font-mono text-sm">{selected.operational_record_id}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Factory</p>
                      <p className="text-sm">{getFactoryName(selected.factory_id)}</p>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Operational</p>
                        <p className="font-semibold">{formatCurrency(selected.operational_amount)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Sage Amount</p>
                        <p className="font-semibold">
                          {selected.sage_amount != null
                            ? formatCurrency(selected.sage_amount)
                            : "Not synced"}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Variance</p>
                      <p
                        className={cn(
                          "text-lg font-bold",
                          selected.variance !== 0 && "text-destructive"
                        )}
                      >
                        {formatCurrency(selected.variance)}
                      </p>
                    </div>
                    <StatusBadge status={statusVariant(selected.status)} label={selected.status} />
                    {canVerify && selected.status === "variance" && (
                      <Button
                        className="w-full"
                        disabled={mutate.isPending}
                        onClick={() => handleVerify(selected.id)}
                      >
                        Mark for Review
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click &quot;Details&quot; on any row to inspect the reconciliation record.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <DataTable
            data={transactions}
            loading={isLoading}
            getRowKey={(row) => row.id}
            emptyMessage="No Sage transactions found"
            columns={[
              {
                id: "date",
                header: "Date",
                cell: (row) => formatDate(row.transaction_date),
              },
              {
                id: "description",
                header: "Description",
                cell: (row) => row.description ?? "—",
              },
              {
                id: "type",
                header: "Type",
                cell: (row) => (
                  <Badge variant="outline" className="capitalize">
                    {row.transaction_type ?? "other"}
                  </Badge>
                ),
              },
              {
                id: "amount",
                header: "Amount",
                cell: (row) => formatCurrency(row.amount),
              },
              {
                id: "factory",
                header: "Factory",
                cell: (row) => getFactoryName(row.factory_id),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  canSync ? (
                    <RowActions
                      onEdit={() => openEditTx(row)}
                      onDelete={() => setDeleteTarget({ type: "transaction", item: row })}
                    />
                  ) : null,
              },
            ]}
          />
        </TabsContent>
      </Tabs>

      <EntityFormDialog
        open={reconDialogOpen}
        onOpenChange={setReconDialogOpen}
        title={editingRecon ? "Edit Reconciliation" : "Add Reconciliation"}
        description="Link an operational record to a Sage amount for reconciliation."
        submitLabel={editingRecon ? "Update" : "Create"}
        isSubmitting={mutate.isPending}
        onSubmit={submitRecon}
      >
        <FactorySelect
          viewScope={viewScope}
          value={reconForm.factory_id}
          onChange={(v) => setReconForm((f) => ({ ...f, factory_id: v }))}
        />
        <div className="space-y-2">
          <Label>Record Type</Label>
          <Select
            value={reconForm.operational_record_type}
            onValueChange={(v) => setReconForm((f) => ({ ...f, operational_record_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="order">Order</SelectItem>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="payment">Payment</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="record-id">Record ID</Label>
          <Input
            id="record-id"
            placeholder="Order UUID or reference (e.g. ORD-1051)"
            value={reconForm.operational_record_id}
            onChange={(e) => setReconForm((f) => ({ ...f, operational_record_id: e.target.value }))}
            required
          />
          <p className="text-xs text-muted-foreground">
            Use the order UUID from Sales, or any reference label for the operational record.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="op-amount">Operational Amount</Label>
            <Input
              id="op-amount"
              type="number"
              step="0.01"
              value={reconForm.operational_amount}
              onChange={(e) => setReconForm((f) => ({ ...f, operational_amount: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sage-amount">Sage Amount</Label>
            <Input
              id="sage-amount"
              type="number"
              step="0.01"
              value={reconForm.sage_amount}
              onChange={(e) => setReconForm((f) => ({ ...f, sage_amount: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={reconForm.status}
            onValueChange={(v) => setReconForm((f) => ({ ...f, status: v as ReconciliationStatus }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECONCILIATION_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={txDialogOpen}
        onOpenChange={setTxDialogOpen}
        title={editingTx ? "Edit Transaction" : "Add Transaction"}
        description="Create or update a Sage transaction record."
        submitLabel={editingTx ? "Update" : "Create"}
        isSubmitting={mutate.isPending}
        onSubmit={submitTx}
      >
        <FactorySelect
          viewScope={viewScope}
          value={txForm.factory_id}
          onChange={(v) => setTxForm((f) => ({ ...f, factory_id: v }))}
        />
        <div className="space-y-2">
          <Label htmlFor="tx-desc">Description</Label>
          <Input
            id="tx-desc"
            value={txForm.description}
            onChange={(e) => setTxForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="tx-amount">Amount</Label>
            <Input
              id="tx-amount"
              type="number"
              step="0.01"
              value={txForm.amount}
              onChange={(e) => setTxForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              value={txForm.transaction_date}
              onChange={(e) => setTxForm((f) => ({ ...f, transaction_date: e.target.value }))}
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Transaction Type</Label>
          <Select
            value={txForm.transaction_type}
            onValueChange={(v) => setTxForm((f) => ({ ...f, transaction_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRANSACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={
          deleteTarget?.type === "reconciliation"
            ? "Delete Reconciliation"
            : "Delete Transaction"
        }
        description="This action cannot be undone. The record will be permanently removed."
        confirmLabel="Delete"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={confirmDelete}
      />
        </TabsContent>
      </Tabs>
    </div>
  );
}
