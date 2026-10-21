"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { useCustomers } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { cn, formatCurrency } from "@/lib/utils";
import type { CustomerSummary, CustomerType } from "@/types";

const PAGE_SIZE = 10;

type CustomerFormState = {
  name: string;
  email: string;
  phone: string;
  address: string;
  tin: string;
  balance: string;
};

const emptyCustomerForm = (): CustomerFormState => ({
  name: "",
  email: "",
  phone: "",
  address: "",
  tin: "",
  balance: "0",
});

type TypeFilter = "all" | CustomerType;
type StatusFilter = "all" | "active" | "inactive";

export default function CustomersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const { data: customersData, isLoading, mutate } = useCustomers();

  const canManage = hasPermission("sales", "manage");
  const customers = (customersData ?? []) as CustomerSummary[];

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomerSummary | null>(null);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...customers]
      .filter((c) => (typeFilter === "all" ? true : (c.customer_type ?? "regular") === typeFilter))
      .filter((c) =>
        statusFilter === "all" ? true : statusFilter === "active" ? c.is_active : !c.is_active
      )
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          (c.phone ?? "").toLowerCase().includes(q) ||
          (c.tin ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [customers, search, typeFilter, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);
  const paginatedCustomers = useMemo(
    () => filteredCustomers.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredCustomers, effectivePage]
  );

  const openCreate = () => {
    setEditingCustomer(null);
    setForm(emptyCustomerForm());
    setFormOpen(true);
  };

  const openEdit = (customer: CustomerSummary) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address: customer.address ?? "",
      tin: customer.tin ?? "",
      balance: String(customer.balance),
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage customers");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Customer name is required");
      return;
    }

    const payload = editingCustomer
      ? {
          action: "update",
          id: editingCustomer.id,
          name: form.name.trim(),
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          tin: form.tin || undefined,
          balance: Number(form.balance) || 0,
        }
      : {
          name: form.name.trim(),
          email: form.email || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          tin: form.tin || undefined,
          customer_type: "regular" as CustomerType,
          balance: Number(form.balance) || 0,
        };

    mutate.mutate(payload, {
      onSuccess: () => {
        toast.success(editingCustomer ? "Customer updated" : "Customer created");
        setFormOpen(false);
        setEditingCustomer(null);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Customer action failed"),
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    mutate.mutate(
      { action: "delete", id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success(`${deleteTarget.name} deactivated`);
          setDeleteTarget(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  const scopedScore = (customer: CustomerSummary) => {
    const score =
      viewScope === "block"
        ? customer.credit_score_block
        : viewScope === "recycling"
          ? customer.credit_score_recycling
          : customer.credit_score;
    const tier =
      viewScope === "block"
        ? customer.credit_risk_tier_block
        : viewScope === "recycling"
          ? customer.credit_risk_tier_recycling
          : customer.credit_risk_tier;
    return { score, tier };
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Customers"
        description="Regular and walking customers. Click a row to view full details, payments, and order history."
        actions={
          canManage ? (
            <Button onClick={openCreate} className="gap-1.5 shadow-sm">
              <UserPlus className="size-4" />
              Add Customer
            </Button>
          ) : undefined
        }
      />

      <Card className="border-border/60 bg-card/50">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Directory</CardTitle>
            <CardDescription>
              Showing {paginatedCustomers.length} of {filteredCustomers.length}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search name, email, phone, TIN"
                className="pl-8"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v as TypeFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="regular">Regular</SelectItem>
                <SelectItem value="walking">Walking</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as StatusFilter);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            data={paginatedCustomers}
            getRowKey={(row) => row.id}
            emptyMessage="No customers match the selected filters."
            onRowClick={(row) => router.push(`/dashboard/customers/${row.id}`)}
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (row) => (
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.email ?? "No email"}</p>
                  </div>
                ),
              },
              {
                id: "type",
                header: "Type",
                cell: (row) => (
                  <Badge variant="outline" className="text-[10px]">
                    {(row.customer_type ?? "regular") === "walking" ? "Walking" : "Regular"}
                  </Badge>
                ),
              },
              {
                id: "contact",
                header: "Phone",
                cell: (row) => row.phone ?? "—",
              },
              {
                id: "balance",
                header: "Balance",
                cell: (row) => (
                  <span className={cn("font-medium", row.balance > 0 && "text-warning")}>
                    {formatCurrency(row.balance)}
                  </span>
                ),
              },
              {
                id: "store_credit",
                header: "Store Credit",
                cell: (row) =>
                  Number(row.store_credit_balance ?? 0) > 0
                    ? formatCurrency(Number(row.store_credit_balance))
                    : "—",
              },
              {
                id: "orders",
                header: "Orders",
                cell: (row) => (
                  <span>
                    {row.order_count}
                    {row.open_order_count > 0 ? ` (${row.open_order_count} open)` : ""}
                  </span>
                ),
              },
              {
                id: "score",
                header: "Credit Score",
                cell: (row) => {
                  const { score, tier } = scopedScore(row);
                  if (score == null) return "—";
                  return (
                    <Badge
                      variant={
                        tier === "blocked" || tier === "high"
                          ? "destructive"
                          : tier === "medium"
                            ? "warning"
                            : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {score}
                    </Badge>
                  );
                },
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <StatusBadge status={row.is_active ? "active" : "inactive"} />
                ),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  canManage ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActions onEdit={() => openEdit(row)} onDelete={() => setDeleteTarget(row)} />
                    </div>
                  ) : null,
              },
            ]}
          />
          {pageCount > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Page {effectivePage} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={effectivePage <= 1}
                  onClick={() => setPage(Math.max(1, effectivePage - 1))}
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={effectivePage >= pageCount}
                  onClick={() => setPage(Math.min(pageCount, effectivePage + 1))}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingCustomer ? "Edit Customer" : "Add Customer"}
        description={
          editingCustomer
            ? "Update customer contact details. Adjust outstanding balance for manual corrections."
            : "Add a new customer to the sales directory."
        }
        submitLabel={editingCustomer ? "Save Changes" : "Add Customer"}
        isSubmitting={mutate.isPending}
        onSubmit={handleSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="customer-name">Name</Label>
          <Input
            id="customer-name"
            placeholder="Company or contact name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer-email">Email</Label>
            <Input
              id="customer-email"
              type="email"
              placeholder="email@example.com"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-phone">Phone</Label>
            <Input
              id="customer-phone"
              placeholder="+234 ..."
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-tin">TIN</Label>
          <Input
            id="customer-tin"
            placeholder="Tax identification number"
            value={form.tin}
            onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-address">Address</Label>
          <Textarea
            id="customer-address"
            placeholder="Street, city, state"
            rows={2}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-balance">Outstanding Balance (manual adjustment)</Label>
          <p className="text-xs text-muted-foreground">
            Auto-increases when credit orders are picked. Edit only for opening balances or corrections.
          </p>
          <Input
            id="customer-balance"
            type="number"
            min="0"
            step="0.01"
            value={form.balance}
            onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))}
          />
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Deactivate Customer"
        description={`Are you sure you want to deactivate ${deleteTarget?.name}? They will no longer appear as active.`}
        confirmLabel="Deactivate"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
