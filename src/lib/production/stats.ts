import {
  calculateDamageRate,
  calculateYieldRate,
} from "@/lib/utils";
import {
  FACTORY_IDS,
  type ProductionBatch,
  type ProductionCount,
  type ViewScope,
} from "@/types";
import { getBatchDate, isRecyclingCount, todayIsoDate } from "@/lib/production/filters";

export interface ProductionStats {
  totalOutput: number;
  yieldRate: number;
  dryingDamageRate: number;
  curingDamageRate: number;
  factoryType: "block" | "recycling" | "combined";
  activeBatches: number;
  entryCount: number;
}

export interface ProductionStatsOptions {
  dateFrom?: string;
  dateTo?: string;
  batches?: ProductionBatch[];
}

export interface BatchTrailStats {
  output: number;
  yield: number;
  damage: number;
  total: number;
  dryingYield: number;
  dryingDamage: number;
  curingYield: number;
  curingDamage: number;
  baseline: number;
}

function inDateRange(
  date: string | undefined | null,
  from: string,
  to: string
): boolean {
  if (!date) return false;
  const value = date.slice(0, 10);
  return value >= from && value <= to;
}

function groupBlockCountsByBatch(counts: ProductionCount[]) {
  const blockCounts = counts.filter(
    (c) => c.factory_id === FACTORY_IDS.block && !isRecyclingCount(c)
  );
  const groups = new Map<string, ProductionCount[]>();

  for (const count of blockCounts) {
    const key = count.batch_id ?? `single-${count.id}`;
    const list = groups.get(key) ?? [];
    list.push(count);
    groups.set(key, list);
  }

  return groups;
}

function pickCheckpoint(counts: ProductionCount[], checkpoint: ProductionCount["checkpoint"]) {
  return counts.find((c) => c.checkpoint === checkpoint);
}

function checkpointTotal(count: ProductionCount | undefined) {
  if (!count) return 0;
  return (count.good_count ?? 0) + (count.damaged_count ?? 0);
}

/**
 * Analyse one batch's checkpoint trail (batch_count → after_drying → after_curing).
 * Handles partial trails when batch_count was not logged yet.
 */
export function analyzeBatchTrail(batchCounts: ProductionCount[]): BatchTrailStats {
  const batchCount = pickCheckpoint(batchCounts, "batch_count");
  const drying = pickCheckpoint(batchCounts, "after_drying");
  const curing = pickCheckpoint(batchCounts, "after_curing");

  const empty: BatchTrailStats = {
    output: 0,
    yield: 0,
    damage: 0,
    total: 0,
    dryingYield: 0,
    dryingDamage: 0,
    curingYield: 0,
    curingDamage: 0,
    baseline: 0,
  };

  const latest = curing ?? drying ?? batchCount;
  if (!latest) return empty;

  const dryingTotal = checkpointTotal(drying);
  const curingTotal = checkpointTotal(curing);
  const batchStart = checkpointTotal(batchCount);

  const dryingYield =
    dryingTotal > 0 ? calculateYieldRate(drying!.good_count ?? 0, dryingTotal) : 0;
  const dryingDamage =
    dryingTotal > 0 ? calculateDamageRate(drying!.damaged_count ?? 0, dryingTotal) : 0;

  const curingYield =
    curingTotal > 0 ? calculateYieldRate(curing!.good_count ?? 0, curingTotal) : 0;
  const curingDamage =
    curingTotal > 0 ? calculateDamageRate(curing!.damaged_count ?? 0, curingTotal) : 0;

  const output = curing?.good_count ?? drying?.good_count ?? batchCount?.good_count ?? 0;

  // Full 3-checkpoint trail: batch_count is the baseline
  if (batchCount && batchStart > 0) {
    const loss = Math.max(0, batchStart - output);
    return {
      output,
      yield: calculateYieldRate(output, batchStart),
      damage: calculateDamageRate(loss, batchStart),
      total: batchStart,
      dryingYield,
      dryingDamage,
      curingYield,
      curingDamage,
      baseline: batchStart,
    };
  }

  // Partial trail: drying → curing (your current data)
  if (drying && curing) {
    const dryingGood = drying.good_count ?? 0;
    const curingGood = curing.good_count ?? 0;

    // Curing good should not exceed drying good — use per-checkpoint stats for summary
    if (curingGood > dryingGood && dryingGood > 0) {
      return {
        output: curingGood,
        yield: curingYield,
        damage: curingDamage,
        total: curingTotal,
        dryingYield,
        dryingDamage,
        curingYield,
        curingDamage,
        baseline: dryingTotal,
      };
    }

    const trailBaseline = dryingTotal;
    const totalLoss = (drying.damaged_count ?? 0) + (curing.damaged_count ?? 0);

    return {
      output: curingGood,
      yield: calculateYieldRate(curingGood, trailBaseline),
      damage: calculateDamageRate(totalLoss, trailBaseline),
      total: trailBaseline,
      dryingYield,
      dryingDamage,
      curingYield,
      curingDamage,
      baseline: trailBaseline,
    };
  }

  // Single checkpoint logged
  const latestTotal = checkpointTotal(latest);
  const latestGood = latest.good_count ?? 0;
  const latestDamaged = latest.damaged_count ?? 0;

  return {
    output: latestGood,
    yield: calculateYieldRate(latestGood, latestTotal),
    damage: calculateDamageRate(latestDamaged, latestTotal),
    total: latestTotal,
    dryingYield,
    dryingDamage,
    curingYield,
    curingDamage,
    baseline: latestTotal,
  };
}

export function computeBatchTrailStats(batchCounts: ProductionCount[]): BatchTrailStats {
  return analyzeBatchTrail(batchCounts);
}

