"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
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
import { useSuppliers } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { cn, formatCurrency } from "@/lib/utils";
import type { Supplier, SupplierType } from "@/types";

const PAGE_SIZE = 10;

type SupplierFormState = {
  name: string;
  supplier_type: SupplierType;
  contact_phone: string;
  contact_email: string;
  address: string;
};

const emptySupplierForm = (): SupplierFormState => ({
  name: "",
  supplier_type: "credit",
  contact_phone: "",
  contact_email: "",
  address: "",
});

type TypeFilter = "all" | SupplierType;

export default function SuppliersPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { data: suppliersData, isLoading, mutate } = useSuppliers();

  const canManage = hasPermission("inventory", "manage");
  const suppliers = (suppliersData ?? []) as Supplier[];

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierFormState>(emptySupplierForm);

  const filteredSuppliers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...suppliers]
      .filter((s) => (typeFilter === "all" ? true : (s.supplier_type ?? "credit") === typeFilter))
      .filter((s) => {
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.contact_phone ?? "").toLowerCase().includes(q) ||
          (s.contact_email ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [suppliers, search, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredSuppliers.length / PAGE_SIZE));
  const effectivePage = Math.min(page, pageCount);
  const paginatedSuppliers = useMemo(
    () => filteredSuppliers.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE),
    [filteredSuppliers, effectivePage]
  );

  const openCreate = () => {
    setEditingSupplier(null);
    setForm(emptySupplierForm());
    setFormOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setForm({
      name: supplier.name,
      supplier_type: (supplier.supplier_type ?? "credit") as SupplierType,
      contact_phone: supplier.contact_phone ?? "",
      contact_email: supplier.contact_email ?? "",
      address: supplier.address ?? "",
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage suppliers");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    const payload = editingSupplier
      ? {
          action: "update",
          id: editingSupplier.id,
          name: form.name.trim(),
          supplier_type: form.supplier_type,
          contact_phone: form.contact_phone || undefined,
          contact_email: form.contact_email || undefined,
          address: form.address || undefined,
        }
      : {
          name: form.name.trim(),
          supplier_type: form.supplier_type,
          contact_phone: form.contact_phone || undefined,
          contact_email: form.contact_email || undefined,
          address: form.address || undefined,
        };

    mutate.mutate(payload, {
      onSuccess: () => {
        toast.success(editingSupplier ? "Supplier updated" : "Supplier added");
        setFormOpen(false);
        setEditingSupplier(null);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Supplier action failed"),
    });
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
        title="Suppliers"
        description="Materials suppliers across both factories. Click a row to view purchase and payment history."
        actions={
          canManage ? (
            <Button onClick={openCreate} className="gap-1.5 shadow-sm">
              <Truck className="size-4" />
              Add Supplier
            </Button>
          ) : undefined
        }
      />

      <Card className="border-border/60 bg-card/50">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Directory</CardTitle>
            <CardDescription>
              Showing {paginatedSuppliers.length} of {filteredSuppliers.length}
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
                placeholder="Search name, phone, email"
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
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            data={paginatedSuppliers}
            getRowKey={(row) => row.id}
            emptyMessage="No suppliers match the selected filters."
            onRowClick={(row) => router.push(`/dashboard/suppliers/${row.id}`)}
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (row) => (
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{row.contact_email ?? "No email"}</p>
                  </div>
                ),
              },
              {
                id: "type",
                header: "Type",
                cell: (row) => (
                  <Badge variant="outline" className="text-[10px]">
                    {(row.supplier_type ?? "credit") === "cash" ? "Cash" : "Credit"}
                  </Badge>
                ),
              },
              {
                id: "contact",
                header: "Phone",
                cell: (row) => row.contact_phone ?? "—",
              },
              {
                id: "balance",
                header: "Payable Balance",
                cell: (row) => (
                  <span className={cn("font-medium", Number(row.balance ?? 0) > 0 && "text-warning")}>
                    {formatCurrency(Number(row.balance ?? 0))}
                  </span>
                ),
              },
              {
                id: "total_purchases",
                header: "Total Purchases",
                cell: (row) => formatCurrency(Number(row.total_purchases ?? 0)),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  canManage ? (
                    <div onClick={(e) => e.stopPropagation()}>
                      <RowActions onEdit={() => openEdit(row)} />
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
        title={editingSupplier ? "Edit Supplier" : "Add Supplier"}
        description={
          editingSupplier
            ? "Update supplier contact details and terms."
            : "Add a new materials supplier."
        }
        submitLabel={editingSupplier ? "Save Changes" : "Add Supplier"}
        isSubmitting={mutate.isPending}
        onSubmit={handleSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="supplier-name">Name</Label>
          <Input
            id="supplier-name"
            placeholder="Company or contact name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-type">Terms</Label>
          <Select
            value={form.supplier_type}
            onValueChange={(v) => setForm((f) => ({ ...f, supplier_type: v as SupplierType }))}
          >
            <SelectTrigger id="supplier-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="credit">Credit</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="supplier-phone">Phone</Label>
            <Input
              id="supplier-phone"
              placeholder="+234 ..."
              value={form.contact_phone}
              onChange={(e) => setForm((f) => ({ ...f, contact_phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier-email">Email</Label>
            <Input
              id="supplier-email"
              type="email"
              placeholder="email@example.com"
              value={form.contact_email}
              onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="supplier-address">Address</Label>
          <Textarea
            id="supplier-address"
            placeholder="Street, city, state"
            rows={2}
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
      </EntityFormDialog>
    </div>
  );
}
