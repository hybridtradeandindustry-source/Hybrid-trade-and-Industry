import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import type { ReconciliationRecord, ReconciliationStatus, SageTransaction } from "@/types";

type ReconciliationInput = {
  factory_id?: string | null;
  operational_record_type: string;
  operational_record_id: string;
  operational_amount: number;
  sage_amount?: number | null;
  status?: ReconciliationStatus;
};

type SageTransactionInput = {
  factory_id?: string | null;
  description?: string;
  amount: number;
  transaction_type?: string;
  transaction_date?: string;
  sage_id?: string;
};

export async function createReconciliationRecord(
  input: ReconciliationInput,
  user: ApiUser
): Promise<ReconciliationRecord> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reconciliation_records")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id || null,
      operational_record_type: input.operational_record_type,
      operational_record_id: input.operational_record_id.trim(),
      operational_amount: input.operational_amount,
      sage_amount: input.sage_amount ?? null,
      status: input.status ?? "pending",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const record = data as ReconciliationRecord;
  if (record.status === "pending" || record.status === "variance") {
    await import("@/lib/services/notifications").then((m) =>
      m.notifyReconciliationPending(
        record.id,
        `${record.operational_record_type} variance ${record.variance ?? 0}`,
        user
      )
    );
  }
  return record;
}

export async function updateReconciliationRecord(
  id: string,
  input: Partial<ReconciliationInput>,
  _user: ApiUser
): Promise<ReconciliationRecord | null> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.factory_id !== undefined) patch.factory_id = input.factory_id || null;
  if (input.operational_record_type !== undefined) patch.operational_record_type = input.operational_record_type;
  if (input.operational_record_id !== undefined) patch.operational_record_id = input.operational_record_id.trim();
  if (input.operational_amount !== undefined) patch.operational_amount = input.operational_amount;
  if (input.sage_amount !== undefined) patch.sage_amount = input.sage_amount;
  if (input.status !== undefined) patch.status = input.status;

  const { data, error } = await supabase
    .from("reconciliation_records")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", _user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as ReconciliationRecord;
}

export async function deleteReconciliationRecord(id: string, user: ApiUser): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("reconciliation_records")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
  return true;
}

export async function createSageTransactionRecord(
  input: SageTransactionInput,
  user: ApiUser
): Promise<SageTransaction> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sage_transactions")
    .insert({
      organization_id: user.organization_id,
      sage_id: input.sage_id ?? `MANUAL-${Date.now()}`,
      transaction_date: input.transaction_date ?? new Date().toISOString().slice(0, 10),
      description: input.description ?? "",
      amount: input.amount,
      transaction_type: input.transaction_type ?? "other",
      factory_id: input.factory_id || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SageTransaction;
}

export async function updateSageTransactionRecord(
  id: string,
  input: Partial<SageTransactionInput>,
  user: ApiUser
): Promise<SageTransaction | null> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.factory_id !== undefined) patch.factory_id = input.factory_id || null;
  if (input.description !== undefined) patch.description = input.description;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.transaction_type !== undefined) patch.transaction_type = input.transaction_type;
  if (input.transaction_date !== undefined) patch.transaction_date = input.transaction_date;
  if (input.sage_id !== undefined) patch.sage_id = input.sage_id;

  const { data, error } = await supabase
    .from("sage_transactions")
    .update(patch)
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as SageTransaction;
}

export async function deleteSageTransactionRecord(id: string, user: ApiUser): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("sage_transactions")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);

  if (error) throw new Error(error.message);
  return true;
}
