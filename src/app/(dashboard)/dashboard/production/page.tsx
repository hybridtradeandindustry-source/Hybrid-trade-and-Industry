"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, Plus, Recycle, Target, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { toast } from "sonner";
import { ProductionFiltersBar } from "@/components/production/production-filters-bar";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useProduction,
  useProductionSettings,
  useProductionIntelligence,
  useDailyLogs,
  useInventory,
  downloadBase64File,
} from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { FACTORY_OPTIONS } from "@/constants";
import { ProductionCapacityPanel } from "@/components/ai/production-capacity-panel";
import {
  calculateDamageRate,
  calculateYieldRate,
  formatCurrency,
  formatNumber,
  formatPolicheLoads,
  formatPercent,
} from "@/lib/utils";
import {
  DEFAULT_PRODUCTION_FILTERS,
  filterProductionBatches,
  filterProductionCounts,
  getBatchDate,
  isDateInRange,
  isRecyclingCount,
  periodLabel,
  todayIsoDate,
} from "@/lib/production/filters";
import {
  computeBatchTrailStats,
  computeProductionStats,
} from "@/lib/production/stats";
import {
  CHECKPOINT_LABELS,
  FACTORY_IDS,
  type BlockCheckpoint,
  type ProductionBatch,
  type ProductionCount,
  type ViewScope,
} from "@/types";
import {
  BLOCK_SIZE_OPTIONS,
  CEMENT_KG_PER_BAG,
  DEFAULT_BATCH_PLANNED_QTY,
  calculateMaterialConsumption,
  finishedGoodsSku,
  parseBlockSizeCm,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import { predictBatchProduction } from "@/lib/block-factory/predictions";
import { useBlockYieldSettings } from "@/providers/block-yield-settings-provider";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

function batchStatusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "completed") return "secondary";
  if (status === "cancelled") return "outline";
  return "default";
}

function resolveDefaultFactoryId(viewScope: ViewScope): string {
  if (viewScope === "block") return FACTORY_IDS.block;
  if (viewScope === "recycling") return FACTORY_IDS.recycling;
  return FACTORY_IDS.block;
}

function isRecyclingCountRow(row: ProductionCount) {
  return isRecyclingCount(row);
}

function batchLabel(batch: Pick<ProductionBatch, "batch_number" | "name">) {
  return batch.name ? `${batch.batch_number} — ${batch.name}` : batch.batch_number;
}

type CountFormState = {
  factory_id: string;
  batch_id: string;
  checkpoint: BlockCheckpoint;
  good_count: string;
  damaged_count: string;
  material_received: string;
  processed_output: string;
  waste_rejected: string;
};

const emptyCountForm = (factoryId: string): CountFormState => ({
  factory_id: factoryId,
  batch_id: "",
  checkpoint: "after_curing",
  good_count: "",
  damaged_count: "",
  material_received: "",
  processed_output: "",
  waste_rejected: "",
});

const BATCH_PAGE_SIZE = 5;

