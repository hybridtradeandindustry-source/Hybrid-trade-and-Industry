import { createServiceClient } from "@/lib/supabase/server";
import { finishedGoodsSku, parseBlockSizeCm } from "@/lib/block-factory/yields";
import { FACTORY_IDS } from "@/types";

type ServiceClient = Awaited<ReturnType<typeof createServiceClient>>;

/**
 * How much of a batch is still sellable.
 *
 * "Produced" is what the daily logs recorded — the same source the order form sizes the
 * batch dropdown by and that validateBatchLineQuantities accepts an order against. Reading
 * it off inventory_movements instead disagrees with both whenever the finished-goods sync
 * hasn't caught up, and this allocator would then silently write no allocation for an order
 * the server had just approved.
 */
export async function getBatchAvailableQuantity(
  supabase: ServiceClient,
  batchId: string,
  orgId: string
): Promise<number> {
  return getBatchAvailable(supabase, batchId, orgId);
}

async function getBatchAvailable(
  supabase: ServiceClient,
  batchId: string,
  orgId: string
): Promise<number> {
  const { data: logRows } = await supabase
    .from("production_daily_logs")
    .select("calculated_pieces")
    .eq("batch_id", batchId)
    .eq("organization_id", orgId);

  const produced = (logRows ?? []).reduce(
    (sum, row) => sum + Number(row.calculated_pieces ?? 0),
    0
  );
  if (produced <= 0) return 0;

  const { data: allocRows } = await supabase
    .from("batch_sale_allocations")
    .select("quantity")
    .eq("batch_id", batchId);
  const alreadyAllocated = (allocRows ?? []).reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
    0
  );

  return Math.max(0, produced - alreadyAllocated);
}

async function insertAllocation(
  supabase: ServiceClient,
  input: { organizationId: string; itemId: string; orderId: string; orderItemId?: string | null },
  batchId: string,
  quantity: number
): Promise<void> {
  const { error } = await supabase.from("batch_sale_allocations").insert({
    organization_id: input.organizationId,
    batch_id: batchId,
    order_id: input.orderId,
    order_item_id: input.orderItemId ?? null,
    item_id: input.itemId,
    quantity,
  });
  if (error) throw new Error(error.message);
}

/**
 * Allocate a sale against the production batch(es) that produced the SKU's finished goods —
 * additive only, never touches inventory_movements/quantities, just records provenance so
 * "amount sold from batch X" is answerable after stock is pooled. No-op for non-block-
 * finished-goods SKUs (raw materials, recycling FG, etc.).
 *
 * When the order line explicitly chose a batch (`preferredBatchId`), allocate directly to it
 * (this is the normal path now that order creation lets staff pick a batch). Falls back to
 * FIFO-by-oldest-batch for any quantity beyond what the preferred batch has left, and for
 * lines with no batch chosen at all (recycling, or legacy pooled-stock orders).
 */
export async function allocateSaleToBatches(
  supabase: ServiceClient,
  input: {
    organizationId: string;
    itemId: string;
    sku: string;
    quantity: number;
    orderId: string;
    orderItemId?: string | null;
    preferredBatchId?: string | null;
  }
): Promise<void> {
  if (!input.sku.startsWith("BLK-FG-") || input.quantity <= 0) return;

  let remaining = input.quantity;

  if (input.preferredBatchId) {
    const available = await getBatchAvailable(
      supabase,
      input.preferredBatchId,
      input.organizationId
    );
    if (available > 0) {
      const take = Math.min(available, remaining);
      await insertAllocation(supabase, input, input.preferredBatchId, take);
      remaining -= take;
    }
  }

  if (remaining <= 0) return;

  const { data: batches } = await supabase
    .from("production_batches")
    .select("id, block_size_cm, production_date, created_at")
    .eq("organization_id", input.organizationId)
    .eq("factory_id", FACTORY_IDS.block)
    .order("production_date", { ascending: true })
    .order("created_at", { ascending: true });

  const matchingBatches = (batches ?? []).filter((b) => {
    if (b.id === input.preferredBatchId) return false;
    const size = parseBlockSizeCm(b.block_size_cm);
    return size != null && finishedGoodsSku(size) === input.sku;
  });

  for (const batch of matchingBatches) {
    if (remaining <= 0) break;

    const available = await getBatchAvailable(supabase, batch.id, input.organizationId);
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    await insertAllocation(supabase, input, batch.id, take);
    remaining -= take;
  }
  // Any remaining quantity beyond tracked batch production (e.g. opening/seed stock with
  // no batch record) is intentionally left unallocated.
}

export type BatchSaleSummary = {
  totalSold: number;
  allocations: Array<{
    orderId: string;
    orderNumber: string;
    customerName: string | null;
    quantity: number;
    createdAt: string;
  }>;
};

export async function getBatchSaleSummary(
  batchId: string,
  orgId: string
): Promise<BatchSaleSummary> {
  const supabase = await createServiceClient();

  const { data: allocations, error } = await supabase
    .from("batch_sale_allocations")
    .select("quantity, created_at, orders(id, order_number, customers(name))")
    .eq("batch_id", batchId)
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  type Row = {
    quantity: number;
    created_at: string;
    orders: { id: string; order_number: string; customers: { name: string } | null } | null;
  };

  const rows = (allocations ?? []) as unknown as Row[];

  return {
    totalSold: rows.reduce((sum, r) => sum + Number(r.quantity ?? 0), 0),
    allocations: rows.map((r) => ({
      orderId: r.orders?.id ?? "",
      orderNumber: r.orders?.order_number ?? "—",
      customerName: r.orders?.customers?.name ?? null,
      quantity: Number(r.quantity ?? 0),
      createdAt: r.created_at,
    })),
  };
}
