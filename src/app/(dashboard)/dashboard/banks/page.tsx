"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { useBanks, useBankAccounts } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import type { Bank } from "@/types";

type BankFormState = {
  name: string;
  code: string;
};

const emptyBankForm = (): BankFormState => ({ name: "", code: "" });

export default function BanksPage() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { data: banksData, isLoading, mutate } = useBanks(true);
  const { data: accountsData } = useBankAccounts();

  const canManage = hasPermission("finance", "verify");
  const banks = (banksData ?? []) as Bank[];
  const accounts = accountsData ?? [];

  const accountCountByBank = useMemo(() => {
    const map = new Map<string, number>();
    for (const account of accounts) {
      map.set(account.bank_id, (map.get(account.bank_id) ?? 0) + 1);
    }
    return map;
  }, [accounts]);

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [form, setForm] = useState<BankFormState>(emptyBankForm);

  const filteredBanks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...banks]
      .filter((b) => {
        if (!q) return true;
        return b.name.toLowerCase().includes(q) || (b.code ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [banks, search]);

  const openCreate = () => {
    setEditingBank(null);
    setForm(emptyBankForm());
    setFormOpen(true);
  };

  const openEdit = (bank: Bank) => {
    setEditingBank(bank);
    setForm({ name: bank.name, code: bank.code ?? "" });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage banks");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Bank name is required");
      return;
    }

    const payload = editingBank
      ? { action: "update", id: editingBank.id, name: form.name.trim(), code: form.code || undefined }
      : { name: form.name.trim(), code: form.code || undefined };

    mutate.mutate(payload, {
      onSuccess: () => {
        toast.success(editingBank ? "Bank updated" : "Bank added");
        setFormOpen(false);
        setEditingBank(null);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Bank action failed"),
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
        title="Banks"
        description="Banks and their accounts. Click a row to see how much has been received and paid out per account."
        actions={
          canManage ? (
            <Button onClick={openCreate} className="gap-1.5 shadow-sm">
              <Landmark className="size-4" />
              Add Bank
            </Button>
          ) : undefined
        }
      />

      <Card className="border-border/60 bg-card/50">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Directory</CardTitle>
            <CardDescription>
              Showing {filteredBanks.length} of {banks.length}
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or code"
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <DataTable
            data={filteredBanks}
            getRowKey={(row) => row.id}
            emptyMessage="No banks match the selected filters."
            onRowClick={(row) => router.push(`/dashboard/banks/${row.id}`)}
            columns={[
              {
                id: "name",
                header: "Name",
                cell: (row) => <p className="font-medium">{row.name}</p>,
              },
              {
                id: "code",
                header: "Code",
                cell: (row) => row.code ?? "—",
              },
              {
                id: "accounts",
                header: "Accounts",
                cell: (row) => (
                  <Badge variant="outline" className="text-[10px]">
                    {accountCountByBank.get(row.id) ?? 0}
                  </Badge>
                ),
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
                      <RowActions onEdit={() => openEdit(row)} />
                    </div>
                  ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingBank ? "Edit Bank" : "Add Bank"}
        description={
          editingBank
            ? "Update the bank's name or code."
            : "Add a new bank. Accounts are added from the bank's detail page."
        }
        submitLabel={editingBank ? "Save Changes" : "Add Bank"}
        isSubmitting={mutate.isPending}
        onSubmit={handleSubmit}
      >
        <div className="space-y-2">
          <Label htmlFor="bank-name">Bank Name</Label>
          <Input
            id="bank-name"
            placeholder="e.g. Commercial Bank of Ethiopia"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bank-code">Code (optional)</Label>
          <Input
            id="bank-code"
            placeholder="e.g. CBE"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
          />
        </div>
      </EntityFormDialog>
    </div>
  );
}
