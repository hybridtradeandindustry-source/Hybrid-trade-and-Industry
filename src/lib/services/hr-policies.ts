import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import type {
  HrApprovalWorkflow,
  HrBranch,
  HrCostCenter,
  HrLeavePolicyRule,
  HrShift,
  HrWorkSchedule,
} from "@/types";

function parseJsonArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === "string") {
    try {
      return JSON.parse(value).map(Number);
    } catch {
      return [1, 2, 3, 4, 5];
    }
  }
  return [1, 2, 3, 4, 5];
}

export async function fetchHrBranches(orgId: string): Promise<HrBranch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_branches").select("*").eq("organization_id", orgId).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as HrBranch[];
}

export async function fetchCostCenters(orgId: string): Promise<HrCostCenter[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_cost_centers").select("*").eq("organization_id", orgId).order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as HrCostCenter[];
}

export async function fetchShifts(orgId: string): Promise<HrShift[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("hr_shifts").select("*").eq("organization_id", orgId).order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as HrShift),
    start_time: String(row.start_time).slice(0, 5),
    end_time: String(row.end_time).slice(0, 5),
    standard_hours: Number(row.standard_hours),
    overtime_multiplier: Number(row.overtime_multiplier),
  }));
}

export async function fetchWorkSchedules(orgId: string): Promise<HrWorkSchedule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_work_schedules")
    .select("*")
    .eq("organization_id", orgId)
    .order("effective_from", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    organization_id: row.organization_id as string,
    name: row.name as string,
    working_days: parseJsonArray(row.working_days),
    weekend_days: parseJsonArray(row.weekend_days),
    effective_from: row.effective_from as string,
    effective_to: row.effective_to as string | null,
    is_default: Boolean(row.is_default),
  }));
}

export async function fetchLeavePolicyRules(orgId: string): Promise<HrLeavePolicyRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_policy_rules")
    .select("*")
    .eq("organization_id", orgId)
    .order("priority");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as HrLeavePolicyRule),
    criteria: (row.criteria ?? {}) as Record<string, unknown>,
    annual_entitlement: Number(row.annual_entitlement),
    accrual_monthly: Number(row.accrual_monthly),
    max_carry_over: Number(row.max_carry_over),
    max_consecutive_days: row.max_consecutive_days != null ? Number(row.max_consecutive_days) : null,
    min_notice_days: Number(row.min_notice_days),
  }));
}

export async function fetchApprovalWorkflows(orgId: string): Promise<HrApprovalWorkflow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_approval_workflows")
    .select("*, hr_approval_workflow_steps(*)")
    .eq("organization_id", orgId)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    organization_id: row.organization_id as string,
    code: row.code as string,
    name: row.name as string,
    entity_type: row.entity_type as string,
    is_active: Boolean(row.is_active),
    steps: ((row.hr_approval_workflow_steps ?? []) as HrApprovalWorkflow["steps"])?.sort(
      (a, b) => (a?.step_order ?? 0) - (b?.step_order ?? 0)
    ),
  }));
}

