import {
  DEFAULT_WASTE_RATE,
  PRODUCTION_CYCLE_DAYS,
  parseBlockSizeCm,
  roundPolicheLoads,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import { computeBatchTrailStats } from "@/lib/production/stats";
import type { ProductionBatch, ProductionCount, ProductionDailyLog } from "@/types";
import type {
  BlockSizeIntelligence,
  ProductionIntelligence,
  ProductionIntelligenceMetrics,
} from "@/types/production-intelligence";

const ROLLING_WINDOW = 20;
const MAX_BATCHES = 200;

export type BatchMetricRow = {
  batch: ProductionBatch;
  blockSizeCm: BlockSizeCm;
  actualOutput: number;
  actualWaste: number;
  wasteRate: number;
  yieldRate: number;
  dryingLoss: number;
  curingLoss: number;
  cementBags: number;
  policheLoads: number;
  cycleDays: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function confidenceFromSamples(n: number): number {
  return clamp(0.5 + n * 0.05, 0.5, 0.95);
}

export function computeBatchMetrics(
  batch: ProductionBatch,
  counts: ProductionCount[]
): BatchMetricRow | null {
  const blockSizeCm = parseBlockSizeCm(batch.block_size_cm);
  if (!blockSizeCm) return null;

  const trail = computeBatchTrailStats(counts.filter((c) => c.batch_id === batch.id));
  const actualOutput =
    trail.output || batch.actual_output || Math.max(0, (batch.planned_quantity ?? 0) - (batch.actual_waste ?? 0));
  const actualWaste =
    Math.max(0, trail.total - trail.output) || batch.actual_waste || 0;
  const producedTotal = actualOutput + actualWaste || trail.total || batch.planned_quantity || 0;
  const wasteRate = producedTotal > 0 ? actualWaste / producedTotal : DEFAULT_WASTE_RATE;
  const yieldRate = trail.yield > 0 ? trail.yield : producedTotal > 0 ? actualOutput / producedTotal : 0.97;

  const cementBags = Number(batch.cement_bags_consumed ?? 0);
  const policheLoads = Number(batch.poliche_loads_consumed ?? 0);

  let cycleDays = PRODUCTION_CYCLE_DAYS;
  if (batch.created_at && batch.expected_completion_date) {
    const start = new Date(batch.created_at).getTime();
    const end = new Date(batch.expected_completion_date).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      cycleDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    }
  }

  return {
    batch,
    blockSizeCm,
    actualOutput,
    actualWaste,
    wasteRate: clamp(wasteRate, 0, 0.5),
    yieldRate: clamp(yieldRate, 0.5, 1),
    dryingLoss: trail.dryingDamage || 0,
    curingLoss: trail.curingDamage || 0,
    cementBags,
    policheLoads,
    cycleDays,
  };
}

export function aggregateIntelligence(rows: BatchMetricRow[]): ProductionIntelligenceMetrics {
  const bySize = new Map<BlockSizeCm, BatchMetricRow[]>();
  for (const row of rows) {
    const list = bySize.get(row.blockSizeCm) ?? [];
    list.push(row);
    bySize.set(row.blockSizeCm, list);
  }

  const by_block_size: ProductionIntelligenceMetrics["by_block_size"] = {};
  let globalWasteSum = 0;
  let globalYieldSum = 0;
  let globalCount = 0;

  for (const [size, all] of bySize) {
    const sorted = [...all].sort(
      (a, b) =>
        new Date(b.batch.created_at ?? 0).getTime() - new Date(a.batch.created_at ?? 0).getTime()
    );
    const window = sorted.slice(0, ROLLING_WINDOW);
    const wasteRates = window.map((r) => r.wasteRate);
    const yieldRates = window.map((r) => r.yieldRate);
    const avgWaste = wasteRates.reduce((a, b) => a + b, 0) / wasteRates.length;
    const avgYield = yieldRates.reduce((a, b) => a + b, 0) / yieldRates.length;

    let cementPer1000 = 0;
    let polichePer1000 = 0;
    let cementSamples = 0;
    let policheSamples = 0;
    for (const r of window) {
      if (r.actualOutput > 0 && r.cementBags > 0) {
        cementPer1000 += (r.cementBags / r.actualOutput) * 1000;
        cementSamples += 1;
      }
      if (r.actualOutput > 0 && r.policheLoads > 0) {
        polichePer1000 += (r.policheLoads / r.actualOutput) * 1000;
        policheSamples += 1;
      }
    }

    const intel: BlockSizeIntelligence = {
      completed_batches: window.length,
      avg_waste_rate: Number(avgWaste.toFixed(4)),
      avg_yield_rate: Number(avgYield.toFixed(4)),
      avg_cement_bags_per_1000_blocks:
        cementSamples > 0 ? Number((cementPer1000 / cementSamples).toFixed(2)) : 0,
      avg_poliche_loads_per_1000_blocks:
        policheSamples > 0 ? Number((polichePer1000 / policheSamples).toFixed(2)) : 0,
      avg_cycle_days: Number(
        (window.reduce((s, r) => s + r.cycleDays, 0) / window.length).toFixed(1)
      ),
      last_batch_waste_rate: Number(window[0].wasteRate.toFixed(4)),
      waste_rate_std_dev: Number(stdDev(wasteRates).toFixed(4)),
      avg_drying_loss: Number(
        (window.reduce((s, r) => s + r.dryingLoss, 0) / window.length).toFixed(1)
      ),
      avg_curing_loss: Number(
        (window.reduce((s, r) => s + r.curingLoss, 0) / window.length).toFixed(1)
      ),
      best_batch_waste_rate: Number(Math.min(...wasteRates).toFixed(4)),
      worst_batch_waste_rate: Number(Math.max(...wasteRates).toFixed(4)),
      confidence: confidenceFromSamples(window.length),
    };

    by_block_size[String(size)] = intel;
    globalWasteSum += avgWaste * window.length;
    globalYieldSum += avgYield * window.length;
    globalCount += window.length;
  }

  return {
    by_block_size,
    global: {
      avg_waste_rate:
        globalCount > 0 ? Number((globalWasteSum / globalCount).toFixed(4)) : DEFAULT_WASTE_RATE,
      total_completed_batches: rows.length,
      avg_yield_rate: globalCount > 0 ? Number((globalYieldSum / globalCount).toFixed(4)) : 0.97,
    },
  };
}

export function computeProductionIntelligence(input: {
  organizationId: string;
  factoryId: string;
  batches: ProductionBatch[];
  counts: ProductionCount[];
}): ProductionIntelligence {
  const completed = input.batches
    .filter((b) => b.status === "completed" && b.factory_id === input.factoryId)
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    )
    .slice(0, MAX_BATCHES);

  const rows: BatchMetricRow[] = [];
  for (const batch of completed) {
    const metrics = computeBatchMetrics(batch, input.counts);
    if (metrics) rows.push(metrics);
  }

  const metrics = aggregateIntelligence(rows);
  return {
    organization_id: input.organizationId,
    factory_id: input.factoryId,
    computed_at: new Date().toISOString(),
    sample_batches: rows.length,
    metrics,
    from_snapshot: false,
  };
}

