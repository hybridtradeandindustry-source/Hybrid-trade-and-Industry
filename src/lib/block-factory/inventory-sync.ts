import {
  calculateMaterialConsumption,
  type BlockSizeCm,
  type MaterialConsumption,
  finishedGoodsSku,
} from "@/lib/block-factory/yields";
import type { ProductionBatch } from "@/types";
import { FACTORY_IDS } from "@/types";

export const BLOCK_FACTORY_SKUS = {
  cement: "BLK-RM-CEM",
  poliche: "BLK-RM-POL",
  /** Purchased like cement/poliche, but not consumed by the production yield model. */
  ashwa: "BLK-RM-ASH",
  wip: "BLK-WIP-001",
  waste: "BLK-WIP-WASTE",
} as const;

type MovementInput = {
  factory_id: string;
  item_id: string;
  quantity: number;
  movement_type: string;
  notes?: string;
  reference_type?: string;
  reference_id?: string;
  reason?: string;
  source_module?: string;
};

type StoreLike = {
  inventory: Array<{ id: string; factory_id: string; sku: string; is_active: boolean }>;
  batches: ProductionBatch[];
  createInventoryMovement: (input: MovementInput, userId: string) => unknown;
};

function findSku(store: StoreLike, sku: string) {
  return store.inventory.find(
    (i) => i.factory_id === FACTORY_IDS.block && i.sku === sku && i.is_active
  );
}

function findFgBySize(store: StoreLike, sizeCm: BlockSizeCm) {
  return findSku(store, finishedGoodsSku(sizeCm));
}

/** Phase 1 — production: deduct raw materials, add blocks entering cure. */
export function applyBlockProductionPhase1(
  store: StoreLike,
  input: {
    blockSizeCm: BlockSizeCm;
    totalProduced: number;
    goodEnteringCure: number;
    batchNumber: string;
    batchId?: string;
    userId: string;
  }
): MaterialConsumption {
  const consumption = calculateMaterialConsumption(input.blockSizeCm, input.totalProduced);
  const cement = findSku(store, BLOCK_FACTORY_SKUS.cement);
  const poliche = findSku(store, BLOCK_FACTORY_SKUS.poliche);
  const wip = findSku(store, BLOCK_FACTORY_SKUS.wip);

  if (cement && consumption.cementBags > 0) {
    store.createInventoryMovement(
      {
        factory_id: FACTORY_IDS.block,
        item_id: cement.id,
        quantity: -consumption.cementBags,
        movement_type: "production_out",
        notes: `Production ${input.batchNumber}: ${consumption.cementBags} bags (${consumption.cementKg} kg) cement for ${input.blockSizeCm}cm blocks`,
        reason: "production_consumption",
        source_module: "production",
        reference_type: input.batchId ? "production_batches" : undefined,
        reference_id: input.batchId,
      },
      input.userId
    );
  }

  if (poliche && consumption.policheLoads > 0) {
    store.createInventoryMovement(
      {
        factory_id: FACTORY_IDS.block,
        item_id: poliche.id,
        quantity: -consumption.policheLoads,
        movement_type: "production_out",
        notes: `Production ${input.batchNumber}: ${consumption.policheLoads} poliche load(s) for ${input.blockSizeCm}cm blocks`,
        reason: "production_consumption",
        source_module: "production",
        reference_type: input.batchId ? "production_batches" : undefined,
        reference_id: input.batchId,
      },
      input.userId
    );
  }

  if (wip && input.goodEnteringCure > 0) {
    store.createInventoryMovement(
      {
        factory_id: FACTORY_IDS.block,
        item_id: wip.id,
        quantity: input.goodEnteringCure,
        movement_type: "production_in",
        notes: `Production ${input.batchNumber}: ${input.goodEnteringCure} blocks entering curing`,
        reason: "wip_intake",
        source_module: "production",
        reference_type: input.batchId ? "production_batches" : undefined,
        reference_id: input.batchId,
      },
      input.userId
    );
  }

  return consumption;
}

/** Phase 2 — curing complete: move finished blocks from WIP to FG inventory. */
export function applyBlockCuringComplete(
  store: StoreLike,
  input: {
    blockSizeCm: BlockSizeCm;
    goodCount: number;
    wasteCount: number;
    batchNumber: string;
    batchId?: string;
    userId: string;
  }
): void {
  const wip = findSku(store, BLOCK_FACTORY_SKUS.wip);
  const fg = findFgBySize(store, input.blockSizeCm);
  const wasteSku = findSku(store, BLOCK_FACTORY_SKUS.waste);
  const removedFromWip = input.goodCount + input.wasteCount;

  if (wip && removedFromWip > 0) {
    store.createInventoryMovement(
      {
        factory_id: FACTORY_IDS.block,
        item_id: wip.id,
        quantity: -removedFromWip,
        movement_type: "production_out",
        notes: `Curing complete ${input.batchNumber}: ${removedFromWip} blocks leave curing`,
        reason: "curing_complete",
        source_module: "production",
        reference_type: input.batchId ? "production_batches" : undefined,
        reference_id: input.batchId,
      },
      input.userId
    );
  }

  if (fg && input.goodCount > 0) {
    store.createInventoryMovement(
      {
        factory_id: FACTORY_IDS.block,
        item_id: fg.id,
        quantity: input.goodCount,
        movement_type: "production_in",
        notes: `Curing complete ${input.batchNumber}: ${input.goodCount} × ${input.blockSizeCm}cm blocks`,
        reason: "finished_goods",
        source_module: "production",
        reference_type: input.batchId ? "production_batches" : undefined,
        reference_id: input.batchId,
      },
      input.userId
    );
  }

  if (wasteSku && input.wasteCount > 0) {
    store.createInventoryMovement(
      {
        factory_id: FACTORY_IDS.block,
        item_id: wasteSku.id,
        quantity: input.wasteCount,
        movement_type: "damage_return",
        notes: `Curing waste ${input.batchNumber}: ${input.wasteCount} blocks rejected`,
        reason: "production_waste",
        source_module: "production",
        reference_type: input.batchId ? "production_batches" : undefined,
        reference_id: input.batchId,
      },
      input.userId
    );
  }
}

export function resolveBatchBlockSize(
  store: StoreLike,
  batchId?: string | null
): BlockSizeCm | null {
  if (!batchId) return null;
  const batch = store.batches.find((b) => b.id === batchId);
  if (!batch?.block_size_cm) return null;
  return batch.block_size_cm as BlockSizeCm;
}

export function itemIdForMaterialType(
  store: StoreLike,
  materialType: string
): string | null {
  if (materialType === "cement") return findSku(store, BLOCK_FACTORY_SKUS.cement)?.id ?? null;
  if (materialType === "poliche") return findSku(store, BLOCK_FACTORY_SKUS.poliche)?.id ?? null;
  return null;
}