export async function upsertShift(input: Partial<HrShift> & { code: string; name: string }, user: ApiUser) {
  const supabase = await createClient();
  const payload = {
    organization_id: user.organization_id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    start_time: input.start_time ?? "08:00",
    end_time: input.end_time ?? "17:00",
    break_minutes: input.break_minutes ?? 60,
    grace_minutes: input.grace_minutes ?? 15,
    standard_hours: input.standard_hours ?? 8,
    overtime_multiplier: input.overtime_multiplier ?? 1.5,
    is_overnight: input.is_overnight ?? false,
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("hr_shifts")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", user.organization_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("hr_shifts").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertWorkSchedule(
  input: {
    id?: string;
    name: string;
    working_days: number[];
    weekend_days: number[];
    effective_from: string;
    effective_to?: string | null;
    is_default?: boolean;
  },
  user: ApiUser
) {
  const supabase = await createClient();
  if (input.is_default) {
    await supabase
      .from("hr_work_schedules")
      .update({ is_default: false })
      .eq("organization_id", user.organization_id);
  }
  const payload = {
    organization_id: user.organization_id,
    name: input.name.trim(),
    working_days: input.working_days,
    weekend_days: input.weekend_days,
    effective_from: input.effective_from,
    effective_to: input.effective_to ?? null,
    is_default: input.is_default ?? false,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("hr_work_schedules")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("hr_work_schedules").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertLeavePolicyRule(
  input: {
    id?: string;
    leave_type_id: string;
    name: string;
    priority?: number;
    criteria?: Record<string, unknown>;
    annual_entitlement: number;
    accrual_monthly?: number;
    max_carry_over?: number;
    max_consecutive_days?: number | null;
    min_notice_days?: number;
    probation_restricted?: boolean;
    effective_from?: string;
    effective_to?: string | null;
    is_active?: boolean;
  },
  user: ApiUser
) {
  const supabase = await createClient();
  const payload = {
    organization_id: user.organization_id,
    leave_type_id: input.leave_type_id,
    name: input.name.trim(),
    priority: input.priority ?? 100,
    criteria: input.criteria ?? {},
    annual_entitlement: input.annual_entitlement,
    accrual_monthly: input.accrual_monthly ?? 0,
    max_carry_over: input.max_carry_over ?? 0,
    max_consecutive_days: input.max_consecutive_days ?? null,
    min_notice_days: input.min_notice_days ?? 0,
    probation_restricted: input.probation_restricted ?? false,
    effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10),
    effective_to: input.effective_to ?? null,
    is_active: input.is_active ?? true,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("hr_leave_policy_rules")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("hr_leave_policy_rules").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function upsertCostCenter(
  input: { id?: string; code: string; name: string; factory_id?: string; department_id?: string },
  user: ApiUser
) {
  const supabase = await createClient();
  const payload = {
    organization_id: user.organization_id,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    factory_id: input.factory_id ?? null,
    department_id: input.department_id ?? null,
    is_active: true,
  };
  if (input.id) {
    const { data, error } = await supabase
      .from("hr_cost_centers")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase.from("hr_cost_centers").insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function importHolidays(
  input: {
    year: number;
    location?: string;
    holidays: Array<{
      name: string;
      holiday_date: string;
      holiday_type?: string;
      country?: string;
      is_recurring?: boolean;
      factory_id?: string;
      branch_id?: string;
      department_id?: string;
    }>;
  },
  user: ApiUser
) {
  const supabase = await createClient();
  const { data: batch, error: batchError } = await supabase
    .from("hr_holiday_import_batches")
    .insert({
      organization_id: user.organization_id,
      year: input.year,
      location: input.location ?? null,
      row_count: input.holidays.length,
      imported_by: user.id,
    })
    .select("id")
    .single();
  if (batchError) throw new Error(batchError.message);

  const rows = input.holidays.map((h) => ({
    organization_id: user.organization_id,
    name: h.name.trim(),
    holiday_date: h.holiday_date,
    holiday_type: h.holiday_type ?? "public",
    country: h.country ?? input.location ?? null,
    is_recurring: h.is_recurring ?? false,
    factory_id: h.factory_id ?? null,
    branch_id: h.branch_id ?? null,
    department_id: h.department_id ?? null,
    import_batch_id: batch.id,
  }));

  if (rows.length === 0) return { imported: 0, batch_id: batch.id };

  const { error } = await supabase.from("hr_holidays").insert(rows);
  if (error) throw new Error(error.message);
  return { imported: rows.length, batch_id: batch.id };
}

export async function savePolicyVersion(
  input: {
    policy_domain: string;
    policy_key: string;
    policy_value: Record<string, unknown>;
    effective_from: string;
    effective_to?: string | null;
  },
  user: ApiUser
) {
  const supabase = await createClient();
  const { data: latest } = await supabase
    .from("hr_policy_versions")
    .select("version")
    .eq("organization_id", user.organization_id)
    .eq("policy_domain", input.policy_domain)
    .eq("policy_key", input.policy_key)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("hr_policy_versions")
    .insert({
      organization_id: user.organization_id,
      policy_domain: input.policy_domain,
      policy_key: input.policy_key,
      policy_value: input.policy_value,
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      version: (latest?.version ?? 0) + 1,
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