/**
 * Block Factory's real production trail moved from checkpoint-based production_counts
 * (drying/curing) to per-day production_daily_logs — batches only have "in_progress" or
 * "completed" now, with no checkpoint stages. Waste here means MATERIAL waste (extra
 * cement/poliche consumed beyond the standard formula for the pieces actually produced),
 * not piece rejection — daily logs don't track damaged/rejected pieces, so there is no
 * drying/curing-loss equivalent anymore (dryingLoss/curingLoss are always 0 from this path).
 * "Yield" is redefined as how close daily output came to the daily target, the closest
 * available efficiency proxy now that piece-level rejection isn't logged.
 * Includes ALL batches with logged history, not just "completed" ones — a batch's daily
 * logs are real data the moment they're entered, they don't need the batch to be finished
 * first.
 */
export function computeBlockBatchMetricsFromDailyLogs(
  batch: ProductionBatch,
  dailyLogs: ProductionDailyLog[]
): BatchMetricRow | null {
  const blockSizeCm = parseBlockSizeCm(batch.block_size_cm);
  if (!blockSizeCm) return null;

  const batchLogs = dailyLogs.filter(
    (l) => l.batch_id === batch.id && Number(l.calculated_pieces ?? 0) > 0
  );
  if (batchLogs.length === 0) return null;

  let actualPieces = 0;
  let targetPieces = 0;
  let cementUsed = 0;
  let cementStandard = 0;
  let cementWaste = 0;
  let policheUsed = 0;
  let policheStandard = 0;
  let policheWaste = 0;

  for (const log of batchLogs) {
    actualPieces += Number(log.calculated_pieces ?? 0);
    targetPieces += Number(log.target_pieces ?? 0);
    cementUsed += Number(log.cement_bags_used ?? 0);
    cementStandard += Number(log.standard_cement_bags ?? 0);
    cementWaste += Number(log.cement_waste_bags ?? 0);
    policheUsed += Number(log.poliche_loads_used ?? 0);
    policheStandard += Number(log.standard_poliche_loads ?? 0);
    policheWaste += Number(log.poliche_waste_loads ?? 0);
  }

  const cementWasteRatio = cementStandard > 0 ? cementWaste / cementStandard : null;
  const policheWasteRatio = policheStandard > 0 ? policheWaste / policheStandard : null;
  const wasteRatios = [cementWasteRatio, policheWasteRatio].filter(
    (r): r is number => r !== null
  );
  const wasteRate = wasteRatios.length > 0
    ? wasteRatios.reduce((a, b) => a + b, 0) / wasteRatios.length
    : DEFAULT_WASTE_RATE;

  const yieldRate = targetPieces > 0 ? clamp(actualPieces / targetPieces, 0, 1) : 1;

  let cycleDays = PRODUCTION_CYCLE_DAYS;
  if (batch.created_at && batch.expected_completion_date) {
    const start = new Date(batch.created_at).getTime();
    const end = new Date(batch.expected_completion_date).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      cycleDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
    }
  }

  return {
    batch,
    blockSizeCm,
    actualOutput: actualPieces,
    actualWaste: Math.round(actualPieces * clamp(wasteRate, 0, 0.5)),
    wasteRate: clamp(wasteRate, 0, 0.5),
    yieldRate: clamp(yieldRate, 0, 1),
    dryingLoss: 0,
    curingLoss: 0,
    cementBags: cementUsed,
    policheLoads: policheUsed,
    cycleDays,
  };
}

