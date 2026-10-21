import {
  BLOCK_YIELDS,
  CEMENT_KG_PER_BAG,
  DEFAULT_WASTE_RATE,
  PRODUCTION_CYCLE_DAYS,
  roundPolicheLoads,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import {
  getLearnedWasteRate,
  getLearnedYieldRate,
} from "@/lib/ai/production-intelligence";
import type { ProductionIntelligence } from "@/types/production-intelligence";
import type {
  CapacityInventorySnapshot,
  CapacityLimitingFactor,
  CapacityPrediction,
  CapacityResult,
} from "@/types/production-intelligence";

export type CapacityInput = {
  organizationId: string;
  factoryId: string;
  cementBags: number;
  cementKg?: number;
  policheLoads: number;
  intelligence: ProductionIntelligence;
  blockSizes?: BlockSizeCm[];
};

const DEFAULT_SIZES: BlockSizeCm[] = [20, 15, 10, 24];

function theoreticalBagsPer1000(size: BlockSizeCm): number {
  const blocksPerBag = BLOCK_YIELDS[size].blocksPerCementBag;
  return blocksPerBag > 0 ? 1000 / blocksPerBag : 0;
}

function theoreticalLoadsPer1000(size: BlockSizeCm): number {
  const blocksPerLoad = BLOCK_YIELDS[size].blocksPerPolicheLoad;
  return blocksPerLoad > 0 ? 1000 / blocksPerLoad : 0;
}

export function predictCapacityForSize(
  size: BlockSizeCm,
  inventory: CapacityInventorySnapshot,
  intelligence: ProductionIntelligence
): CapacityPrediction {
  const spec = BLOCK_YIELDS[size];
  const learned = getLearnedWasteRate(intelligence, size);
  const wasteRate = learned.rate;
  const yieldRate = getLearnedYieldRate(intelligence, size);
  const sizeIntel = intelligence.metrics.by_block_size[String(size)];

  const bagsPer1000 =
    sizeIntel && sizeIntel.avg_cement_bags_per_1000_blocks > 0
      ? sizeIntel.avg_cement_bags_per_1000_blocks
      : theoreticalBagsPer1000(size);
  const loadsPer1000 =
    sizeIntel && sizeIntel.avg_poliche_loads_per_1000_blocks > 0
      ? sizeIntel.avg_poliche_loads_per_1000_blocks
      : theoreticalLoadsPer1000(size);

  const cementLimitRaw =
    bagsPer1000 > 0 ? Math.floor((inventory.cementBags / bagsPer1000) * 1000) : 0;
  const policheLimitRaw =
    loadsPer1000 > 0 ? Math.floor((inventory.policheLoads / loadsPer1000) * 1000) : 0;

  const cementLimit = Math.floor(cementLimitRaw * (1 - wasteRate) * yieldRate);
  const policheLimit = Math.floor(policheLimitRaw * (1 - wasteRate) * yieldRate);

  let limiting_factor: CapacityLimitingFactor = "balanced";
  let max_blocks = Math.min(cementLimit, policheLimit);

  if (inventory.cementBags <= 0 && inventory.policheLoads <= 0) {
    limiting_factor = "none";
    max_blocks = 0;
  } else if (cementLimit < policheLimit) {
    limiting_factor = "cement";
  } else if (policheLimit < cementLimit) {
    limiting_factor = "poliche";
  }

  max_blocks = Math.max(0, max_blocks);
  const expected_waste_pieces = Math.round(max_blocks * wasteRate);
  const blocksPerPallet = spec.platesPerBag * spec.blocksPerPlate;
  const max_pallets = blocksPerPallet > 0 ? Math.floor(max_blocks / blocksPerPallet) : 0;

  const cement_required_bags =
    max_blocks > 0 ? Math.ceil((max_blocks / 1000) * bagsPer1000) : 0;
  const poliche_required_loads =
    max_blocks > 0 ? roundPolicheLoads((max_blocks / 1000) * loadsPer1000) : 0;

  const cycleDays = sizeIntel?.avg_cycle_days || PRODUCTION_CYCLE_DAYS;
  const avgDaily =
    cycleDays > 0 && sizeIntel && sizeIntel.completed_batches > 0
      ? Math.max(1, Math.round((sizeIntel.completed_batches > 0 ? max_blocks : 0) / cycleDays) || Math.round(50000 / cycleDays))
      : Math.round(50000 / PRODUCTION_CYCLE_DAYS);
  const estimated_production_days =
    max_blocks > 0 ? Math.max(1, Math.ceil(max_blocks / Math.max(avgDaily, 1))) : 0;

  return {
    block_size_cm: size,
    label: spec.label,
    max_blocks,
    max_pallets,
    expected_waste_pct: Number((wasteRate * 100).toFixed(2)),
    expected_waste_pieces,
    cement_required_bags,
    poliche_required_loads,
    remaining_cement_bags: Math.max(0, inventory.cementBags - cement_required_bags),
    remaining_poliche_loads: roundPolicheLoads(Math.max(0, inventory.policheLoads - poliche_required_loads)),
    estimated_production_days,
    limiting_factor,
  };
}

export function computeCapacity(input: CapacityInput): CapacityResult {
  // Keep the real on-hand figures for display (poliche may be negative after
  // over-consumption). Production limits must still treat negative stock as zero.
  const inventory: CapacityInventorySnapshot = {
    cementBags: Math.max(0, input.cementBags),
    cementKg:
      input.cementKg != null
        ? Math.max(0, input.cementKg)
        : Math.max(0, input.cementBags) * CEMENT_KG_PER_BAG,
    policheLoads: Number(input.policheLoads) || 0,
  };

  const productionStock: CapacityInventorySnapshot = {
    ...inventory,
    policheLoads: Math.max(0, inventory.policheLoads),
  };

  const sizes = input.blockSizes ?? DEFAULT_SIZES;
  const predictions = sizes.map((size) =>
    predictCapacityForSize(size, productionStock, input.intelligence)
  );

  // Overall limiting factor: prefer the bottleneck of the largest capacity row (20cm default focus)
  const focus = predictions.find((p) => p.block_size_cm === 20) ?? predictions[0];
  const confidence =
    input.intelligence.sample_batches >= 5
      ? 0.9
      : input.intelligence.sample_batches >= 2
        ? 0.75
        : 0.55;

  return {
    organization_id: input.organizationId,
    factory_id: input.factoryId,
    computed_at: new Date().toISOString(),
    inventory,
    predictions,
    limiting_factor: focus?.limiting_factor ?? "none",
    confidence,
    sample_batches: input.intelligence.sample_batches,
    from_snapshot: false,
  };
}

export function emptyCapacity(
  organizationId: string,
  factoryId: string
): CapacityResult {
  return computeCapacity({
    organizationId,
    factoryId,
    cementBags: 0,
    policheLoads: 0,
    intelligence: {
      organization_id: organizationId,
      factory_id: factoryId,
      computed_at: new Date().toISOString(),
      sample_batches: 0,
      metrics: {
        by_block_size: {},
        global: {
          avg_waste_rate: DEFAULT_WASTE_RATE,
          total_completed_batches: 0,
          avg_yield_rate: 0.97,
        },
      },
      from_snapshot: false,
    },
  });
}
