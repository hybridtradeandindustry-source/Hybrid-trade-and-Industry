"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useBatchDetail, useProduction, useProductionSettings } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { formatCurrency, formatNumber, formatPolicheLoads } from "@/lib/utils";
import {
  BLOCK_YIELDS,
  CEMENT_KG_PER_BAG,
  calculateMaterialConsumption,
  parseBlockSizeCm,
} from "@/lib/block-factory/yields";
import type { ProductionDailyLog } from "@/types";

type DailyLogForm = {
  unit: "plate" | "piece";
  value: string;
  shortfall_reason: string;
  cement_unit: "kg" | "bag";
  cement_used: string;
};

const EMPTY_LOG_FORM: DailyLogForm = {
  unit: "plate",
  value: "",
  shortfall_reason: "",
  cement_unit: "bag",
  cement_used: "",
};

export default function BatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { hasPermission } = useAuth();
  const canVerify = hasPermission("production", "verify");
  const canCreate = hasPermission("production", "create");

  const { data, isLoading, error, refetch } = useBatchDetail(id);
  const { mutate } = useProduction();
  const { data: productionSettings } = useProductionSettings();
  const cementKgPerBag = productionSettings?.cement_kg_per_bag ?? CEMENT_KG_PER_BAG;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<ProductionDailyLog | null>(null);
  const [editForm, setEditForm] = useState<DailyLogForm>(EMPTY_LOG_FORM);
  const [deleteLog, setDeleteLog] = useState<ProductionDailyLog | null>(null);

  const handleFinishBatch = () => {
    if (!canVerify) {
      toast.error("You don't have permission to finish batches");
      return;
    }
    mutate.mutate(
      { action: "update_batch", id, status: "completed" },
      {
        onSuccess: () => {
          toast.success("Batch marked as completed");
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to finish batch"),
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
        <PageHeader title="Batch not found" description="This batch may have been deleted." />
        <Button variant="outline" asChild>
          <Link href="/dashboard/production">
            <ArrowLeft className="size-4" />
            Back to Production
          </Link>
        </Button>
      </div>
    );
  }

  const { batch, dailyLogs, production, finishedGoods, waste, linkedOrder, sales } = data;
  const canFinish = batch.status !== "completed" && batch.status !== "cancelled";
  const remainingInStock = Math.max(0, finishedGoods - sales.totalSold);

  const blockSize = parseBlockSizeCm(batch.block_size_cm) ?? 20;
  const spec = BLOCK_YIELDS[blockSize];
  const editValueNumber = Number(editForm.value) || 0;
  const editActualPlates =
    editForm.unit === "plate" ? editValueNumber : editValueNumber / (spec.blocksPerPlate || 1);
  const editCalculatedPieces = editActualPlates * spec.blocksPerPlate;
  const editIsShort = editForm.value !== "" && editingLog != null && editCalculatedPieces < editingLog.target_pieces;

  const editCementValue = Number(editForm.cement_used) || 0;
  const editCementBagsUsed =
    editForm.cement_unit === "bag" ? editCementValue : editCementValue / cementKgPerBag;
  const editCementKgUsed =
    editForm.cement_unit === "kg" ? editCementValue : editCementValue * cementKgPerBag;
  const editStandard = calculateMaterialConsumption(blockSize, editCalculatedPieces, BLOCK_YIELDS, cementKgPerBag);
  const editPolicheLoadsUsed = editStandard.policheLoads;

  const openEditLog = (log: ProductionDailyLog) => {
    setEditingLog(log);
    setEditForm({
      unit: "plate",
      value: log.actual_plates != null ? String(log.actual_plates) : "",
      shortfall_reason: log.shortfall_reason ?? "",
      cement_unit: "bag",
      cement_used: log.cement_bags_used != null ? String(log.cement_bags_used) : "",
    });
    setEditDialogOpen(true);
  };

  const submitEditLog = () => {
    if (!canCreate) {
      toast.error("You don't have permission to edit daily logs");
      return;
    }
    if (!editingLog) return;
    if (editForm.value === "" || editValueNumber < 0) {
      toast.error(`Enter a valid ${editForm.unit} count for the day`);
      return;
    }
    if (editIsShort && !editForm.shortfall_reason.trim()) {
      toast.error("A reason is required when the daily count falls short of the target");
      return;
    }
    mutate.mutate(
      {
        action: "create_daily_log",
        batch_id: batch.id,
        factory_id: batch.factory_id,
        log_date: editingLog.log_date,
        actual_plates: editActualPlates,
        shortfall_reason: editForm.shortfall_reason.trim() || undefined,
        cement_bags_used: editCementValue > 0 ? editCementBagsUsed : undefined,
        poliche_loads_used: editCalculatedPieces > 0 ? editPolicheLoadsUsed : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Daily log updated");
          setEditDialogOpen(false);
          setEditingLog(null);
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update daily log"),
      }
    );
  };

  const confirmDeleteLog = () => {
    if (!canVerify || !deleteLog) return;
    mutate.mutate(
      { action: "delete_daily_log", id: deleteLog.id },
      {
        onSuccess: () => {
          toast.success("Daily log deleted — inventory it used has been reverted");
          setDeleteLog(null);
          refetch();
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete daily log"),
      }
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={batch.name ? `${batch.batch_number} — ${batch.name}` : batch.batch_number}
        description={`${batch.block_size_cm ?? "—"}cm block · created ${batch.production_date ?? batch.created_at?.slice(0, 10) ?? "—"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={canFinish ? "in_progress" : "completed"}
              label={canFinish ? "Active" : "Finished"}
            />
            <Button variant="outline" asChild>
              <Link href="/dashboard/production">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            {canFinish && canVerify && (
              <Button onClick={handleFinishBatch} disabled={mutate.isPending}>
                <CheckCircle2 className="size-4" />
                Finish Batch
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Pieces Produced"
          value={formatNumber(production.totalPieces)}
          info="Total pieces produced by this batch, summed from all its daily production logs."
        />
        <MetricCard
          title="Waste Cost"
          value={formatCurrency(production.wasteCost)}
          info="Cost of cement and poliche used beyond the standard formula amount, summed across this batch's daily logs."
        />
        <MetricCard
          title="Days Logged"
          value={production.daysLogged}
          info="Number of days with an actual production count logged for this batch."
        />
        <MetricCard
          title="Days Below Target"
          value={production.daysBelowTarget}
          info="Number of logged days where the actual count came in below that day's target."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Stock Movement</CardTitle>
            <CardDescription>Where this batch&apos;s output has gone</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg border border-border/60 p-4">
              <p className="text-2xl font-bold">{formatNumber(finishedGoods)}</p>
              <p className="text-xs text-muted-foreground">Finished Goods</p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <p className="text-2xl font-bold text-destructive">{formatNumber(waste)}</p>
              <p className="text-xs text-muted-foreground">Waste</p>
            </div>
            <div className="rounded-lg border border-border/60 p-4">
              <p className="text-2xl font-bold">{formatNumber(remainingInStock)}</p>
              <p className="text-xs text-muted-foreground">Remaining in Stock</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Linked Order</CardTitle>
            <CardDescription>
              {linkedOrder ? "This batch was produced for a specific order" : "Not made for a specific order"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkedOrder ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm font-medium">{linkedOrder.order_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedOrder.customerName ?? "Unknown customer"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatCurrency(linkedOrder.total_amount)}</p>
                  <Badge variant="outline" className="capitalize">
                    {linkedOrder.status.replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                General production — stock is pooled and sold across any matching order.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Sales From This Batch</CardTitle>
          <CardDescription>
            {formatNumber(sales.totalSold)} sold across {sales.allocations.length} order line(s) —
            traced FIFO from this batch&apos;s finished-goods stock
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={sales.allocations}
            getRowKey={(row, i) => `${row.orderId}-${i}`}
            emptyMessage="No sales traced to this batch yet."
            columns={[
              { id: "date", header: "Date", cell: (row) => row.createdAt.slice(0, 10) },
              { id: "order", header: "Order", cell: (row) => <span className="font-mono text-xs">{row.orderNumber}</span> },
              { id: "customer", header: "Customer", cell: (row) => row.customerName ?? "—" },
              { id: "quantity", header: "Quantity", cell: (row) => formatNumber(row.quantity) },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Daily Production Log</CardTitle>
          <CardDescription>Day-by-day output and material use for this batch</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={dailyLogs}
            getRowKey={(row) => row.id}
            emptyMessage="No daily logs recorded for this batch yet."
            columns={[
              { id: "date", header: "Date", cell: (row: ProductionDailyLog) => row.log_date },
              {
                id: "target",
                header: "Target (plates)",
                cell: (row: ProductionDailyLog) => formatNumber(row.target_plates),
              },
              {
                id: "actual",
                header: "Actual",
                cell: (row: ProductionDailyLog) =>
                  row.actual_plates != null
                    ? `${formatNumber(row.actual_plates)} plates → ${formatNumber(row.calculated_pieces ?? 0)} pcs`
                    : "Not logged",
              },
              {
                id: "status",
                header: "Status",
                cell: (row: ProductionDailyLog) =>
                  row.calculated_pieces == null ? (
                    <Badge variant="outline">Pending</Badge>
                  ) : row.calculated_pieces < row.target_pieces ? (
                    <Badge variant="outline">Below target</Badge>
                  ) : (
                    <Badge variant="secondary">On target</Badge>
                  ),
              },
              {
                id: "reason",
                header: "Reason",
                cell: (row: ProductionDailyLog) => row.shortfall_reason ?? "—",
              },
              {
                id: "waste",
                header: "Waste Cost",
                cell: (row: ProductionDailyLog) =>
                  row.waste_cost > 0 ? formatCurrency(row.waste_cost) : "—",
              },
              {
                id: "actions",
                header: "",
                cell: (row: ProductionDailyLog) =>
                  canCreate || canVerify ? (
                    <RowActions
                      onEdit={canCreate ? () => openEditLog(row) : undefined}
                      onDelete={canVerify ? () => setDeleteLog(row) : undefined}
                    />
                  ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setEditingLog(null);
        }}
        title="Edit Daily Log"
        description={editingLog ? `${editingLog.log_date} — target ${formatNumber(editingLog.target_plates)} plates` : undefined}
        submitLabel="Save Changes"
        isSubmitting={mutate.isPending}
        onSubmit={submitEditLog}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="edit-log-unit">Unit</Label>
            <Select
              value={editForm.unit}
              onValueChange={(v) => setEditForm((f) => ({ ...f, unit: v as "plate" | "piece" }))}
            >
              <SelectTrigger id="edit-log-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plate">Plate</SelectItem>
                <SelectItem value="piece">Piece</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-log-value">
              Actual Count ({editForm.unit === "plate" ? "plates" : "pieces"})
            </Label>
            <Input
              id="edit-log-value"
              type="number"
              min={0}
              value={editForm.value}
              onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
            />
            {editForm.value !== "" && (
              <p className="text-[10px] text-muted-foreground">
                {editForm.unit === "plate"
                  ? `≈ ${formatNumber(editCalculatedPieces)} pieces`
                  : `≈ ${formatNumber(editActualPlates)} plates`}
              </p>
            )}
          </div>
        </div>

        {editIsShort && (
          <div className="space-y-2">
            <Label htmlFor="edit-shortfall-reason">
              Reason for shortfall <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="edit-shortfall-reason"
              rows={2}
              value={editForm.shortfall_reason}
              onChange={(e) => setEditForm((f) => ({ ...f, shortfall_reason: e.target.value }))}
              placeholder="Why did this day's count fall short of the target?"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-cement-used">Cement Used</Label>
              <Select
                value={editForm.cement_unit}
                onValueChange={(v) => setEditForm((f) => ({ ...f, cement_unit: v as "kg" | "bag" }))}
              >
                <SelectTrigger className="h-7 w-20 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="bag">bag</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              id="edit-cement-used"
              type="number"
              min={0}
              step="0.1"
              value={editForm.cement_used}
              onChange={(e) => setEditForm((f) => ({ ...f, cement_used: e.target.value }))}
            />
            {editForm.cement_used !== "" && (
              <p className="text-[10px] text-muted-foreground">
                {editForm.cement_unit === "kg"
                  ? `≈ ${formatNumber(editCementBagsUsed)} bags (${cementKgPerBag}kg/bag)`
                  : `≈ ${formatNumber(editCementKgUsed)} kg (${cementKgPerBag}kg/bag)`}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-poliche-used">Poliche Used (loads)</Label>
            <div
              id="edit-poliche-used"
              className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
            >
              {formatPolicheLoads(editPolicheLoadsUsed)} load(s)
            </div>
            <p className="text-[10px] text-muted-foreground">
              Auto-calculated from the standard formula — poliche isn&apos;t measured per day.
            </p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Saving re-syncs cement/poliche stock and this batch&apos;s finished-goods total to match
          the new numbers — it won&apos;t let you save a change that would push either below zero
          or below what&apos;s already been sold.
        </p>
      </EntityFormDialog>

      <ConfirmDialog
        open={deleteLog != null}
        onOpenChange={(open) => {
          if (!open) setDeleteLog(null);
        }}
        title="Delete Daily Log"
        description={
          deleteLog
            ? `This removes ${deleteLog.log_date}'s entry, reverts the cement/poliche it consumed back to inventory, and recalculates this batch's finished-goods total.`
            : undefined
        }
        confirmLabel="Delete Log"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={confirmDeleteLog}
      />
    </div>
  );
}
