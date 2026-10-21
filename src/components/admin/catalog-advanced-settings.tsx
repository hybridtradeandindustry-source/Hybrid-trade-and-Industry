"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Hash,
  ListChecks,
  Plus,
  RefreshCw,
  Ruler,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { factoryName } from "@/lib/inventory/catalog-visuals";
import type { UseMutationResult } from "@tanstack/react-query";
import type {
  InventoryCatalogChangeRequest,
  InventoryCustomFieldDef,
  InventorySkuRule,
  InventoryUnitConversion,
  ExtendedInventoryConfig,
} from "@/types/inventory-enterprise";
import type { InventoryItemType } from "@/types";
import { FACTORY_IDS } from "@/types";

type MutateFn = UseMutationResult<unknown, Error, Record<string, unknown>, unknown>["mutate"];

interface CatalogAdvancedSettingsProps {
  config: ExtendedInventoryConfig;
  itemTypes: InventoryItemType[];
  mutate: MutateFn;
  isLoading?: boolean;
  canApprove?: boolean;
  factoryScope?: string | null;
}

export function CatalogAdvancedSettings({
  config,
  itemTypes,
  mutate,
  isLoading,
  canApprove,
  factoryScope,
}: CatalogAdvancedSettingsProps) {
  const skuRules = config.skuRules ?? [];
  const customFieldDefs = config.customFieldDefs ?? [];
  const unitConversions = config.unitConversions ?? [];
  const catalogRequests = config.catalogChangeRequests ?? [];

  const activeTypes = useMemo(() => itemTypes.filter((t) => t.is_active), [itemTypes]);

  const [skuDialog, setSkuDialog] = useState(false);
  const [editingSku, setEditingSku] = useState<InventorySkuRule | null>(null);
  const [skuForm, setSkuForm] = useState({
    factory_id: "all",
    item_type_id: "all",
    prefix: "",
    separator: "-",
    sequence_pad: "3",
    next_sequence: "1",
  });

  const [fieldDialog, setFieldDialog] = useState(false);
  const [editingField, setEditingField] = useState<InventoryCustomFieldDef | null>(null);
  const [fieldForm, setFieldForm] = useState({
    item_type_id: "",
    field_label: "",
    field_key: "",
    field_type: "text" as "text" | "number" | "select" | "date",
    is_required: false,
    options: "",
  });

  const [convDialog, setConvDialog] = useState(false);
  const [convForm, setConvForm] = useState({
    item_type_id: "",
    from_unit: "",
    to_unit: "",
    factor: "",
  });

  const [deleteSku, setDeleteSku] = useState<InventorySkuRule | null>(null);
  const [deleteField, setDeleteField] = useState<InventoryCustomFieldDef | null>(null);
  const [deleteConv, setDeleteConv] = useState<InventoryUnitConversion | null>(null);

  const typeName = (id?: string | null) => activeTypes.find((t) => t.id === id)?.name ?? "Any type";

  const openCreateSku = () => {
    setEditingSku(null);
    setSkuForm({
      factory_id: factoryScope ?? "all",
      item_type_id: activeTypes[0]?.id ?? "all",
      prefix: "",
      separator: "-",
      sequence_pad: "3",
      next_sequence: "1",
    });
    setSkuDialog(true);
  };

  const submitSku = () => {
    if (!skuForm.prefix.trim()) return toast.error("Prefix is required");
    mutate(
      {
        action: editingSku ? "update_sku_rule" : "create_sku_rule",
        ...(editingSku ? { id: editingSku.id } : {}),
        factory_id: skuForm.factory_id === "all" ? null : skuForm.factory_id,
        item_type_id: skuForm.item_type_id === "all" ? null : skuForm.item_type_id,
        prefix: skuForm.prefix.trim(),
        separator: skuForm.separator || "-",
        sequence_pad: Number(skuForm.sequence_pad) || 3,
        next_sequence: Number(skuForm.next_sequence) || 1,
      },
      {
        onSuccess: () => {
          toast.success(editingSku ? "SKU rule updated" : "SKU rule created");
          setSkuDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitField = () => {
    if (!fieldForm.item_type_id || !fieldForm.field_label.trim()) {
      return toast.error("Item type and label are required");
    }
    const options =
      fieldForm.field_type === "select"
        ? fieldForm.options.split(",").map((o) => o.trim()).filter(Boolean)
        : undefined;
    mutate(
      {
        action: editingField ? "update_custom_field" : "create_custom_field",
        ...(editingField ? { id: editingField.id } : {}),
        item_type_id: fieldForm.item_type_id,
        field_key: fieldForm.field_key || fieldForm.field_label,
        field_label: fieldForm.field_label.trim(),
        field_type: fieldForm.field_type,
        is_required: fieldForm.is_required,
        options,
      },
      {
        onSuccess: () => {
          toast.success(editingField ? "Field updated" : "Field created");
          setFieldDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const submitConversion = () => {
    if (!convForm.item_type_id || !convForm.from_unit || !convForm.to_unit || !convForm.factor) {
      return toast.error("All conversion fields are required");
    }
    mutate(
      {
        action: "create_unit_conversion",
        item_type_id: convForm.item_type_id,
        from_unit: convForm.from_unit.trim(),
        to_unit: convForm.to_unit.trim(),
        factor: Number(convForm.factor),
      },
      {
        onSuccess: () => {
          toast.success("Conversion added");
          setConvDialog(false);
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  const reviewRequest = (req: InventoryCatalogChangeRequest, status: "approved" | "rejected") => {
    mutate(
      { action: "review_catalog_change", id: req.id, status },
      {
        onSuccess: () => toast.success(status === "approved" ? "Change approved" : "Change rejected"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
      }
    );
  };

  return (
    <Card className="border-border/60 bg-card/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <div>
            <CardTitle>Advanced Catalog</CardTitle>
            <CardDescription>SKU numbering rules, custom fields, unit conversions, and approval workflow</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sku">
          <TabsList className="mb-4 flex h-auto flex-wrap gap-1">
            <TabsTrigger value="sku" className="gap-1.5"><Hash className="size-3.5" />SKU Rules</TabsTrigger>
            <TabsTrigger value="fields" className="gap-1.5"><ListChecks className="size-3.5" />Custom Fields</TabsTrigger>
            <TabsTrigger value="conversions" className="gap-1.5"><Ruler className="size-3.5" />Conversions</TabsTrigger>
            <TabsTrigger value="approvals" className="gap-1.5"><RefreshCw className="size-3.5" />Approvals</TabsTrigger>
          </TabsList>

          <TabsContent value="sku" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openCreateSku}><Plus className="size-4" />Add Rule</Button>
            </div>
            {skuRules.length === 0 ? (
              <EmptyState title="No SKU rules" description="Define auto-numbering patterns per factory and item type." />
            ) : (
              <DataTable
                data={skuRules}
                getRowKey={(r) => r.id}
                columns={[
                  { id: "prefix", header: "Pattern", cell: (r) => <code className="text-xs">{r.prefix}{r.separator}{String(r.next_sequence).padStart(r.sequence_pad, "0")}</code> },
                  { id: "scope", header: "Scope", cell: (r) => (
                    <span className="text-xs text-muted-foreground">
                      {r.factory_id ? factoryName(r.factory_id) : "All factories"} · {typeName(r.item_type_id)}
                    </span>
                  ) },
                  { id: "next", header: "Next #", cell: (r) => r.next_sequence },
                  {
                    id: "actions",
                    header: "",
                    cell: (r) => (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => {
                          setEditingSku(r);
                          setSkuForm({
                            factory_id: r.factory_id ?? "all",
                            item_type_id: r.item_type_id ?? "all",
                            prefix: r.prefix,
                            separator: r.separator,
                            sequence_pad: String(r.sequence_pad),
                            next_sequence: String(r.next_sequence),
                          });
                          setSkuDialog(true);
                        }}>Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteSku(r)}>×</Button>
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="fields" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => {
                setEditingField(null);
                setFieldForm({
                  item_type_id: activeTypes[0]?.id ?? "",
                  field_label: "",
                  field_key: "",
                  field_type: "text",
                  is_required: false,
                  options: "",
                });
                setFieldDialog(true);
              }}><Plus className="size-4" />Add Field</Button>
            </div>
            {customFieldDefs.length === 0 ? (
              <EmptyState title="No custom fields" description="Extend SKUs with type-specific attributes like block size or moisture %." />
            ) : (
              <DataTable
                data={customFieldDefs}
                getRowKey={(d) => d.id}
                columns={[
                  { id: "label", header: "Label", cell: (d) => d.field_label },
                  { id: "key", header: "Key", cell: (d) => <code className="text-xs">{d.field_key}</code> },
                  { id: "type", header: "Type", cell: (d) => <Badge variant="outline">{d.field_type}</Badge> },
                  { id: "typeScope", header: "Item Type", cell: (d) => typeName(d.item_type_id) },
                  {
                    id: "actions",
                    header: "",
                    cell: (d) => (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteField(d)}>×</Button>
                    ),
                  },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="conversions" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={() => {
                setConvForm({
                  item_type_id: activeTypes[0]?.id ?? "",
                  from_unit: "",
                  to_unit: "",
                  factor: "",
                });
                setConvDialog(true);
              }}><Plus className="size-4" />Add Conversion</Button>
            </div>
            {unitConversions.length === 0 ? (
              <EmptyState title="No conversions" description="Define unit conversions (e.g. ton ↔ kg) per item type." />
            ) : (
              <DataTable
                data={unitConversions}
                getRowKey={(c) => c.id}
                columns={[
                  { id: "type", header: "Item Type", cell: (c) => typeName(c.item_type_id) },
                  { id: "from", header: "From", cell: (c) => c.from_unit },
                  { id: "to", header: "To", cell: (c) => c.to_unit },
                  { id: "factor", header: "Factor", cell: (c) => c.factor },
                  {
                    id: "actions",
                    header: "",
                    cell: (c) => (
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteConv(c)}>×</Button>
                    ),
                  },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="approvals" className="space-y-4">
            {catalogRequests.filter((r) => r.status === "pending").length === 0 ? (
              <EmptyState title="No pending requests" description="Catalog change requests awaiting approval will appear here." />
            ) : (
              catalogRequests
                .filter((r) => r.status === "pending")
                .map((req) => (
                  <div key={req.id} className="rounded-xl border border-border/50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Badge variant="outline" className="mb-2 capitalize">{req.entity_type.replace(/_/g, " ")}</Badge>
                        <p className="text-sm font-medium">
                          {(req.payload as { name?: string }).name ?? JSON.stringify(req.payload)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Requested {new Date(req.created_at).toLocaleString()}
                        </p>
                      </div>
                      {canApprove ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="text-destructive" onClick={() => reviewRequest(req, "rejected")}>
                            <X className="size-4" />Reject
                          </Button>
                          <Button size="sm" onClick={() => reviewRequest(req, "approved")}>
                            <Check className="size-4" />Approve
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      <EntityFormDialog open={skuDialog} onOpenChange={setSkuDialog} title={editingSku ? "Edit SKU Rule" : "Create SKU Rule"} submitLabel={editingSku ? "Save" : "Create"} isSubmitting={isLoading} onSubmit={submitSku}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Factory</Label>
            <Select value={skuForm.factory_id} onValueChange={(v) => setSkuForm((f) => ({ ...f, factory_id: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Factories</SelectItem>
                <SelectItem value={FACTORY_IDS.block}>Block Factory</SelectItem>
                <SelectItem value={FACTORY_IDS.recycling}>Plastic Recycling</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Item Type</Label>
            <Select value={skuForm.item_type_id} onValueChange={(v) => setSkuForm((f) => ({ ...f, item_type_id: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Type</SelectItem>
                {activeTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Prefix</Label><Input value={skuForm.prefix} onChange={(e) => setSkuForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))} placeholder="BLK" className="font-mono" /></div>
          <div className="space-y-2"><Label>Separator</Label><Input value={skuForm.separator} onChange={(e) => setSkuForm((f) => ({ ...f, separator: e.target.value }))} placeholder="-" className="font-mono" /></div>
          <div className="space-y-2"><Label>Sequence Pad</Label><Input type="number" value={skuForm.sequence_pad} onChange={(e) => setSkuForm((f) => ({ ...f, sequence_pad: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Next Sequence</Label><Input type="number" value={skuForm.next_sequence} onChange={(e) => setSkuForm((f) => ({ ...f, next_sequence: e.target.value }))} /></div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog open={fieldDialog} onOpenChange={setFieldDialog} title={editingField ? "Edit Custom Field" : "Add Custom Field"} submitLabel={editingField ? "Save" : "Create"} isSubmitting={isLoading} onSubmit={submitField}>
        <div className="space-y-2">
          <Label>Item Type</Label>
          <Select value={fieldForm.item_type_id} onValueChange={(v) => setFieldForm((f) => ({ ...f, item_type_id: v }))}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>{activeTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Label</Label><Input value={fieldForm.field_label} onChange={(e) => setFieldForm((f) => ({ ...f, field_label: e.target.value }))} placeholder="Block Size" /></div>
          <div className="space-y-2"><Label>Field Key</Label><Input value={fieldForm.field_key} onChange={(e) => setFieldForm((f) => ({ ...f, field_key: e.target.value }))} placeholder="block_size" className="font-mono" /></div>
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={fieldForm.field_type} onValueChange={(v) => setFieldForm((f) => ({ ...f, field_type: v as typeof fieldForm.field_type }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="select">Select</SelectItem>
              <SelectItem value="date">Date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {fieldForm.field_type === "select" ? (
          <div className="space-y-2"><Label>Options (comma-separated)</Label><Input value={fieldForm.options} onChange={(e) => setFieldForm((f) => ({ ...f, options: e.target.value }))} placeholder="4, 6, 8, 10" /></div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={fieldForm.is_required} onChange={(e) => setFieldForm((f) => ({ ...f, is_required: e.target.checked }))} />
          Required on new SKUs
        </label>
      </EntityFormDialog>

      <EntityFormDialog open={convDialog} onOpenChange={setConvDialog} title="Add Unit Conversion" submitLabel="Create" isSubmitting={isLoading} onSubmit={submitConversion}>
        <div className="space-y-2">
          <Label>Item Type</Label>
          <Select value={convForm.item_type_id} onValueChange={(v) => setConvForm((f) => ({ ...f, item_type_id: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{activeTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2"><Label>From</Label><Input value={convForm.from_unit} onChange={(e) => setConvForm((f) => ({ ...f, from_unit: e.target.value }))} placeholder="ton" /></div>
          <div className="space-y-2"><Label>To</Label><Input value={convForm.to_unit} onChange={(e) => setConvForm((f) => ({ ...f, to_unit: e.target.value }))} placeholder="kg" /></div>
          <div className="space-y-2"><Label>Factor</Label><Input type="number" step="any" value={convForm.factor} onChange={(e) => setConvForm((f) => ({ ...f, factor: e.target.value }))} placeholder="1000" /></div>
        </div>
      </EntityFormDialog>

      <ConfirmDialog open={!!deleteSku} onOpenChange={(o) => !o && setDeleteSku(null)} title="Deactivate SKU rule" description="Existing SKUs are unaffected." confirmLabel="Deactivate" variant="destructive" loading={isLoading} onConfirm={() => {
        if (!deleteSku) return;
        mutate({ action: "delete_sku_rule", id: deleteSku.id }, { onSuccess: () => { toast.success("Rule deactivated"); setDeleteSku(null); } });
      }} />
      <ConfirmDialog open={!!deleteField} onOpenChange={(o) => !o && setDeleteField(null)} title="Deactivate field" description="Existing SKU values are preserved." confirmLabel="Deactivate" variant="destructive" loading={isLoading} onConfirm={() => {
        if (!deleteField) return;
        mutate({ action: "delete_custom_field", id: deleteField.id }, { onSuccess: () => { toast.success("Field deactivated"); setDeleteField(null); } });
      }} />
      <ConfirmDialog open={!!deleteConv} onOpenChange={(o) => !o && setDeleteConv(null)} title="Remove conversion" description="This conversion will be deleted." confirmLabel="Remove" variant="destructive" loading={isLoading} onConfirm={() => {
        if (!deleteConv) return;
        mutate({ action: "delete_unit_conversion", id: deleteConv.id }, { onSuccess: () => { toast.success("Conversion removed"); setDeleteConv(null); } });
      }} />
    </Card>
  );
}
