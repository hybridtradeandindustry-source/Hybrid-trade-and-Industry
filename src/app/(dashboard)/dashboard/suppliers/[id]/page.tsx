"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { BankSelect } from "@/components/finance/bank-select";
import { useSupplierDetail, useSuppliers } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { purchaseCreditAmount } from "@/lib/purchasing/credit-utils";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import type { MaterialPurchase, PaymentMethod, SupplierType } from "@/types";

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

function purchaseStatusVariant(status: string) {
  if (status === "received") return "secondary" as const;
  if (status === "cancelled") return "outline" as const;
  return "default" as const;
}

function paymentStatusVariant(status?: string) {
  if (status === "paid") return "secondary" as const;
  if (status === "partial") return "default" as const;
  return "outline" as const;
}

export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canManage = hasPermission("inventory", "manage");

  const { data, isLoading, error, refetch } = useSupplierDetail(id);
  const { mutate } = useSuppliers();

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<SupplierFormState>(emptySupplierForm());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "cash" as PaymentMethod,
    bank_account_id: "",
    payment_date: new Date().toISOString().slice(0, 10),
    reference: "",
    notes: "",
  });

  const openEdit = () => {
    if (!data) return;
    const s = data.supplier;
    setForm({
      name: s.name,
      supplier_type: (s.supplier_type ?? "credit") as SupplierType,
      contact_phone: s.contact_phone ?? "",
      contact_email: s.contact_email ?? "",
      address: s.address ?? "",
    });
    setEditOpen(true);
  };

  const handleSubmitEdit = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage suppliers");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    mutate.mutate(
      {
        action: "update",
        id,
        name: form.name.trim(),
        supplier_type: form.supplier_type,
        contact_phone: form.contact_phone || undefined,
        contact_email: form.contact_email || undefined,
        address: form.address || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Supplier updated");
          setEditOpen(false);
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
      }
    );
  };

  const handleRecordPayment = () => {
    if (!canManage) return;
    const amount = Number(paymentForm.amount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (paymentForm.payment_method === "bank" && !paymentForm.bank_account_id) {
      toast.error("Select the bank used for payment");
      return;
    }
    mutate.mutate(
      {
        action: "record_payment",
        id,
        amount,
        payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.payment_method === "bank" ? paymentForm.bank_account_id : undefined,
        payment_date: paymentForm.payment_date,
        reference: paymentForm.reference || undefined,
        notes: paymentForm.notes || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Payment of ${formatCurrency(amount)} recorded`);
          setPaymentOpen(false);
          setPaymentForm({
            amount: "",
            payment_method: "cash",
            bank_account_id: "",
            payment_date: new Date().toISOString().slice(0, 10),
            reference: "",
            notes: "",
          });
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Payment failed"),
      }
    );
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
        <PageHeader title="Supplier not found" description="This supplier may have been deleted." />
        <Button variant="outline" asChild>
          <Link href="/dashboard/suppliers">
            <ArrowLeft className="size-4" />
            Back to Suppliers
          </Link>
        </Button>
      </div>
    );
  }

  const { supplier, purchases, payments } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        title={supplier.name}
        description={`${(supplier.supplier_type ?? "credit") === "cash" ? "Cash" : "Credit"} supplier${
          supplier.contact_email ? ` · ${supplier.contact_email}` : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/suppliers">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            {canManage && (
              <Button variant="outline" onClick={openEdit}>
                Edit Profile
              </Button>
            )}
            {canManage && Number(supplier.balance ?? 0) > 0 && (
              <Button onClick={() => setPaymentOpen(true)}>Record Payment</Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Total Purchases"
          value={formatCurrency(Number(supplier.total_purchases ?? 0))}
          info="Total value of all purchases received from this supplier."
        />
        <MetricCard
          title="Payable Balance"
          value={formatCurrency(Number(supplier.balance ?? 0))}
          info="Outstanding amount owed to this supplier on credit purchases."
        />
        <MetricCard
          title="Purchase Orders"
          value={purchases.length}
          info="Total number of purchase orders placed with this supplier."
        />
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Contact Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-sm">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            {supplier.contact_email ?? "—"}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            {supplier.contact_phone ?? "—"}
          </div>
          {supplier.address && (
            <div className="flex items-start gap-2 text-sm sm:col-span-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              {supplier.address}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Purchase History</CardTitle>
          <CardDescription>All purchase orders placed with {supplier.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={purchases}
            getRowKey={(row) => row.id}
            emptyMessage="No purchases from this supplier yet"
            columns={[
              {
                id: "number",
                header: "PO #",
                cell: (row: MaterialPurchase) => (
                  <span className="font-mono text-sm">{row.purchase_number}</span>
                ),
              },
              { id: "date", header: "Date", cell: (row: MaterialPurchase) => formatDate(row.purchase_date) },
              {
                id: "material",
                header: "Material",
                cell: (row: MaterialPurchase) => (
                  <div>
                    <p className="capitalize">{row.material_type.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">{row.item?.name ?? "—"}</p>
                  </div>
                ),
              },
              {
                id: "qty",
                header: "Quantity",
                cell: (row: MaterialPurchase) => `${formatNumber(row.quantity)} ${row.unit}`,
              },
              { id: "cost", header: "Total", cell: (row: MaterialPurchase) => formatCurrency(row.total_cost) },
              {
                id: "payment",
                header: "Payment",
                cell: (row: MaterialPurchase) =>
                  row.status === "received" ? (
                    <div className="space-y-1 text-xs">
                      <p>Paid: {formatCurrency(row.amount_paid ?? 0)}</p>
                      <p className="text-muted-foreground">
                        Credit: {formatCurrency(purchaseCreditAmount(row))}
                      </p>
                      <Badge variant={paymentStatusVariant(row.payment_status)} className="capitalize">
                        {row.payment_status ?? "unpaid"}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Set on receive</span>
                  ),
              },
              {
                id: "status",
                header: "Delivery",
                cell: (row: MaterialPurchase) => (
                  <Badge variant={purchaseStatusVariant(row.status)} className="capitalize">
                    {row.status}
                  </Badge>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>Payments made to {supplier.name}</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={payments}
            getRowKey={(row) => row.id}
            emptyMessage="No payments recorded yet"
            columns={[
              { id: "date", header: "Date", cell: (row) => formatDate(row.payment_date) },
              { id: "amount", header: "Amount", cell: (row) => formatCurrency(row.amount) },
              {
                id: "method",
                header: "Method",
                cell: (row) => (
                  <div>
                    <span>{row.payment_method}</span>
                    {row.bank?.name && (
                      <p className="text-xs text-muted-foreground">{row.bank.name}</p>
                    )}
                  </div>
                ),
              },
              { id: "purchase", header: "Purchase #", cell: (row) => row.purchase_number ?? "—" },
              { id: "reference", header: "Reference", cell: (row) => row.reference ?? "—" },
              { id: "notes", header: "Notes", cell: (row) => row.notes ?? "—" },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Supplier"
        description="Update supplier contact details and terms."
        submitLabel="Save Changes"
        isSubmitting={mutate.isPending}
        onSubmit={handleSubmitEdit}
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

      <EntityFormDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        title="Record Payment"
        description={`Pay down the balance owed to ${supplier.name}. Outstanding: ${formatCurrency(Number(supplier.balance ?? 0))}`}
        submitLabel="Record Payment"
        isSubmitting={mutate.isPending}
        onSubmit={handleRecordPayment}
      >
        <div className="space-y-2">
          <Label htmlFor="payment-amount">Amount</Label>
          <Input
            id="payment-amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="payment-method">Payment Method</Label>
            <Select
              value={paymentForm.payment_method}
              onValueChange={(v) =>
                setPaymentForm((f) => ({
                  ...f,
                  payment_method: v as PaymentMethod,
                  bank_account_id: v === "bank" ? f.bank_account_id : "",
                }))
              }
            >
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-date">Payment Date</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentForm.payment_date}
              onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
            />
          </div>
        </div>
        {paymentForm.payment_method === "bank" && (
          <BankSelect
            id="payment-bank"
            value={paymentForm.bank_account_id}
            onChange={(bank_account_id) => setPaymentForm((f) => ({ ...f, bank_account_id }))}
            required
          />
        )}
        <div className="space-y-2">
          <Label htmlFor="payment-reference">Reference (optional)</Label>
          <Input
            id="payment-reference"
            placeholder="Transfer ref, receipt #"
            value={paymentForm.reference}
            onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="payment-notes">Notes (optional)</Label>
          <Textarea
            id="payment-notes"
            rows={2}
            value={paymentForm.notes}
            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </EntityFormDialog>
    </div>
  );
}
