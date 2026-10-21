"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerDetailModule } from "@/components/customers/customer-detail-module";
import { useCustomerDetail, useCustomers } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { formatCurrency } from "@/lib/utils";
import type { PaymentMethod } from "@/types";

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

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canManage = hasPermission("sales", "manage");

  const { data, isLoading, error, refetch } = useCustomerDetail(id);
  const { mutate } = useCustomers();

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<CustomerFormState>(emptyCustomerForm());
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "cash" as PaymentMethod,
    bank_account_id: "",
    payment_date: new Date().toISOString().slice(0, 10),
    reference: "",
    notes: "",
  });
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const openEdit = () => {
    if (!data) return;
    const c = data.customer;
    setForm({
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      tin: c.tin ?? "",
      balance: String(c.balance),
    });
    setEditOpen(true);
  };

  const handleSubmitEdit = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage customers");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    mutate.mutate(
      {
        action: "update",
        id,
        name: form.name.trim(),
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        tin: form.tin || undefined,
        balance: Number(form.balance) || 0,
      },
      {
        onSuccess: () => {
          toast.success("Customer updated");
          setEditOpen(false);
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
      }
    );
  };

  const handleConvertToRegular = () => {
    if (!canManage) return;
    mutate.mutate(
      { action: "convert_to_regular", id },
      {
        onSuccess: () => {
          toast.success("Converted to regular customer");
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Conversion failed"),
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
      toast.error("Select the bank where the payment was received");
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

  const handleDeactivate = () => {
    if (!canManage) return;
    mutate.mutate(
      { action: "delete", id },
      {
        onSuccess: () => {
          toast.success("Customer deactivated");
          setDeactivateOpen(false);
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Deactivation failed"),
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
        <PageHeader title="Customer not found" description="This customer may have been deleted." />
        <Button variant="outline" asChild>
          <Link href="/dashboard/customers">
            <ArrowLeft className="size-4" />
            Back to Customers
          </Link>
        </Button>
      </div>
    );
  }

  const { customer } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        title={customer.name}
        description={`${customer.customer_type === "walking" ? "Walking" : "Regular"} customer${
          customer.email ? ` · ${customer.email}` : ""
        } · Full account view with plain-language explanations`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={customer.is_active ? "active" : "inactive"}
              label={customer.is_active ? "Active" : "Inactive"}
            />
            <Button variant="outline" asChild>
              <Link href="/dashboard/customers">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            {canManage && customer.customer_type === "walking" && (
              <Button variant="outline" onClick={handleConvertToRegular}>
                Convert to Regular
              </Button>
            )}
            {canManage && (
              <Button variant="outline" onClick={openEdit}>
                Edit Profile
              </Button>
            )}
            {canManage && customer.balance > 0 && (
              <Button onClick={() => setPaymentOpen(true)}>Record Payment</Button>
            )}
            {canManage && customer.is_active && (
              <Button variant="destructive" onClick={() => setDeactivateOpen(true)}>
                Deactivate
              </Button>
            )}
          </div>
        }
      />

      <CustomerDetailModule data={data} />

      <EntityFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit Customer"
        description="Update customer contact details. Adjust outstanding balance for manual corrections."
        submitLabel="Save Changes"
        isSubmitting={mutate.isPending}
        onSubmit={handleSubmitEdit}
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
            Auto-increases when credit sales are picked. Edit only for opening balances or corrections.
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

      <EntityFormDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        title="Record Payment"
        description={`Apply a partial or full payment for ${customer.name}. Outstanding: ${formatCurrency(customer.balance)}`}
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

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate Customer"
        description={`Are you sure you want to deactivate ${customer.name}? They will no longer appear as active.`}
        confirmLabel="Deactivate"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}
