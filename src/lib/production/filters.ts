import {
  CHECKPOINT_LABELS,
  FACTORY_IDS,
  type BlockCheckpoint,
  type ProductionBatch,
  type ProductionCount,
} from "@/types";

export type ReportPeriod = "daily" | "weekly" | "monthly" | "custom";

export type BatchStatusFilter = "all" | "in_progress" | "drying" | "curing" | "completed";

export type CountTypeFilter =
  | "all"
  | "recycling"
  | BlockCheckpoint;

export interface ProductionFilterState {
  period: ReportPeriod;
  dateFrom: string;
  dateTo: string;
  batchStatus: BatchStatusFilter;
  countType: CountTypeFilter;
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function resolveDateRange(
  period: ReportPeriod,
  customFrom?: string,
  customTo?: string
): { from: string; to: string } {
  const to = customTo || todayIsoDate();
  const end = new Date(`${to}T12:00:00`);

  if (period === "daily") {
    const day = end.toISOString().slice(0, 10);
    return { from: customFrom || day, to: day };
  }

  if (period === "weekly") {
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  if (period === "monthly") {
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  return { from: customFrom || to, to };
}

export function isDateInRange(date: string | undefined | null, from: string, to: string) {
  if (!date) return false;
  const value = date.slice(0, 10);
  return value >= from && value <= to;
}

export function getBatchDate(batch: ProductionBatch): string {
  if (batch.created_at) return batch.created_at.slice(0, 10);
  const match = batch.batch_number.match(/BATCH-(\d{8})-/);
  if (match) {
    const raw = match[1];
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return todayIsoDate();
}

/** Date used for period filters — completed batches also match on finish/update day. */
export function getBatchFilterDates(batch: ProductionBatch): string[] {
  const dates = new Set<string>();
  dates.add(getBatchDate(batch));
  if (batch.updated_at) dates.add(batch.updated_at.slice(0, 10));
  if (batch.expected_completion_date) {
    dates.add(batch.expected_completion_date.slice(0, 10));
  }
  if (batch.production_date) dates.add(batch.production_date.slice(0, 10));
  return [...dates];
}

export function isRecyclingFactory(factoryId: string) {
  return factoryId === FACTORY_IDS.recycling;
}

export function isRecyclingCount(row: ProductionCount) {
  return row.factory_id === FACTORY_IDS.recycling || row.material_received != null;
}

export function getCountTypeLabel(row: ProductionCount): string {
  if (isRecyclingCount(row)) return "Recycling cycle";
  return row.checkpoint ? CHECKPOINT_LABELS[row.checkpoint] : "Block count";
}

/** In-progress batches (not finished / cancelled) — always shown on Production. */
export function isActiveBatch(batch: ProductionBatch) {
  return batch.status !== "completed" && batch.status !== "cancelled";
}

export function filterProductionBatches(
  batches: ProductionBatch[],
  filters: Pick<ProductionFilterState, "batchStatus" | "dateFrom" | "dateTo">,
  options?: { alwaysIncludeActive?: boolean }
) {
  const alwaysIncludeActive = options?.alwaysIncludeActive === true;

  const matched = batches.filter((batch) => {
    // Production page: active batches stay visible regardless of period / status filters.
    if (alwaysIncludeActive && isActiveBatch(batch)) return true;
    if (filters.batchStatus !== "all" && batch.status !== filters.batchStatus) return false;
    // Completed/cancelled: match if started OR finished/updated in the selected period
    // so "Finish Batch" doesn't hide a batch that started earlier.
    return getBatchFilterDates(batch).some((d) =>
      isDateInRange(d, filters.dateFrom, filters.dateTo)
    );
  });

  if (!alwaysIncludeActive) return matched;

  // Active first, then newest by start date.
  return matched.sort((a, b) => {
    const aActive = isActiveBatch(a) ? 0 : 1;
    const bActive = isActiveBatch(b) ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return getBatchDate(b).localeCompare(getBatchDate(a));
  });
}

export function filterProductionCounts(
  counts: ProductionCount[],
  filters: Pick<ProductionFilterState, "countType" | "dateFrom" | "dateTo">
) {
  return counts.filter((count) => {
    if (!isDateInRange(count.production_date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.countType === "all") return true;
    if (filters.countType === "recycling") return isRecyclingCount(count);
    return count.checkpoint === filters.countType;
  });
}

export function periodLabel(period: ReportPeriod) {
  if (period === "daily") return "Daily";
  if (period === "weekly") return "Weekly";
  if (period === "monthly") return "Monthly";
  return "Custom range";
}

export const DEFAULT_PRODUCTION_FILTERS = (): ProductionFilterState => {
  const { from, to } = resolveDateRange("weekly");
  return {
    period: "weekly",
    dateFrom: from,
    dateTo: to,
    batchStatus: "all",
    countType: "all",
  };
};
