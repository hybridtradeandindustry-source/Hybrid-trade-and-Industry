"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Factory,
  Layers,
  MapPin,
  Package,
  QrCode,
  ShoppingCart,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useInventory } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import type { InventoryEnterpriseData } from "@/types/inventory-enterprise";
import { FACTORY_IDS } from "@/types";

export function InventoryEnterprisePanel() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const { data, mutate } = useInventory();
  const canManage = hasPermission("inventory", "manage");

  const enterprise = (data?.enterprise ?? {
    locations: [],
    lots: [],
    boms: [],
    quarantineHolds: [],
    cycleCountSchedules: [],
    requisitions: [],
    sageMappings: [],
    intelligence: { abcAnalysis: [], daysOfSupply: [], deadStock: [], smartReorder: [] },
  }) as InventoryEnterpriseData;

  const factoryId =
    viewScope === "block" ? FACTORY_IDS.block : viewScope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  const post = (action: string, payload: Record<string, unknown> = {}, success = "Done") => {
    mutate.mutate({ action, ...payload }, {
      onSuccess: () => toast.success(success),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
    });
  };

  return (
    <Tabs defaultValue="intelligence" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap gap-1 bg-muted/50 p-1">
        <TabsTrigger value="intelligence" className="gap-1.5"><BarChart3 className="size-3.5" />Intelligence</TabsTrigger>
        <TabsTrigger value="bom" className="gap-1.5"><Layers className="size-3.5" />BOM</TabsTrigger>
        <TabsTrigger value="locations" className="gap-1.5"><MapPin className="size-3.5" />Locations</TabsTrigger>
        <TabsTrigger value="lots" className="gap-1.5"><Boxes className="size-3.5" />Lots</TabsTrigger>
        <TabsTrigger value="quarantine" className="gap-1.5"><Shield className="size-3.5" />Quarantine</TabsTrigger>
        <TabsTrigger value="counts" className="gap-1.5"><ClipboardList className="size-3.5" />Count Schedules</TabsTrigger>
        <TabsTrigger value="requisitions" className="gap-1.5"><ShoppingCart className="size-3.5" />Requisitions</TabsTrigger>
        <TabsTrigger value="sage" className="gap-1.5"><Factory className="size-3.5" />Sage Sync</TabsTrigger>
      </TabsList>

      <TabsContent value="intelligence" className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <Button size="sm" onClick={() => post("create_requisition", { factory_id: factoryId }, "Requisition draft created")}>
              Generate PR from Reorder Alerts
            </Button>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="border-border/60 bg-card/50">
            <CardHeader><CardTitle className="text-base">ABC Analysis</CardTitle><CardDescription>Value-based classification</CardDescription></CardHeader>
            <CardContent>
              <DataTable data={enterprise.intelligence.abcAnalysis.slice(0, 8)} getRowKey={(r) => r.item_id} columns={[
                { id: "sku", header: "SKU", cell: (r) => <code className="text-xs">{r.sku}</code> },
                { id: "cls", header: "Class", cell: (r) => <Badge variant={r.abc_class === "A" ? "default" : "outline"}>{r.abc_class}</Badge> },
                { id: "val", header: "Value", cell: (r) => formatCurrency(r.annual_value) },
                { id: "pct", header: "%", cell: (r) => `${r.pct_of_total.toFixed(1)}%` },
              ]} />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/50">
            <CardHeader><CardTitle className="text-base">Days of Supply</CardTitle></CardHeader>
            <CardContent>
              <DataTable data={enterprise.intelligence.daysOfSupply.slice(0, 8)} getRowKey={(r) => r.item_id} columns={[
                { id: "name", header: "Item", cell: (r) => r.name },
                { id: "dos", header: "Days", cell: (r) => <span className={cn(r.days_of_supply < 14 && "text-warning font-medium")}>{r.days_of_supply}d</span> },
                { id: "usage", header: "Avg/day", cell: (r) => formatNumber(r.avg_daily_usage) },
              ]} />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/50">
            <CardHeader><CardTitle className="text-base">Dead Stock</CardTitle><CardDescription>No movement 90+ days</CardDescription></CardHeader>
            <CardContent>
              <DataTable data={enterprise.intelligence.deadStock} getRowKey={(r) => r.item_id} emptyMessage="No dead stock detected" columns={[
                { id: "name", header: "Item", cell: (r) => r.name },
                { id: "days", header: "Idle", cell: (r) => `${r.days_since_last_movement}d` },
                { id: "val", header: "Value", cell: (r) => formatCurrency(r.value) },
              ]} />
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/50">
            <CardHeader><CardTitle className="text-base">Smart Reorder</CardTitle></CardHeader>
            <CardContent>
              <DataTable data={enterprise.intelligence.smartReorder} getRowKey={(r) => r.item_id} columns={[
                { id: "name", header: "Item", cell: (r) => r.name },
                { id: "qty", header: "Suggest", cell: (r) => formatNumber(r.suggested_qty) },
                { id: "reason", header: "Reason", cell: (r) => <span className="text-xs text-warning">{r.reason}</span> },
              ]} />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="bom">
        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle>Bill of Materials</CardTitle><CardDescription>Production recipes linking components to finished goods</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {enterprise.boms.map((bom) => (
              <div key={bom.id} className="rounded-xl border border-border/50 bg-muted/10 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{bom.name}</p>
                    <p className="text-xs text-muted-foreground">v{bom.version} · Yields {bom.yield_quantity} units · {bom.finished_item?.name ?? bom.finished_item_id}</p>
                  </div>
                  <Badge variant="outline">Active</Badge>
                </div>
                <ul className="mt-3 space-y-1 border-t border-border/40 pt-3 text-sm">
                  {(bom.lines ?? []).map((line) => (
                    <li key={line.id} className="flex justify-between text-muted-foreground">
                      <span>{line.component_item?.name ?? line.component_item_id}</span>
                      <span>{formatNumber(line.quantity_required)} {line.unit} (+{(line.scrap_factor * 100).toFixed(0)}% scrap)</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="locations">
        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle>Warehouse Locations</CardTitle><CardDescription>Warehouses, zones, bins, and yards</CardDescription></CardHeader>
          <CardContent>
            <DataTable data={enterprise.locations} getRowKey={(r) => r.id} columns={[
              { id: "code", header: "Code", cell: (r) => <code className="font-mono text-xs">{r.code}</code> },
              { id: "name", header: "Name", cell: (r) => r.name },
              { id: "type", header: "Type", cell: (r) => <Badge variant="outline">{r.location_type}</Badge> },
            ]} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="lots">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex-row items-center justify-between">
            <div><CardTitle>Lot / Batch Tracking</CardTitle><CardDescription>Traceability with expiry dates</CardDescription></div>
            {canManage && <Button size="sm" variant="outline" onClick={() => post("assign_barcode", { item_id: "inv-1" }, "Barcode assigned")}><QrCode className="size-4" />Sample Barcode</Button>}
          </CardHeader>
          <CardContent>
            <DataTable data={enterprise.lots} getRowKey={(r) => r.id} columns={[
              { id: "lot", header: "Lot #", cell: (r) => <code className="text-xs">{r.lot_number}</code> },
              { id: "item", header: "Item", cell: (r) => r.item?.name ?? r.item_id },
              { id: "qty", header: "Qty", cell: (r) => formatNumber(r.quantity) },
              { id: "exp", header: "Expires", cell: (r) => r.expires_at ?? "—" },
              { id: "st", header: "Status", cell: (r) => <Badge variant={r.stock_status === "quarantine" ? "destructive" : "outline"}>{r.stock_status}</Badge> },
            ]} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="quarantine">
        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle>Quarantine &amp; Holds</CardTitle></CardHeader>
          <CardContent>
            <DataTable data={enterprise.quarantineHolds} getRowKey={(r) => r.id} emptyMessage="No active holds" columns={[
              { id: "item", header: "Item", cell: (r) => r.item?.name ?? r.item_id },
              { id: "qty", header: "Qty", cell: (r) => formatNumber(r.quantity) },
              { id: "reason", header: "Reason", cell: (r) => <span className="text-xs">{r.reason}</span> },
              { id: "act", header: "", cell: (r) => canManage ? (
                <Button size="sm" variant="outline" onClick={() => post("release_quarantine", { id: r.id }, "Released")}>Release</Button>
              ) : null },
            ]} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="counts">
        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle>Cycle Count Schedules</CardTitle><CardDescription>Recurring blind counts by type/category</CardDescription></CardHeader>
          <CardContent>
            <DataTable data={enterprise.cycleCountSchedules} getRowKey={(r) => r.id} columns={[
              { id: "name", header: "Schedule", cell: (r) => r.name },
              { id: "freq", header: "Frequency", cell: (r) => <Badge variant="outline">{r.frequency}</Badge> },
              { id: "next", header: "Next Run", cell: (r) => r.next_run_date },
              { id: "blind", header: "Blind", cell: (r) => (r.is_blind ? "Yes" : "No") },
            ]} />
            <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="size-3.5" />
              Variance rules: auto-approve when within 2% or 5 units
            </p>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="requisitions">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Purchase Requisitions</CardTitle>
            {canManage && (
              <Button size="sm" onClick={() => post("create_requisition", { factory_id: factoryId }, "PR created")}>
                <Package className="size-4" />Auto-generate PR
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {enterprise.requisitions.map((req) => (
              <div key={req.id} className="rounded-xl border border-border/50 p-4">
                <div className="flex items-center justify-between">
                  <code className="text-sm font-semibold">{req.requisition_number}</code>
                  <Badge>{req.status.replace(/_/g, " ")}</Badge>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {(req.lines ?? []).map((l) => (
                    <li key={l.id}>{l.item?.name ?? l.item_id} — {formatNumber(l.quantity)} {l.unit} @ {formatCurrency(l.estimated_unit_cost ?? 0)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="sage">
        <Card className="border-border/60 bg-card/50">
          <CardHeader><CardTitle>Sage 50 Item Mappings</CardTitle></CardHeader>
          <CardContent>
            <DataTable data={enterprise.sageMappings} getRowKey={(r) => r.id} columns={[
              { id: "item", header: "Item ID", cell: (r) => r.item_id },
              { id: "sage", header: "Sage Code", cell: (r) => <code>{r.sage_item_code}</code> },
              { id: "wh", header: "Warehouse", cell: (r) => r.sage_warehouse_code ?? "—" },
              { id: "sync", header: "Last Sync", cell: (r) => r.last_synced_at ? new Date(r.last_synced_at).toLocaleDateString() : "Never" },
              { id: "act", header: "", cell: (r) => canManage ? (
                <Button size="sm" variant="outline" onClick={() => post("sync_sage_item", { item_id: r.item_id }, "Synced")}>Sync</Button>
              ) : null },
            ]} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