function aggregateTrailStats(trails: BatchTrailStats[]) {
  if (trails.length === 0) {
    return {
      totalOutput: 0,
      yieldRate: 0,
      dryingDamageRate: 0,
      curingDamageRate: 0,
    };
  }

  if (trails.length === 1) {
    const t = trails[0];
    return {
      totalOutput: t.output,
      yieldRate: t.yield,
      dryingDamageRate: t.dryingDamage,
      curingDamageRate: t.damage,
    };
  }

  const totalOutput = trails.reduce((sum, t) => sum + t.output, 0);
  const baselineSum = trails.reduce((sum, t) => sum + t.baseline, 0);
  const totalLoss = trails.reduce(
    (sum, t) => sum + Math.max(0, t.baseline - t.output),
    0
  );

  let yieldWeighted = 0;
  let dryingWeighted = 0;
  let damageWeighted = 0;
  let weightSum = 0;

  for (const t of trails) {
    const weight = t.baseline > 0 ? t.baseline : t.output;
    if (weight <= 0) continue;
    yieldWeighted += t.yield * weight;
    dryingWeighted += t.dryingDamage * weight;
    damageWeighted += t.damage * weight;
    weightSum += weight;
  }

  return {
    totalOutput,
    yieldRate:
      weightSum > 0
        ? yieldWeighted / weightSum
        : baselineSum > 0
          ? calculateYieldRate(totalOutput, baselineSum)
          : 0,
    dryingDamageRate: weightSum > 0 ? dryingWeighted / weightSum : 0,
    curingDamageRate:
      baselineSum > 0
        ? calculateDamageRate(totalLoss, baselineSum)
        : weightSum > 0
          ? damageWeighted / weightSum
          : 0,
  };
}

export function computeBlockStats(
  counts: ProductionCount[],
  options?: ProductionStatsOptions
): Omit<ProductionStats, "factoryType"> {
  const from = options?.dateFrom ?? todayIsoDate();
  const to = options?.dateTo ?? todayIsoDate();
  const scoped = counts.filter(
    (c) =>
      c.factory_id === FACTORY_IDS.block &&
      !isRecyclingCount(c) &&
      inDateRange(c.production_date, from, to)
  );

  const groups = groupBlockCountsByBatch(scoped);
  const trails = Array.from(groups.values()).map(analyzeBatchTrail);
  const aggregated = aggregateTrailStats(trails);

  const activeBatches =
    options?.batches?.filter((batch) => {
      if (batch.factory_id !== FACTORY_IDS.block) return false;
      if (batch.status === "completed") return false;
      const hasCountsInPeriod = scoped.some((c) => c.batch_id === batch.id);
      return hasCountsInPeriod || inDateRange(getBatchDate(batch), from, to);
    }).length ?? 0;

  return {
    totalOutput: aggregated.totalOutput,
    yieldRate: aggregated.yieldRate,
    dryingDamageRate: aggregated.dryingDamageRate,
    curingDamageRate: aggregated.curingDamageRate,
    activeBatches,
    entryCount: scoped.length,
  };
}

export function computeRecyclingStats(
  counts: ProductionCount[],
  options?: ProductionStatsOptions
): Omit<ProductionStats, "factoryType"> {
  const from = options?.dateFrom ?? todayIsoDate();
  const to = options?.dateTo ?? todayIsoDate();
  const scoped = counts.filter(
    (c) =>
      (c.factory_id === FACTORY_IDS.recycling || isRecyclingCount(c)) &&
      inDateRange(c.production_date, from, to)
  );

  const material = scoped.reduce((sum, c) => sum + Number(c.material_received ?? 0), 0);
  const output = scoped.reduce((sum, c) => sum + Number(c.processed_output ?? 0), 0);
  const waste = scoped.reduce((sum, c) => sum + Number(c.waste_rejected ?? 0), 0);

  return {
    totalOutput: output,
    yieldRate: calculateYieldRate(output, material),
    dryingDamageRate: 0,
    curingDamageRate: calculateDamageRate(waste, material),
    activeBatches: 0,
    entryCount: scoped.length,
  };
}

function weightedRate(rateA: number, weightA: number, rateB: number, weightB: number) {
  const denom = weightA + weightB;
  if (denom <= 0) return 0;
  return (rateA * weightA + rateB * weightB) / denom;
}

export function computeProductionStats(
  counts: ProductionCount[],
  scope: ViewScope,
  options?: ProductionStatsOptions
): ProductionStats {
  const from = options?.dateFrom ?? todayIsoDate();
  const to = options?.dateTo ?? todayIsoDate();
  const opts = { ...options, dateFrom: from, dateTo: to };

  if (scope === "block") {
    return { ...computeBlockStats(counts, opts), factoryType: "block" };
  }

  if (scope === "recycling") {
    return { ...computeRecyclingStats(counts, opts), factoryType: "recycling" };
  }

  const block = computeBlockStats(counts, opts);
  const recycling = computeRecyclingStats(counts, opts);

  const blockWeight = block.totalOutput > 0 ? block.totalOutput : block.entryCount;
  const recyclingWeight =
    recycling.totalOutput > 0 ? recycling.totalOutput : recycling.entryCount;

  return {
    totalOutput: block.totalOutput + recycling.totalOutput,
    yieldRate: weightedRate(block.yieldRate, blockWeight, recycling.yieldRate, recyclingWeight),
    dryingDamageRate: block.dryingDamageRate,
    curingDamageRate: weightedRate(
      block.curingDamageRate,
      blockWeight,
      recycling.curingDamageRate,
      recyclingWeight
    ),
    activeBatches: block.activeBatches,
    entryCount: block.entryCount + recycling.entryCount,
    factoryType: "combined",
  };
}
