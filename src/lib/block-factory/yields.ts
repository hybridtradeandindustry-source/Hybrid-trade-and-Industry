/** Block factory production yields and material conversion rules. */

export const CEMENT_KG_PER_BAG = 45;
export const DEFAULT_BATCH_PLANNED_QTY = 50_000;
export const DEFAULT_WASTE_RATE = 0.03;
export const PRODUCTION_CYCLE_DAYS = 12;

export type BlockSizeCm = 20 | 15 | 10 | 24;

export type BlockYieldSpec = {
  sizeCm: BlockSizeCm;
  label: string;
  blocksPerCementBag: number;
  platesPerBag: number;
  blocksPerPlate: number;
  blocksPerPolicheLoad: number;
  skuSuffix: string;
};

export const BLOCK_YIELDS: Record<BlockSizeCm, BlockYieldSpec> = {
  20: {
    sizeCm: 20,
    label: "20cm",
    blocksPerCementBag: 64,
    platesPerBag: 8,
    blocksPerPlate: 8,
    blocksPerPolicheLoad: 1120,
    skuSuffix: "20",
  },
  15: {
    sizeCm: 15,
    label: "15cm",
    blocksPerCementBag: 80,
    platesPerBag: 8,
    blocksPerPlate: 10,
    blocksPerPolicheLoad: 1400,
    skuSuffix: "15",
  },
  10: {
    sizeCm: 10,
    label: "10cm",
    blocksPerCementBag: 112,
    platesPerBag: 8,
    blocksPerPlate: 14,
    blocksPerPolicheLoad: 1750,
    skuSuffix: "10",
  },
  24: {
    sizeCm: 24,
    label: "24cm",
    blocksPerCementBag: 72,
    platesPerBag: 8,
    blocksPerPlate: 9,
    blocksPerPolicheLoad: 900,
    skuSuffix: "24",
  },
};

export const BLOCK_SIZE_OPTIONS = (Object.keys(BLOCK_YIELDS) as unknown as BlockSizeCm[]).map(
  (size) => ({
    value: size,
    label: BLOCK_YIELDS[size].label,
  })
);

export type MaterialConsumption = {
  blockSizeCm: BlockSizeCm;
  blockQuantity: number;
  cementBags: number;
  cementKg: number;
  policheLoads: number;
  plates: number;
};

export type WasteAnalysis = {
  plannedQuantity: number;
  expectedWasteRate: number;
  expectedWastePieces: number;
  expectedFinished: number;
  actualProduced: number;
  actualWastePieces: number;
  actualFinished: number;
  actualWasteRate: number;
  varianceRatePoints: number;
};

export const POLICHE_LOAD_DECIMALS = 2;

/** Poliche is tracked in fractional loads (e.g. 2.56), not rounded up to whole loads. */
export function roundPolicheLoads(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const factor = 10 ** POLICHE_LOAD_DECIMALS;
  return Math.round(value * factor) / factor;
}

export function calculateMaterialConsumption(
  blockSizeCm: BlockSizeCm,
  blockQuantity: number,
  yieldsMap: Record<BlockSizeCm, BlockYieldSpec> = BLOCK_YIELDS,
  cementKgPerBag: number = CEMENT_KG_PER_BAG
): MaterialConsumption {
  const spec = yieldsMap[blockSizeCm];
  const qty = Math.max(0, blockQuantity);
  const cementBags = qty > 0 ? Math.ceil(qty / spec.blocksPerCementBag) : 0;
  const policheLoads =
    qty > 0 ? roundPolicheLoads(qty / spec.blocksPerPolicheLoad) : 0;
  const plates = qty > 0 ? Math.ceil(qty / spec.blocksPerPlate) : 0;

  return {
    blockSizeCm,
    blockQuantity: qty,
    cementBags,
    cementKg: cementBags * cementKgPerBag,
    policheLoads,
    plates,
  };
}

export function predictProductionOutcome(
  plannedQuantity: number,
  wasteRate = DEFAULT_WASTE_RATE
): { expectedWastePieces: number; expectedFinished: number } {
  const planned = Math.max(0, plannedQuantity);
  const expectedWastePieces = Math.round(planned * wasteRate);
  return {
    expectedWastePieces,
    expectedFinished: planned - expectedWastePieces,
  };
}

export function analyzeWaste(
  plannedQuantity: number,
  actualProduced: number,
  actualWastePieces: number,
  expectedWasteRate = DEFAULT_WASTE_RATE
): WasteAnalysis {
  const { expectedWastePieces, expectedFinished } = predictProductionOutcome(
    plannedQuantity,
    expectedWasteRate
  );
  const actualFinished = Math.max(0, actualProduced - actualWastePieces);
  const actualWasteRate = actualProduced > 0 ? actualWastePieces / actualProduced : 0;

  return {
    plannedQuantity,
    expectedWasteRate,
    expectedWastePieces,
    expectedFinished,
    actualProduced,
    actualWastePieces,
    actualFinished,
    actualWasteRate,
    varianceRatePoints: (actualWasteRate - expectedWasteRate) * 100,
  };
}

export function finishedGoodsSku(sizeCm: BlockSizeCm): string {
  return `BLK-FG-${BLOCK_YIELDS[sizeCm].skuSuffix}`;
}

export function parseBlockSizeCm(value: unknown): BlockSizeCm | null {
  const n = Number(value);
  if (n === 20 || n === 15 || n === 10 || n === 24) return n;
  return null;
}
