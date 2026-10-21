import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import type { HrLeaveBalanceLedgerEntry } from "@/types";

export type LeaveLedgerTransactionType =
  | "opening"
  | "accrual"
  | "used"
  | "pending"
  | "carry_forward"
  | "adjustment"
  | "encashment"
  | "expired"
  | "cancelled";

export async function fetchLeaveLedger(
  orgId: string,
  employeeId?: string,
  leaveType?: string
): Promise<HrLeaveBalanceLedgerEntry[]> {
  const supabase = await createClient();
  let query = supabase
    .from("hr_leave_balance_ledger")
    .select("*")
    .eq("organization_id", orgId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (leaveType) query = query.eq("leave_type", leaveType.toLowerCase());
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as HrLeaveBalanceLedgerEntry),
    days_delta: Number(row.days_delta),
    balance_after: Number(row.balance_after),
  }));
}

export async function getLeaveBalanceSnapshot(
  orgId: string,
  employeeId: string,
  leaveType: string
): Promise<{ balance: number; used: number; pending: number }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .eq("leave_type", leaveType.toLowerCase())
    .maybeSingle();

  const { data: pendingLeave } = await supabase
    .from("leave_requests")
    .select("days_count")
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .eq("leave_type", leaveType.toLowerCase())
    .eq("status", "pending");

  const pending = (pendingLeave ?? []).reduce((s, r) => s + Number(r.days_count ?? 0), 0);
  const balance = Number(data?.balance_days ?? 0);
  const used = Number(data?.used_days ?? 0);
  return { balance, used, pending };
}

async function appendLedgerEntry(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  input: {
    organization_id: string;
    employee_id: string;
    leave_type: string;
    leave_type_id?: string | null;
    transaction_type: LeaveLedgerTransactionType;
    days_delta: number;
    balance_after: number;
    reference_type?: string;
    reference_id?: string;
    reason?: string;
    effective_date?: string;
    created_by?: string;
  }
): Promise<void> {
  const { error } = await service.from("hr_leave_balance_ledger").insert({
    organization_id: input.organization_id,
    employee_id: input.employee_id,
    leave_type: input.leave_type.toLowerCase(),
    leave_type_id: input.leave_type_id ?? null,
    transaction_type: input.transaction_type,
    days_delta: input.days_delta,
    balance_after: input.balance_after,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    reason: input.reason ?? null,
    effective_date: input.effective_date ?? new Date().toISOString().slice(0, 10),
    created_by: input.created_by ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function recordLeaveUsage(
  orgId: string,
  employeeId: string,
  leaveType: string,
  days: number,
  reference: { type: string; id: string },
  userId?: string,
  leaveTypeId?: string | null
): Promise<void> {
  const service = await createServiceClient();
  const { data: balance } = await service
    .from("leave_balances")
    .select("*")
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .eq("leave_type", leaveType.toLowerCase())
    .maybeSingle();

  if (!balance) throw new Error("Leave balance record not found");

  const newUsed = Number(balance.used_days) + days;
  const remaining = Number(balance.balance_days) - newUsed;

  await service
    .from("leave_balances")
    .update({ used_days: newUsed })
    .eq("id", balance.id);

  await appendLedgerEntry(service, {
    organization_id: orgId,
    employee_id: employeeId,
    leave_type: leaveType,
    leave_type_id: leaveTypeId ?? balance.leave_type_id,
    transaction_type: "used",
    days_delta: -days,
    balance_after: remaining,
    reference_type: reference.type,
    reference_id: reference.id,
    created_by: userId,
  });
}

export async function adjustLeaveBalance(
  input: {
    employee_id: string;
    leave_type: string;
    days_delta: number;
    reason: string;
    transaction_type?: LeaveLedgerTransactionType;
  },
  user: ApiUser
): Promise<HrLeaveBalanceLedgerEntry> {
  const service = await createServiceClient();
  const leaveType = input.leave_type.toLowerCase();

  const { data: balance, error: balError } = await service
    .from("leave_balances")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("employee_id", input.employee_id)
    .eq("leave_type", leaveType)
    .maybeSingle();
  if (balError) throw new Error(balError.message);

  let balanceId = balance?.id as string | undefined;
  let newBalanceDays = Number(balance?.balance_days ?? 0) + input.days_delta;
  const usedDays = Number(balance?.used_days ?? 0);

  if (!balance) {
    const { data: inserted, error } = await service
      .from("leave_balances")
      .insert({
        organization_id: user.organization_id,
        employee_id: input.employee_id,
        leave_type: leaveType,
        balance_days: Math.max(0, input.days_delta),
        used_days: 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    balanceId = inserted.id;
    newBalanceDays = Number(inserted.balance_days);
  } else {
    await service
      .from("leave_balances")
      .update({ balance_days: Math.max(0, newBalanceDays) })
      .eq("id", balance.id);
  }

  const balanceAfter = Math.max(0, newBalanceDays - usedDays);
  const { data: ledger, error: ledgerError } = await service
    .from("hr_leave_balance_ledger")
    .insert({
      organization_id: user.organization_id,
      employee_id: input.employee_id,
      leave_type: leaveType,
      leave_type_id: balance?.leave_type_id ?? null,
      transaction_type: input.transaction_type ?? "adjustment",
      days_delta: input.days_delta,
      balance_after: balanceAfter,
      reason: input.reason.trim(),
      created_by: user.id,
    })
    .select("*")
    .single();
  if (ledgerError) throw new Error(ledgerError.message);
  void balanceId;
  return ledger as HrLeaveBalanceLedgerEntry;
}

export async function reverseLeaveUsage(
  orgId: string,
  employeeId: string,
  leaveType: string,
  days: number,
  reference: { type: string; id: string },
  userId?: string
): Promise<void> {
  const service = await createServiceClient();
  const { data: balance } = await service
    .from("leave_balances")
    .select("*")
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .eq("leave_type", leaveType.toLowerCase())
    .maybeSingle();
  if (!balance) return;

  const newUsed = Math.max(0, Number(balance.used_days) - days);
  await service.from("leave_balances").update({ used_days: newUsed }).eq("id", balance.id);

  const remaining = Number(balance.balance_days) - newUsed;
  await appendLedgerEntry(service, {
    organization_id: orgId,
    employee_id: employeeId,
    leave_type: leaveType,
    leave_type_id: balance.leave_type_id,
    transaction_type: "cancelled",
    days_delta: days,
    balance_after: remaining,
    reference_type: reference.type,
    reference_id: reference.id,
    reason: "Leave cancelled or rejected — balance restored",
    created_by: userId,
  });
}