export function computeBlockProductionIntelligenceFromDailyLogs(input: {
  organizationId: string;
  factoryId: string;
  batches: ProductionBatch[];
  dailyLogs: ProductionDailyLog[];
}): ProductionIntelligence {
  const candidates = input.batches
    .filter((b) => b.factory_id === input.factoryId)
    .sort(
      (a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
    )
    .slice(0, MAX_BATCHES);

  const rows: BatchMetricRow[] = [];
  for (const batch of candidates) {
    const metrics = computeBlockBatchMetricsFromDailyLogs(batch, input.dailyLogs);
    if (metrics) rows.push(metrics);
  }

  const metrics = aggregateIntelligence(rows);
  return {
    organization_id: input.organizationId,
    factory_id: input.factoryId,
    computed_at: new Date().toISOString(),
    sample_batches: rows.length,
    metrics,
    from_snapshot: false,
  };
}

/**
 * Predicts expected material waste and net finished output for a hypothetical production
 * run of `plannedPieces`, using the learned material-waste rate for this block size (falls
 * back to the 3% default when fewer than 2 batches have logged history). This is the
 * concrete answer to "how much waste do we expect" and "how many pieces can we actually get"
 * questions — expectedFinished already nets out the predicted waste.
 */
export function predictWasteForPlannedQuantity(
  intelligence: ProductionIntelligence,
  blockSizeCm: BlockSizeCm,
  plannedPieces: number
): {
  blockSizeCm: BlockSizeCm;
  plannedPieces: number;
  wasteRate: number;
  expectedWastePieces: number;
  expectedFinishedPieces: number;
  expectedCementBags: number;
  expectedCementWasteBags: number;
  expectedPolicheLoads: number;
  expectedPolicheWasteLoads: number;
  sampleBatches: number;
  confidence: number;
  fromDefault: boolean;
} {
  const learned = getLearnedWasteRate(intelligence, blockSizeCm);
  const sizeIntel = intelligence.metrics.by_block_size[String(blockSizeCm)];
  const safePlanned = Math.max(0, plannedPieces);
  const expectedWastePieces = Math.round(safePlanned * learned.rate);
  const expectedFinishedPieces = Math.max(0, safePlanned - expectedWastePieces);

  const bagsPer1000 = sizeIntel?.avg_cement_bags_per_1000_blocks ?? 0;
  const loadsPer1000 = sizeIntel?.avg_poliche_loads_per_1000_blocks ?? 0;
  const expectedCementBags = bagsPer1000 > 0 ? Math.ceil((safePlanned / 1000) * bagsPer1000) : 0;
  const expectedPolicheLoads =
    loadsPer1000 > 0 ? roundPolicheLoads((safePlanned / 1000) * loadsPer1000) : 0;

  return {
    blockSizeCm,
    plannedPieces: safePlanned,
    wasteRate: learned.rate,
    expectedWastePieces,
    expectedFinishedPieces,
    expectedCementBags,
    expectedCementWasteBags: Math.round(expectedCementBags * learned.rate),
    expectedPolicheLoads,
    expectedPolicheWasteLoads: roundPolicheLoads(expectedPolicheLoads * learned.rate),
    sampleBatches: learned.sampleBatches,
    confidence: learned.confidence,
    fromDefault: learned.fromDefault,
  };
}

/**
 * Any real batch history is preferred over the flat default — even a single completed
 * batch's observed waste rate is a better estimate than an assumed 3%. Confidence (via
 * confidenceFromSamples) already scales down for thin sample sizes, so callers can see
 * how much to trust the number without us discarding real data in favor of a guess.
 */
export function getLearnedWasteRate(
  intelligence: ProductionIntelligence | null | undefined,
  blockSizeCm: BlockSizeCm
): { rate: number; sampleBatches: number; confidence: number; fromDefault: boolean } {
  const sizeIntel = intelligence?.metrics.by_block_size[String(blockSizeCm)];
  if (!sizeIntel || sizeIntel.completed_batches < 1) {
    return {
      rate: DEFAULT_WASTE_RATE,
      sampleBatches: sizeIntel?.completed_batches ?? 0,
      confidence: sizeIntel?.confidence ?? 0.5,
      fromDefault: true,
    };
  }
  return {
    rate: sizeIntel.avg_waste_rate,
    sampleBatches: sizeIntel.completed_batches,
    confidence: sizeIntel.confidence,
    fromDefault: false,
  };
}

export function getLearnedYieldRate(
  intelligence: ProductionIntelligence | null | undefined,
  blockSizeCm: BlockSizeCm
): number {
  const sizeIntel = intelligence?.metrics.by_block_size[String(blockSizeCm)];
  if (!sizeIntel || sizeIntel.completed_batches < 1) return 0.97;
  return sizeIntel.avg_yield_rate;
}
