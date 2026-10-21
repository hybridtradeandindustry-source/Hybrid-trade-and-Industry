import {
  DEFAULT_WASTE_RATE,
  analyzeWaste,
  calculateMaterialConsumption,
  predictProductionOutcome,
  type BlockSizeCm,
  type BlockYieldSpec,
} from "@/lib/block-factory/yields";
import type { ProductionBatch, ProductionCount } from "@/types";
import { computeBatchTrailStats } from "@/lib/production/stats";
import {
  computeProductionIntelligence,
  getLearnedWasteRate,
} from "@/lib/ai/production-intelligence";
import type { ProductionIntelligence } from "@/types/production-intelligence";

export type ProductionPrediction = {
  plannedQuantity: number;
  blockSizeCm: BlockSizeCm;
  historicalWasteRate: number;
  defaultWasteRate: number;
  expectedWastePieces: number;
  expectedFinished: number;
  expectedCementBags: number;
  expectedCementKg: number;
  expectedPolicheLoads: number;
  confidence: number;
  sampleBatches: number;
  fromDefault: boolean;
  insight: string;
};

export function computeHistoricalWasteRate(
  batches: ProductionBatch[],
  counts: ProductionCount[],
  blockSizeCm?: BlockSizeCm
): number {
  if (blockSizeCm) {
    const intelligence = computeProductionIntelligence({
      organizationId: batches[0]?.organization_id ?? "",
      factoryId: batches[0]?.factory_id ?? "",
      batches,
      counts,
    });
    return getLearnedWasteRate(intelligence, blockSizeCm).rate;
  }

  const completed = batches.filter((b) => b.status === "completed" && b.planned_quantity);
  if (completed.length === 0) return DEFAULT_WASTE_RATE;

  let totalPlanned = 0;
  let totalWaste = 0;

  for (const batch of completed) {
    const trail = computeBatchTrailStats(counts.filter((c) => c.batch_id === batch.id));
    const produced = trail.total || batch.planned_quantity || 0;
    const waste = Math.max(0, trail.total - trail.output);
    totalPlanned += batch.planned_quantity ?? produced;
    totalWaste += waste || batch.actual_waste || 0;
  }

  if (totalPlanned <= 0) return DEFAULT_WASTE_RATE;
  return Math.min(0.15, Math.max(0.01, totalWaste / totalPlanned));
}

export function predictBatchProduction(input: {
  plannedQuantity: number;
  blockSizeCm: BlockSizeCm;
  batches: ProductionBatch[];
  counts: ProductionCount[];
  intelligence?: ProductionIntelligence | null;
  yieldsMap?: Record<BlockSizeCm, BlockYieldSpec>;
  cementKgPerBag?: number;
}): ProductionPrediction {
  const intelligence =
    input.intelligence ??
    computeProductionIntelligence({
      organizationId: input.batches[0]?.organization_id ?? "",
      factoryId: input.batches[0]?.factory_id ?? "",
      batches: input.batches,
      counts: input.counts,
    });

  const learned = getLearnedWasteRate(intelligence, input.blockSizeCm);
  const historicalWasteRate = learned.rate;
  const { expectedWastePieces, expectedFinished } = predictProductionOutcome(
    input.plannedQuantity,
    historicalWasteRate
  );
  const materials = calculateMaterialConsumption(
    input.blockSizeCm,
    input.plannedQuantity,
    input.yieldsMap,
    input.cementKgPerBag
  );

  const sizeIntel = intelligence.metrics.by_block_size[String(input.blockSizeCm)];
  const varianceFromDefault = ((historicalWasteRate - DEFAULT_WASTE_RATE) * 100).toFixed(1);

  const insight = !learned.fromDefault
    ? `Based on ${learned.sampleBatches} completed ${input.blockSizeCm}cm batches, learned waste is ${(historicalWasteRate * 100).toFixed(1)}% (${Number(varianceFromDefault) >= 0 ? "+" : ""}${varianceFromDefault}pp vs 3% default). Last batch: ${((sizeIntel?.last_batch_waste_rate ?? historicalWasteRate) * 100).toFixed(1)}%.`
    : "Using default 3% waste rate until at least 2 completed batches exist for this block size.";

  return {
    plannedQuantity: input.plannedQuantity,
    blockSizeCm: input.blockSizeCm,
    historicalWasteRate,
    defaultWasteRate: DEFAULT_WASTE_RATE,
    expectedWastePieces,
    expectedFinished,
    expectedCementBags: materials.cementBags,
    expectedCementKg: materials.cementKg,
    expectedPolicheLoads: materials.policheLoads,
    confidence: learned.confidence,
    sampleBatches: learned.sampleBatches,
    fromDefault: learned.fromDefault,
    insight,
  };
}

export function analyzeBatchWasteFromHistory(
  batch: ProductionBatch,
  counts: ProductionCount[],
  batches: ProductionBatch[]
): ReturnType<typeof analyzeWaste> {
  const size = (batch.block_size_cm as BlockSizeCm) || 20;
  const historicalRate = computeHistoricalWasteRate(batches, counts, size);
  const trail = computeBatchTrailStats(counts.filter((c) => c.batch_id === batch.id));
  const produced = trail.total || batch.actual_output || batch.planned_quantity || 0;
  const waste = Math.max(0, trail.total - trail.output) || batch.actual_waste || 0;

  return analyzeWaste(batch.planned_quantity ?? produced, produced, waste, historicalRate);
}