export default function ProductionPage() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const defaultFactoryId = resolveDefaultFactoryId(viewScope);
  const { yields } = useBlockYieldSettings();
  const router = useRouter();

  const { data, isLoading, mutate, exportReportMutation } = useProduction();
  // Live, daily-log-based waste/yield intelligence for Block Factory — used to suggest an
  // accurate expected waste rate when creating a batch, instead of the stale legacy
  // checkpoint-based estimate.
  const { data: productionIntelligence } = useProductionIntelligence(true);

  const [filters, setFilters] = useState(DEFAULT_PRODUCTION_FILTERS);
  const [batchSearch, setBatchSearch] = useState("");
  const [batchPage, setBatchPage] = useState(1);

  const [countDialogOpen, setCountDialogOpen] = useState(false);
  const [editingCount, setEditingCount] = useState<ProductionCount | null>(null);
  const [deleteBatch, setDeleteBatch] = useState<ProductionBatch | null>(null);
  const [deleteCount, setDeleteCount] = useState<ProductionCount | null>(null);
  const [countForm, setCountForm] = useState<CountFormState>(emptyCountForm(defaultFactoryId));
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchForm, setBatchForm] = useState({
    block_size_cm: 20 as BlockSizeCm,
    expected_waste_rate: "3",
    name: "",
  });
  const [dailyLogDialogOpen, setDailyLogDialogOpen] = useState(false);
  const [dailyLogForm, setDailyLogForm] = useState({
    log_date: todayIsoDate(),
    batch_id: "",
    unit: "plate" as "plate" | "piece",
    value: "",
    shortfall_reason: "",
    cement_unit: "kg" as "kg" | "bag",
    cement_used: "",
    poliche_loads_used: "",
  });
  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [targetForm, setTargetForm] = useState({
    log_date: todayIsoDate(),
    batch_id: "",
    unit: "plate" as "plate" | "piece",
    block_size_cm: 20 as BlockSizeCm,
    value: "",
  });

  const isRecyclingScope = viewScope === "recycling";
  const isBlockScope = viewScope === "block";
  const isCombinedScope = viewScope === "combined";
  const showBatchSection = !isRecyclingScope;

  const isRecyclingForm =
    isRecyclingScope ||
    (isCombinedScope && countForm.factory_id === FACTORY_IDS.recycling);

  const batches = (data?.batches ?? []) as ProductionBatch[];
  const counts = (data?.counts ?? []) as ProductionCount[];
  const monthlyLogSummary = (data?.monthlyLogSummary ?? null) as {
    outputPieces: number;
    wasteCost: number;
    daysLogged: number;
  } | null;
  const orgDailyLogs = (data?.dailyLogs ?? []) as { log_date: string; calculated_pieces: number | null }[];
  const periodLogOutput = useMemo(
    () =>
      orgDailyLogs.reduce((sum, log) => {
        if (!isDateInRange(log.log_date, filters.dateFrom, filters.dateTo)) return sum;
        return sum + Number(log.calculated_pieces ?? 0);
      }, 0),
    [orgDailyLogs, filters.dateFrom, filters.dateTo]
  );
  const batchProduction = (data?.batchProduction ?? {}) as Record<
    string,
    { produced: number; sold: number }
  >;

  const canCreate = hasPermission("production", "create");
  const canVerify = hasPermission("production", "verify");

  const scopeLabel =
    FACTORY_OPTIONS.find((o) => o.value === viewScope)?.label ?? "Overall Company";

  const blockBatches = useMemo(
    () => batches.filter((b) => b.factory_id === FACTORY_IDS.block),
    [batches]
  );
  const activeBlockBatches = useMemo(
    () => blockBatches.filter((b) => b.status !== "completed" && b.status !== "cancelled"),
    [blockBatches]
  );
  const filteredBlockBatches = useMemo(
    () => filterProductionBatches(blockBatches, filters, { alwaysIncludeActive: true }),
    [blockBatches, filters]
  );
  const searchedBlockBatches = useMemo(() => {
    const q = batchSearch.trim().toLowerCase();
    if (!q) return filteredBlockBatches;
    return filteredBlockBatches.filter(
      (b) =>
        b.batch_number.toLowerCase().includes(q) ||
        (b.name ?? "").toLowerCase().includes(q)
    );
  }, [filteredBlockBatches, batchSearch]);
  const batchPageCount = Math.max(1, Math.ceil(searchedBlockBatches.length / BATCH_PAGE_SIZE));
  const effectiveBatchPage = Math.min(batchPage, batchPageCount);
  const paginatedBlockBatches = useMemo(
    () =>
      searchedBlockBatches.slice(
        (effectiveBatchPage - 1) * BATCH_PAGE_SIZE,
        effectiveBatchPage * BATCH_PAGE_SIZE
      ),
    [searchedBlockBatches, effectiveBatchPage]
  );
  const filteredCounts = useMemo(
    () => filterProductionCounts(counts, filters),
    [counts, filters]
  );

  const displayStats = useMemo(
    () =>
      computeProductionStats(counts, viewScope, {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        batches: blockBatches,
      }),
    [counts, viewScope, filters.dateFrom, filters.dateTo, blockBatches]
  );

  const latestBatch = filteredBlockBatches[0] ?? blockBatches[0];
  const batchCounts = counts.filter((c) => c.batch_id === latestBatch?.id);

  const pageDescription = isRecyclingScope
    ? "Plastic recycling — log material intake, processed output, and waste rejected."
    : isBlockScope
      ? "Block factory — set a daily target and log daily production by plate or piece."
      : "Production across Block Factory and Plastic Recycling — switch scope in the top bar to focus a factory.";

  const trailStats = useMemo(() => computeBatchTrailStats(batchCounts), [batchCounts]);

  const yieldStats = useMemo(() => {
    if (isRecyclingScope) {
      const scoped = filteredCounts.filter(isRecyclingCountRow);
      const material = scoped.reduce((s, c) => s + (c.material_received ?? 0), 0);
      const output = scoped.reduce((s, c) => s + (c.processed_output ?? 0), 0);
      const waste = scoped.reduce((s, c) => s + (c.waste_rejected ?? 0), 0);
      return {
        yield: calculateYieldRate(output, material),
        damage: calculateDamageRate(waste, material),
        total: output,
        output,
      };
    }

    return {
      yield: trailStats.yield,
      damage: trailStats.damage,
      total: trailStats.total,
      output: trailStats.output,
      dryingYield: trailStats.dryingYield,
      dryingDamage: trailStats.dryingDamage,
      curingYield: trailStats.curingYield,
      curingDamage: trailStats.curingDamage,
    };
  }, [filteredCounts, isRecyclingScope, trailStats]);

  const { data: productionSettings } = useProductionSettings();
  const cementKgPerBag = productionSettings?.cement_kg_per_bag ?? CEMENT_KG_PER_BAG;

  // A batch can only be run for a size that has a finished goods item to post output into —
  // without one, the daily log has nowhere to put the blocks and the size can never be sold.
  const { data: productionInventory } = useInventory();
  const availableBlockSizes = useMemo(() => {
    const blockSkus = new Set(
      ((productionInventory?.items ?? []) as Array<{ sku: string; factory_id: string }>)
        .filter((item) => item.factory_id === FACTORY_IDS.block)
        .map((item) => item.sku)
    );
    return BLOCK_SIZE_OPTIONS.filter((opt) => blockSkus.has(finishedGoodsSku(opt.value)));
  }, [productionInventory?.items]);

  const batchPrediction = useMemo(
    () =>
      predictBatchProduction({
        plannedQuantity: DEFAULT_BATCH_PLANNED_QTY,
        blockSizeCm: batchForm.block_size_cm,
        batches,
        counts,
        intelligence: productionIntelligence,
        yieldsMap: yields,
        cementKgPerBag,
      }),
    [batchForm.block_size_cm, batches, counts, productionIntelligence, yields, cementKgPerBag]
  );

  const handleNewBatch = () => {
    if (!canCreate) {
      toast.error("You don't have permission to create batches");
      return;
    }
    const pred = predictBatchProduction({
      plannedQuantity: DEFAULT_BATCH_PLANNED_QTY,
      blockSizeCm: 20,
      batches,
      counts,
      intelligence: productionIntelligence,
      yieldsMap: yields,
      cementKgPerBag,
    });
    setBatchForm({
      block_size_cm: availableBlockSizes.some((opt) => Number(opt.value) === 20)
        ? 20
        : (Number(availableBlockSizes[0]?.value ?? 20) as BlockSizeCm),
      expected_waste_rate: String(Math.round(pred.historicalWasteRate * 100 * 10) / 10),
      name: "",
    });
    setBatchDialogOpen(true);
  };

  const submitBatch = () => {
    const wasteRatePercent = Number(batchForm.expected_waste_rate);
    if (isNaN(wasteRatePercent) || wasteRatePercent < 0 || wasteRatePercent > 100) {
      toast.error("Enter a valid expected waste percentage between 0 and 100");
      return;
    }
    mutate.mutate(
      {
        action: "create_batch",
        factory_id: FACTORY_IDS.block,
        block_size_cm: batchForm.block_size_cm,
        expected_waste_rate: wasteRatePercent / 100,
        name: batchForm.name.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Production batch created");
          setBatchDialogOpen(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to create batch"),
      }
    );
  };

  const defaultDailyTarget = productionSettings?.default_daily_target_plates ?? 650;
  const { data: dailyLogsData, createMutation: createDailyLogMutation } = useDailyLogs(
    dailyLogForm.batch_id || null
  );
  const dailyLogs = dailyLogsData?.logs ?? [];

  const dailyLogSelectedBatch = blockBatches.find((b) => b.id === dailyLogForm.batch_id) ?? null;
  const dailyLogBlockSize = parseBlockSizeCm(dailyLogSelectedBatch?.block_size_cm) ?? 20;
  const dailyLogSpec = yields[dailyLogBlockSize];
  const dailyLogValueNumber = Number(dailyLogForm.value) || 0;
  const dailyLogActualPlates =
    dailyLogForm.unit === "plate"
      ? dailyLogValueNumber
      : dailyLogValueNumber / (dailyLogSpec.blocksPerPlate || 1);
  const dailyLogCalculatedPieces = dailyLogActualPlates * dailyLogSpec.blocksPerPlate;

  const existingLogForDate = dailyLogs.find((l) => l.log_date === dailyLogForm.log_date) ?? null;
  const dailyLogTargetPlates = existingLogForDate?.target_plates ?? defaultDailyTarget;
  const dailyLogTargetPieces = dailyLogTargetPlates * dailyLogSpec.blocksPerPlate;
  const dailyLogIsShort =
    dailyLogForm.value !== "" && dailyLogCalculatedPieces < dailyLogTargetPieces;

  const dailyLogCementValue = Number(dailyLogForm.cement_used) || 0;
  const dailyLogCementBagsUsed =
    dailyLogForm.cement_unit === "bag" ? dailyLogCementValue : dailyLogCementValue / cementKgPerBag;
  const dailyLogCementKgUsed =
    dailyLogForm.cement_unit === "kg" ? dailyLogCementValue : dailyLogCementValue * cementKgPerBag;
  const dailyLogStandard = calculateMaterialConsumption(
    dailyLogBlockSize,
    dailyLogCalculatedPieces,
    yields,
    cementKgPerBag
  );
  const dailyLogCementWasteBags = Math.max(0, dailyLogCementBagsUsed - dailyLogStandard.cementBags);
  // Staff can't reliably measure poliche used per day, so it's always filled in from the
  // standard formula for the entered count instead of asking for a manual number.
  const dailyLogPolicheLoadsUsed = dailyLogStandard.policheLoads;

  const openDailyLog = (batchId?: string) => {
    const firstActiveBatch = activeBlockBatches[0];
    setDailyLogForm({
      log_date: todayIsoDate(),
      batch_id: batchId ?? firstActiveBatch?.id ?? "",
      unit: "plate",
      value: "",
      shortfall_reason: "",
      cement_unit: "kg",
      cement_used: "",
      poliche_loads_used: "",
    });
    setDailyLogDialogOpen(true);
  };

  const submitDailyLog = () => {
    if (!canCreate) {
      toast.error("You don't have permission to log daily production");
      return;
    }
    const batch = dailyLogSelectedBatch;
    if (!batch) {
      toast.error("Select a batch");
      return;
    }
    if (dailyLogForm.value === "" || dailyLogValueNumber < 0) {
      toast.error(`Enter a valid ${dailyLogForm.unit} count for the day`);
      return;
    }
    if (dailyLogIsShort && !dailyLogForm.shortfall_reason.trim()) {
      toast.error("A reason is required when the daily count falls short of the target");
      return;
    }
    createDailyLogMutation.mutate(
      {
        batch_id: batch.id,
        factory_id: batch.factory_id,
        log_date: dailyLogForm.log_date,
        actual_plates: dailyLogActualPlates,
        shortfall_reason: dailyLogForm.shortfall_reason.trim() || undefined,
        cement_bags_used: dailyLogCementValue > 0 ? dailyLogCementBagsUsed : undefined,
        poliche_loads_used: dailyLogCalculatedPieces > 0 ? dailyLogPolicheLoadsUsed : undefined,
      },
      {
        onSuccess: () => {
          toast.success("Daily log saved");
          setDailyLogForm((f) => ({
            ...f,
            value: "",
            shortfall_reason: "",
            cement_used: "",
            poliche_loads_used: "",
          }));
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save daily log"),
      }
    );
  };

  const { createMutation: createTargetLogMutation } = useDailyLogs(targetForm.batch_id || null);

  const targetSpec = yields[targetForm.block_size_cm];
  const targetValueNumber = Number(targetForm.value) || 0;
  const targetPlatesResolved =
    targetForm.unit === "plate" ? targetValueNumber : targetValueNumber / (targetSpec.blocksPerPlate || 1);
  const targetPiecesResolved = targetPlatesResolved * targetSpec.blocksPerPlate;

  const openTargetDialog = () => {
    const firstActiveBatch = activeBlockBatches[0];
    setTargetForm({
      log_date: todayIsoDate(),
      batch_id: firstActiveBatch?.id ?? "",
      unit: "plate",
      block_size_cm: parseBlockSizeCm(firstActiveBatch?.block_size_cm) ?? 20,
      value: "",
    });
    setTargetDialogOpen(true);
  };

  const handleTargetBatchChange = (batchId: string) => {
    const batch = blockBatches.find((b) => b.id === batchId);
    setTargetForm((f) => ({
      ...f,
      batch_id: batchId,
      block_size_cm: parseBlockSizeCm(batch?.block_size_cm) ?? f.block_size_cm,
    }));
  };

  const submitTarget = () => {
    if (!canCreate) {
      toast.error("You don't have permission to set a daily target");
      return;
    }
    const batch = blockBatches.find((b) => b.id === targetForm.batch_id);
    if (!batch) {
      toast.error("Select a batch");
      return;
    }
    if (!targetValueNumber || targetValueNumber <= 0) {
      toast.error("Enter a valid target greater than 0");
      return;
    }
    createTargetLogMutation.mutate(
      {
        batch_id: batch.id,
        factory_id: batch.factory_id,
        log_date: targetForm.log_date,
        target_plates: targetPlatesResolved,
      },
      {
        onSuccess: () => {
          toast.success("Daily target set");
          setTargetDialogOpen(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to set target"),
      }
    );
  };

  const openCreateCount = () => {
    setEditingCount(null);
    setCountForm(emptyCountForm(FACTORY_IDS.recycling));
    setCountDialogOpen(true);
  };

  const openEditCount = (item: ProductionCount) => {
    setEditingCount(item);
    setCountForm({
      factory_id: item.factory_id,
      batch_id: item.batch_id ?? "",
      checkpoint: (item.checkpoint ?? "batch_count") as BlockCheckpoint,
      good_count: item.good_count != null ? String(item.good_count) : "",
      damaged_count: item.damaged_count != null ? String(item.damaged_count) : "",
      material_received: item.material_received != null ? String(item.material_received) : "",
      processed_output: item.processed_output != null ? String(item.processed_output) : "",
      waste_rejected: item.waste_rejected != null ? String(item.waste_rejected) : "",
    });
    setCountDialogOpen(true);
  };

  // Waste (kg) = Material Received (kg) - Processed Output (kg), never negative.
  useEffect(() => {
    if (!isRecyclingForm) return;

    const received = Number(countForm.material_received);
    const output = Number(countForm.processed_output);
    if (countForm.material_received === "" || countForm.processed_output === "" || isNaN(received) || isNaN(output)) {
      setCountForm((f) => (f.waste_rejected === "" ? f : { ...f, waste_rejected: "" }));
      return;
    }

    const calculatedWaste = Math.max(0, received - output);
    setCountForm((f) => {
      if (f.waste_rejected === String(calculatedWaste)) return f;
      return { ...f, waste_rejected: String(calculatedWaste) };
    });
  }, [countForm.material_received, countForm.processed_output, isRecyclingForm]);

  const submitCount = () => {
    if (!canCreate && !editingCount) {
      toast.error("You don't have permission to log production counts");
      return;
    }
    if (editingCount && !canVerify) {
      toast.error("You don't have permission to edit production counts");
      return;
    }

    const payload = isRecyclingForm
      ? {
          factory_id: countForm.factory_id,
          material_received: Number(countForm.material_received),
          processed_output: Number(countForm.processed_output),
          waste_rejected: Number(countForm.waste_rejected),
        }
      : {
          factory_id: countForm.factory_id,
          batch_id: countForm.batch_id || undefined,
          checkpoint: countForm.checkpoint,
          good_count: Number(countForm.good_count),
          damaged_count: Number(countForm.damaged_count),
        };

    if (editingCount) {
      mutate.mutate(
        { action: "update_count", id: editingCount.id, ...payload },
        {
          onSuccess: (result) => {
            toast.success("Production count updated");
            if (result?.orderAdvanced?.orderNumber) {
              toast.success(
                `Order ${result.orderAdvanced.orderNumber} auto-advanced to Ready`
              );
            }
            setCountDialogOpen(false);
            setEditingCount(null);
          },
          onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
        }
      );
      return;
    }

    mutate.mutate(payload, {
      onSuccess: (result) => {
        toast.success("Production count logged successfully");
        if (result?.orderAdvanced?.orderNumber) {
          toast.success(
            `Order ${result.orderAdvanced.orderNumber} auto-advanced to Ready`
          );
        }
        setCountDialogOpen(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to log count"),
    });
  };

  const handleBatchStatusChange = (batch: ProductionBatch, status: string) => {
    if (!canVerify) {
      toast.error("You don't have permission to update batch status");
      return;
    }
    mutate.mutate(
      { action: "update_batch", id: batch.id, status },
      {
        onSuccess: () => toast.success("Batch status updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Update failed"),
      }
    );
  };

  const confirmDeleteBatch = () => {
    if (!deleteBatch || !canVerify) return;
    mutate.mutate(
      { action: "delete_batch", id: deleteBatch.id },
      {
        onSuccess: () => {
          toast.success("Batch deleted");
          setDeleteBatch(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  const confirmDeleteCount = () => {
    if (!deleteCount || !canVerify) return;
    mutate.mutate(
      { action: "delete_count", id: deleteCount.id },
      {
        onSuccess: () => {
          toast.success("Production count deleted");
          setDeleteCount(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  const handleExportReport = (format: "PDF" | "Excel") => {
    exportReportMutation.mutate(
      {
        format,
        period: filters.period,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        batchStatus: filters.batchStatus,
        countType: filters.countType,
      },
      {
        onSuccess: (result) => {
          downloadBase64File(result.data, result.filename, result.mimeType);
          toast.success(`Production report exported as ${format}`);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Report export failed"),
      }
    );
  };

  const countColumns = useMemo(() => {
    const actionsColumn = {
      id: "actions",
      header: "",
      cell: (row: ProductionCount) =>
        canVerify ? (
          <RowActions onEdit={() => openEditCount(row)} onDelete={() => setDeleteCount(row)} />
        ) : null,
    };

    if (isRecyclingScope) {
      return [
        { id: "date", header: "Date", cell: (row: ProductionCount) => row.production_date },
        {
          id: "received",
          header: "Material Received",
          cell: (row: ProductionCount) => formatNumber(row.material_received ?? 0),
        },
        {
          id: "output",
          header: "Processed Output",
          cell: (row: ProductionCount) => formatNumber(row.processed_output ?? 0),
        },
        {
          id: "waste",
          header: "Waste Rejected",
          cell: (row: ProductionCount) => formatNumber(row.waste_rejected ?? 0),
        },
        {
          id: "yield",
          header: "Yield",
          cell: (row: ProductionCount) =>
            formatPercent(
              calculateYieldRate(row.processed_output ?? 0, row.material_received ?? 0)
            ),
        },
        actionsColumn,
      ];
    }

    if (isBlockScope) {
      return [
        { id: "date", header: "Date", cell: (row: ProductionCount) => row.production_date },
        {
          id: "batch",
          header: "Batch",
          cell: (row: ProductionCount) => {
            const batch = batches.find((b) => b.id === row.batch_id);
            return batch ? (
              <span className="font-mono text-xs">{batchLabel(batch)}</span>
            ) : (
              "—"
            );
          },
        },
        {
          id: "checkpoint",
          header: "Checkpoint",
          cell: (row: ProductionCount) =>
            row.checkpoint ? CHECKPOINT_LABELS[row.checkpoint] : "—",
        },
        {
          id: "good",
          header: "Good",
          cell: (row: ProductionCount) => formatNumber(row.good_count ?? 0),
        },
        {
          id: "damaged",
          header: "Damaged",
          cell: (row: ProductionCount) => formatNumber(row.damaged_count ?? 0),
        },
        {
          id: "yield",
          header: "Yield",
          cell: (row: ProductionCount) => {
            const good = row.good_count ?? 0;
            const damaged = row.damaged_count ?? 0;
            return formatPercent(calculateYieldRate(good, good + damaged));
          },
        },
        actionsColumn,
      ];
    }

    return [
      { id: "date", header: "Date", cell: (row: ProductionCount) => row.production_date },
      {
        id: "factory",
        header: "Factory",
        cell: (row: ProductionCount) => (
          <Badge variant="outline" className="font-normal">
            {FACTORY_NAMES[row.factory_id] ?? "—"}
          </Badge>
        ),
      },
      {
        id: "type",
        header: "Type",
        cell: (row: ProductionCount) =>
          isRecyclingCountRow(row) ? "Recycling cycle" : CHECKPOINT_LABELS[row.checkpoint ?? "batch_count"],
      },
      {
        id: "summary",
        header: "Summary",
        cell: (row: ProductionCount) =>
          isRecyclingCountRow(row)
            ? `${formatNumber(row.processed_output ?? 0)} output / ${formatNumber(row.material_received ?? 0)} in`
            : `${formatNumber(row.good_count ?? 0)} good / ${formatNumber(row.damaged_count ?? 0)} damaged`,
      },
      actionsColumn,
    ];
  }, [batches, canVerify, isBlockScope, isRecyclingScope]);

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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Production"
        description={`${pageDescription} Viewing: ${scopeLabel}.`}
        actions={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              {showBatchSection && (
                <Button variant="outline" onClick={handleNewBatch} disabled={mutate.isPending}>
                  <Plus className="size-4" />
                  New Batch
                </Button>
              )}
              {showBatchSection && activeBlockBatches.length > 0 && (
                <Button variant="outline" onClick={openTargetDialog}>
                  <Target className="size-4" />
                  Set Daily Target
                </Button>
              )}
              {showBatchSection && activeBlockBatches.length > 0 && (
                <Button onClick={() => openDailyLog()}>
                  <Plus className="size-4" />
                  Log Daily Production
                </Button>
              )}
              {(isRecyclingScope || isCombinedScope) && (
                <Button
                  variant={showBatchSection ? "outline" : "default"}
                  onClick={openCreateCount}
                >
                  <Plus className="size-4" />
                  Log Production Count
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title={
            isRecyclingScope
              ? filters.period === "daily"
                ? "Processed Output"
                : `${periodLabel(filters.period)} Output`
              : filters.period === "daily"
                ? "Today's Output"
                : `${periodLabel(filters.period)} Output`
          }
          value={formatNumber(isRecyclingScope ? displayStats.totalOutput : periodLogOutput)}
          icon={isRecyclingScope ? <Recycle className="size-4" /> : <Factory className="size-4" />}
          info={
            isRecyclingScope
              ? "Total processed output logged for the selected period."
              : "Total good output logged from daily production logs for the selected period."
          }
        />
        {isRecyclingScope ? (
          <>
            <MetricCard
              title="Yield Rate"
              value={formatPercent(displayStats.yieldRate)}
              info="Processed output as a percentage of material received, for the selected period."
            />
            <MetricCard
              title="Waste Rate"
              value={formatPercent(displayStats.curingDamageRate)}
              info="Material rejected/wasted as a percentage of material received, for the selected period."
            />
          </>
        ) : (
          <>
            <MetricCard
              title="Monthly Output"
              value={`${formatNumber(monthlyLogSummary?.outputPieces ?? 0)} pcs`}
              info="Total pieces produced across all daily production logs this month."
            />
            <MetricCard
              title="Waste Cost (Month)"
              value={formatCurrency(monthlyLogSummary?.wasteCost ?? 0)}
              info="Cost of cement and poliche used beyond the standard formula amount, summed from daily logs this month."
            />
          </>
        )}
        {showBatchSection ? (
          <MetricCard
            title="Active Batches"
            value={activeBlockBatches.length}
            info="All block factory batches that are still in progress — always counted, not limited by the date filter."
          />
        ) : (
          <MetricCard
            title="Period Entries"
            value={displayStats.entryCount}
            info="Number of production count records logged in the selected period."
          />
        )}
      </div>

      {showBatchSection && (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="pt-6">
            <ProductionCapacityPanel />
          </CardContent>
        </Card>
      )}

      <ProductionFiltersBar
        filters={filters}
        onChange={(f) => {
          setFilters(f);
          setBatchPage(1);
        }}
        showBatchFilters={showBatchSection}
        onExport={handleExportReport}
        exporting={exportReportMutation.isPending}
      />

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>
            {isRecyclingScope ? "Processing Efficiency" : "Monthly Production Summary"}
          </CardTitle>
          <CardDescription>
            {isRecyclingScope
              ? "Latest recycling cycle performance"
              : "Totals from daily production logs, month to date"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isRecyclingScope ? (
            yieldStats.output > 0 || yieldStats.total > 0 ? (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-lg border border-border/60 p-4">
                  <p className="text-2xl font-bold text-success">{formatPercent(yieldStats.yield)}</p>
                  <p className="text-xs text-muted-foreground">Process Yield</p>
                </div>
                <div className="rounded-lg border border-border/60 p-4">
                  <p className="text-2xl font-bold text-destructive">{formatPercent(yieldStats.damage)}</p>
                  <p className="text-xs text-muted-foreground">Waste Rate</p>
                </div>
                <div className="rounded-lg border border-border/60 p-4">
                  <p className="text-2xl font-bold">{formatNumber(yieldStats.output)}</p>
                  <p className="text-xs text-muted-foreground">Units Processed</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No production counts recorded yet for this scope.</p>
            )
          ) : monthlyLogSummary && monthlyLogSummary.daysLogged > 0 ? (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-lg border border-border/60 p-4">
                <p className="text-2xl font-bold">{formatNumber(monthlyLogSummary.outputPieces)}</p>
                <p className="text-xs text-muted-foreground">Pieces Produced</p>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <p className="text-2xl font-bold text-destructive">
                  {formatCurrency(monthlyLogSummary.wasteCost)}
                </p>
                <p className="text-xs text-muted-foreground">Waste Cost</p>
              </div>
              <div className="rounded-lg border border-border/60 p-4">
                <p className="text-2xl font-bold">{formatNumber(monthlyLogSummary.daysLogged)}</p>
                <p className="text-xs text-muted-foreground">Days Logged</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No daily logs recorded yet this month.</p>
          )}
        </CardContent>
      </Card>

      {showBatchSection && (
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Batch Status</CardTitle>
              <CardDescription>
                Active batches always shown · finished ones appear when their start or finish date is in
                the filter · {paginatedBlockBatches.length} of {searchedBlockBatches.length}
                {activeBlockBatches.length > 0
                  ? ` · ${activeBlockBatches.length} active`
                  : ""}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={batchSearch}
                onChange={(e) => {
                  setBatchSearch(e.target.value);
                  setBatchPage(1);
                }}
                placeholder="Search by name or code"
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <DataTable
              data={paginatedBlockBatches}
              getRowKey={(row) => row.id}
              emptyMessage="No batches match the selected filters."
              onRowClick={(row) => router.push(`/dashboard/production/batches/${row.id}`)}
              columns={[
                {
                  id: "date",
                  header: "Started",
                  cell: (row) => getBatchDate(row),
                },
                {
                  id: "batch",
                  header: "Batch Number",
                  cell: (row) => (
                    <div>
                      <span className="font-mono text-sm">{row.batch_number}</span>
                      {row.name && <p className="text-xs">{row.name}</p>}
                      {row.block_size_cm && (
                        <p className="text-xs text-muted-foreground">{row.block_size_cm}cm block</p>
                      )}
                    </div>
                  ),
                },
                {
                  id: "status",
                  header: "Status",
                  cell: (row) => (
                    <Badge variant={batchStatusVariant(row.status)} className="capitalize">
                      {row.status.replace(/_/g, " ")}
                    </Badge>
                  ),
                },
                {
                  id: "produced",
                  header: "Produced",
                  cell: (row) => formatNumber(batchProduction[row.id]?.produced ?? 0),
                },
                {
                  id: "ordered",
                  header: "Ordered",
                  cell: (row) => formatNumber(batchProduction[row.id]?.sold ?? 0),
                },
                {
                  id: "left",
                  header: "Left",
                  cell: (row) =>
                    formatNumber(
                      Math.max(
                        0,
                        (batchProduction[row.id]?.produced ?? 0) - (batchProduction[row.id]?.sold ?? 0)
                      )
                    ),
                },
                {
                  id: "actions",
                  header: "",
                  cell: (row) =>
                    canCreate || canVerify ? (
                      <div onClick={(e) => e.stopPropagation()}>
                        <RowActions
                          onDelete={canVerify ? () => setDeleteBatch(row) : undefined}
                          extraActions={[
                            ...(row.status !== "completed"
                              ? [{ label: "Daily Log", onClick: () => openDailyLog(row.id) }]
                              : []),
                            ...(canVerify && row.status !== "completed" && row.status !== "cancelled"
                              ? [
                                  {
                                    label: "Finish Batch",
                                    onClick: () => handleBatchStatusChange(row, "completed"),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </div>
                    ) : null,
                },
              ]}
            />
            {batchPageCount > 1 && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {effectiveBatchPage} of {batchPageCount}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={effectiveBatchPage <= 1}
                    onClick={() => setBatchPage(Math.max(1, effectiveBatchPage - 1))}
                  >
                    <ChevronLeft className="size-4" />
                    Prev
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={effectiveBatchPage >= batchPageCount}
                    onClick={() => setBatchPage(Math.min(batchPageCount, effectiveBatchPage + 1))}
                  >
                    Next
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle>Production Count History</CardTitle>
          <CardDescription>
            {isRecyclingScope
              ? `Material intake, processing output, and waste records — ${filteredCounts.length} of ${counts.length}`
              : isBlockScope
                ? `Legacy checkpoint records — ${filteredCounts.length} of ${counts.length}`
                : `All production entries — ${filteredCounts.length} of ${counts.length}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={filteredCounts}
            getRowKey={(row) => row.id}
            emptyMessage="No production counts match the selected filters."
            columns={countColumns}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={countDialogOpen}
        onOpenChange={(open) => {
          setCountDialogOpen(open);
          if (!open) setEditingCount(null);
        }}
        title={editingCount ? "Edit Production Count" : "Log Production Count"}
        description={
          isRecyclingForm
            ? "Record material intake, processed output, and waste rejected."
            : "Edit good and damaged units for a legacy block factory checkpoint entry."
        }
        submitLabel={editingCount ? "Update Count" : "Save Count"}
        isSubmitting={mutate.isPending}
        onSubmit={submitCount}
      >
        {isRecyclingForm ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="material">Material Received (kg)</Label>
              <Input
                id="material"
                type="number"
                min={0}
                value={countForm.material_received}
                onChange={(e) => setCountForm((f) => ({ ...f, material_received: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="output">Processed Output (kg)</Label>
              <Input
                id="output"
                type="number"
                min={0}
                value={countForm.processed_output}
                onChange={(e) => setCountForm((f) => ({ ...f, processed_output: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="waste">Waste Rejected (kg, Calculated)</Label>
              <Input
                id="waste"
                type="text"
                value={countForm.waste_rejected || "0"}
                readOnly
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Batch</Label>
              <Select
                value={countForm.batch_id}
                onValueChange={(v) => setCountForm((f) => ({ ...f, batch_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {blockBatches.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      Create a batch first
                    </SelectItem>
                  ) : (
                    blockBatches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {batchLabel(b)}
                        {b.order_id ? " (linked order)" : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="good">Good Count</Label>
                <Input
                  id="good"
                  type="number"
                  min={0}
                  value={countForm.good_count}
                  onChange={(e) => setCountForm((f) => ({ ...f, good_count: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="damaged">Damaged Count</Label>
                <Input
                  id="damaged"
                  type="number"
                  min={0}
                  value={countForm.damaged_count}
                  onChange={(e) => setCountForm((f) => ({ ...f, damaged_count: e.target.value }))}
                  required
                />
              </div>
            </div>
          </>
        )}
      </EntityFormDialog>

      <EntityFormDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        title="New Production Batch"
        description="Cement and poliche are deducted from stock as daily production is logged, based on what's actually used each day."
        submitLabel="Create Batch"
        isSubmitting={mutate.isPending}
        onSubmit={submitBatch}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="batch-name">Batch Name</Label>
            <Input
              id="batch-name"
              value={batchForm.name}
              onChange={(e) => setBatchForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Optional — e.g. North yard run"
            />
          </div>
          <div className="space-y-2">
            <Label>Block Type</Label>
            <Select
              value={String(batchForm.block_size_cm)}
              onValueChange={(v) => {
                const size = Number(v) as BlockSizeCm;
                const pred = predictBatchProduction({
                  plannedQuantity: DEFAULT_BATCH_PLANNED_QTY,
                  blockSizeCm: size,
                  batches,
                  counts,
                  intelligence: productionIntelligence,
                  cementKgPerBag,
                });
                setBatchForm((f) => ({
                  ...f,
                  block_size_cm: size,
                  expected_waste_rate: String(Math.round(pred.historicalWasteRate * 100 * 10) / 10),
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableBlockSizes.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No block sizes have a finished goods item in inventory
                  </p>
                ) : (
                  availableBlockSizes.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label} block
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expected-waste-rate">Expected Target Waste (%)</Label>
            <Input
              id="expected-waste-rate"
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={batchForm.expected_waste_rate}
              onChange={(e) =>
                setBatchForm((f) => ({ ...f, expected_waste_rate: e.target.value }))
              }
            />
            <p className="text-[10px] text-muted-foreground">
              AI Recommendation: <span className="font-semibold text-primary">{formatPercent(batchPrediction.historicalWasteRate * 100)}</span> (based on history)
            </p>
          </div>
          <Card className="border-border/60 bg-muted/10">
            <CardContent className="space-y-2 p-4 text-sm">
              <p className="font-medium">
                AI prediction ({Math.round(batchPrediction.confidence * 100)}% confidence)
                {batchPrediction.fromDefault ? " · default rate" : " · learned rate"}
              </p>
              <p className="text-muted-foreground">{batchPrediction.insight}</p>
              <p className="text-muted-foreground">
                Expected waste: {formatPercent(batchPrediction.historicalWasteRate * 100)}
                {" "}(learned) vs {formatPercent(batchPrediction.defaultWasteRate * 100)} (theoretical default)
              </p>
              <p className="text-muted-foreground">
                Materials needed: {formatNumber(batchPrediction.expectedCementBags)} cement bags (
                {formatNumber(batchPrediction.expectedCementKg)} kg) ·{" "}
                {formatPolicheLoads(batchPrediction.expectedPolicheLoads)} poliche load(s)
                {batchPrediction.sampleBatches > 0
                  ? ` · based on ${batchPrediction.sampleBatches} completed ${batchForm.block_size_cm}cm batches`
                  : ""}
              </p>
            </CardContent>
          </Card>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={dailyLogDialogOpen}
        onOpenChange={setDailyLogDialogOpen}
        title="Log Daily Production"
        description="Record today's production. The system converts your count to pieces and compares actual material use against the standard formula."
        submitLabel="Save Daily Log"
        isSubmitting={createDailyLogMutation.isPending}
        onSubmit={submitDailyLog}
        contentClassName="sm:max-w-xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="log-date">Date</Label>
              <Input
                id="log-date"
                type="date"
                value={dailyLogForm.log_date}
                onChange={(e) => setDailyLogForm((f) => ({ ...f, log_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-batch">Batch</Label>
              <Select
                value={dailyLogForm.batch_id}
                onValueChange={(v) => setDailyLogForm((f) => ({ ...f, batch_id: v }))}
              >
                <SelectTrigger id="log-batch">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {activeBlockBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {batchLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Target for this day: {formatNumber(dailyLogTargetPlates)} plates
            {!existingLogForDate ? " (org default — set with “Set Daily Target”)" : ""}
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="log-unit">Unit</Label>
              <Select
                value={dailyLogForm.unit}
                onValueChange={(v) => setDailyLogForm((f) => ({ ...f, unit: v as "plate" | "piece" }))}
              >
                <SelectTrigger id="log-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plate">Plate</SelectItem>
                  <SelectItem value="piece">Piece</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="log-value">
                Actual Count ({dailyLogForm.unit === "plate" ? "plates" : "pieces"})
              </Label>
              <Input
                id="log-value"
                type="number"
                min={0}
                value={dailyLogForm.value}
                onChange={(e) => setDailyLogForm((f) => ({ ...f, value: e.target.value }))}
              />
              {dailyLogForm.value !== "" && (
                <p className="text-[10px] text-muted-foreground">
                  {dailyLogForm.unit === "plate"
                    ? `≈ ${formatNumber(dailyLogCalculatedPieces)} pieces`
                    : `≈ ${formatNumber(dailyLogActualPlates)} plates`}
                </p>
              )}
            </div>
          </div>

          {dailyLogIsShort && (
            <div className="space-y-2">
              <Label htmlFor="shortfall-reason">
                Reason for shortfall <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="shortfall-reason"
                rows={2}
                value={dailyLogForm.shortfall_reason}
                onChange={(e) =>
                  setDailyLogForm((f) => ({ ...f, shortfall_reason: e.target.value }))
                }
                placeholder="Why did today's count fall short of the target?"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cement-used">Cement Used</Label>
                <Select
                  value={dailyLogForm.cement_unit}
                  onValueChange={(v) =>
                    setDailyLogForm((f) => ({ ...f, cement_unit: v as "kg" | "bag" }))
                  }
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
                id="cement-used"
                type="number"
                min={0}
                step="0.1"
                value={dailyLogForm.cement_used}
                onChange={(e) =>
                  setDailyLogForm((f) => ({ ...f, cement_used: e.target.value }))
                }
              />
              {dailyLogForm.cement_used !== "" && (
                <p className="text-[10px] text-muted-foreground">
                  {dailyLogForm.cement_unit === "kg"
                    ? `≈ ${formatNumber(dailyLogCementBagsUsed)} bags (${cementKgPerBag}kg/bag)`
                    : `≈ ${formatNumber(dailyLogCementKgUsed)} kg (${cementKgPerBag}kg/bag)`}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="poliche-used">Poliche Used (loads)</Label>
              <div
                id="poliche-used"
                className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground"
              >
                {formatPolicheLoads(dailyLogPolicheLoadsUsed)} load(s)
              </div>
              <p className="text-[10px] text-muted-foreground">
                Auto-calculated from the standard formula — poliche isn&apos;t measured per day.
              </p>
            </div>
          </div>

          {(dailyLogForm.cement_used || dailyLogForm.value) && (
            <Card className="border-border/60 bg-muted/10">
              <CardContent className="space-y-1 p-4 text-sm">
                <p className="text-muted-foreground">
                  Standard for {formatNumber(dailyLogCalculatedPieces)} pieces:{" "}
                  {formatNumber(dailyLogStandard.cementBags)} cement bags (
                  {formatNumber(dailyLogStandard.cementKg)} kg) ·{" "}
                  {formatPolicheLoads(dailyLogStandard.policheLoads)} poliche load(s)
                </p>
                {dailyLogCementWasteBags > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">
                    Waste: {formatNumber(dailyLogCementWasteBags)} cement bag(s) (
                    {formatNumber(dailyLogCementWasteBags * cementKgPerBag)} kg) over standard
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {dailyLogs.length > 0 && (
            <div className="space-y-2">
              <Label>History</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {dailyLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 p-2 text-xs"
                  >
                    <div>
                      <p className="font-medium">{log.log_date}</p>
                      <p className="text-muted-foreground">
                        Target: {formatNumber(log.target_plates)} plates
                        {log.calculated_pieces != null && (
                          <>
                            {" · "}
                            {formatNumber(log.actual_plates ?? 0)} plates → {formatNumber(log.calculated_pieces)} pieces
                          </>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      {log.calculated_pieces == null ? (
                        <Badge variant="outline">Not logged yet</Badge>
                      ) : (
                        <Badge variant={log.calculated_pieces < log.target_pieces ? "outline" : "secondary"}>
                          {log.calculated_pieces < log.target_pieces ? "Below target" : "On target"}
                        </Badge>
                      )}
                      {log.waste_cost > 0 && (
                        <p className="mt-1 text-amber-700 dark:text-amber-400">
                          {formatCurrency(log.waste_cost)} waste
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={targetDialogOpen}
        onOpenChange={setTargetDialogOpen}
        title="Set Daily Target"
        description="Set the production target for a batch on a specific day. It's used as the goal for that day's log — if the actual count comes in short, a reason will be required."
        submitLabel="Set Target"
        isSubmitting={createTargetLogMutation.isPending}
        onSubmit={submitTarget}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target-date">Date</Label>
              <Input
                id="target-date"
                type="date"
                value={targetForm.log_date}
                onChange={(e) => setTargetForm((f) => ({ ...f, log_date: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-batch">Batch</Label>
              <Select value={targetForm.batch_id} onValueChange={handleTargetBatchChange}>
                <SelectTrigger id="target-batch">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {activeBlockBatches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {batchLabel(b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Block Type</Label>
              <Input
                value={targetForm.block_size_cm ? `${targetForm.block_size_cm}cm block` : "—"}
                readOnly
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-unit">Unit</Label>
              <Select
                value={targetForm.unit}
                onValueChange={(v) => setTargetForm((f) => ({ ...f, unit: v as "plate" | "piece" }))}
              >
                <SelectTrigger id="target-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plate">Plate</SelectItem>
                  <SelectItem value="piece">Piece</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="target-value">Target ({targetForm.unit === "plate" ? "plates" : "pieces"})</Label>
            <Input
              id="target-value"
              type="number"
              min={0}
              value={targetForm.value}
              onChange={(e) => setTargetForm((f) => ({ ...f, value: e.target.value }))}
            />
            {targetValueNumber > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {targetForm.unit === "plate"
                  ? `≈ ${formatNumber(targetPiecesResolved)} pieces`
                  : `≈ ${formatNumber(targetPlatesResolved)} plates`}
              </p>
            )}
          </div>
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteBatch}
        onOpenChange={(open) => !open && setDeleteBatch(null)}
        title="Delete Batch"
        description={`Delete batch ${deleteBatch ? batchLabel(deleteBatch) : ""}? Linked counts will remain but lose their batch reference.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={confirmDeleteBatch}
      />

      <ConfirmDialog
        open={!!deleteCount}
        onOpenChange={(open) => !open && setDeleteCount(null)}
        title="Delete Production Count"
        description="Remove this production count entry? This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={confirmDeleteCount}
      />
    </div>
  );
}
