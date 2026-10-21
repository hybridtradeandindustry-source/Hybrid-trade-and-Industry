import { createServiceClient } from "@/lib/supabase/server";

/**
 * Batch-completion-time inventory posting was retired — finished-goods stock is now kept in
 * sync directly from daily logs (see production-daily-log.ts), and WIP intake at batch
 * creation was removed since there's no longer a fixed-quantity/fixed-date batch cycle to
 * track. This file now only holds cleanup used when a batch is deleted or its creation fails.
 */

export async function clearBatchMaterialConsumption(batchId: string): Promise<void> {
  const supabase = await createServiceClient();
  const { error } = await supabase
    .from("inventory_movements")
    .delete()
    .eq("reference_type", "production_batches")
    .eq("reference_id", batchId);

  if (error) throw new Error(error.message);

  await supabase
    .from("sage_transactions")
    .delete()
    .eq("reference", batchId);
}
