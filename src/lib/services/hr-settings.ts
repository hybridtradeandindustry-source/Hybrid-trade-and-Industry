import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import type { HrHoliday, HrLeavePolicy, HrLeaveType, HrSettings } from "@/types";

const DEFAULT_SETTINGS: Omit<HrSettings, "organization_id"> = {
  work_start_time: "08:00:00",
  work_end_time: "17:00:00",
  late_grace_minutes: 15,
  standard_work_hours: 8,
  overtime_multiplier: 1.5,
  leave_compensation_enabled: true,
  leave_compensation_daily_rate_divisor: 30,
  payroll_tax_rate_percent: 0,
  payroll_day_of_month: 25,
};

export async function getHrSettings(orgId: string): Promise<HrSettings> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("hr_settings")
    .select("*")
    .eq("organization_id", orgId)
    .maybeSingle();

  if (data) return normalizeSettings(data);

  const { data: inserted, error } = await supabase
    .from("hr_settings")
    .upsert({ organization_id: orgId, ...DEFAULT_SETTINGS }, { onConflict: "organization_id" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalizeSettings(inserted);
}

function normalizeSettings(row: Record<string, unknown>): HrSettings {
  return {
    organization_id: row.organization_id as string,
    work_start_time: String(row.work_start_time ?? "08:00:00").slice(0, 5),
    work_end_time: String(row.work_end_time ?? "17:00:00").slice(0, 5),
    late_grace_minutes: Number(row.late_grace_minutes ?? 15),
    standard_work_hours: Number(row.standard_work_hours ?? 8),
    overtime_multiplier: Number(row.overtime_multiplier ?? 1.5),
    leave_compensation_enabled: Boolean(row.leave_compensation_enabled ?? true),
    leave_compensation_daily_rate_divisor: Number(row.leave_compensation_daily_rate_divisor ?? 30),
    payroll_tax_rate_percent: Number(row.payroll_tax_rate_percent ?? 0),
    payroll_day_of_month: Number(row.payroll_day_of_month ?? 25),
  };
}

export async function updateHrSettings(
  orgId: string,
  updates: Partial<HrSettings>,
  userId: string
): Promise<HrSettings> {
  await getHrSettings(orgId);
  const supabase = await createClient();
  const payload: Record<string, unknown> = { updated_by: userId };
  const allowed = [
    "work_start_time",
    "work_end_time",
    "late_grace_minutes",
    "standard_work_hours",
    "overtime_multiplier",
    "leave_compensation_enabled",
    "leave_compensation_daily_rate_divisor",
    "payroll_tax_rate_percent",
    "payroll_day_of_month",
  ] as const;

  for (const key of allowed) {
    if (updates[key] !== undefined) payload[key] = updates[key];
  }

  const { data, error } = await supabase
    .from("hr_settings")
    .update(payload)
    .eq("organization_id", orgId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return normalizeSettings(data);
}

export async function fetchLeaveTypes(orgId: string): Promise<HrLeaveType[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_types")
    .select("*")
    .eq("organization_id", orgId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapLeaveType);
}

function mapLeaveType(row: Record<string, unknown>): HrLeaveType {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    code: row.code as string,
    name: row.name as string,
    description: row.description as string | null,
    default_days: Number(row.default_days),
    accrual_monthly: Number(row.accrual_monthly),
    is_paid: Boolean(row.is_paid),
    is_convertible: Boolean(row.is_convertible),
    requires_approval: Boolean(row.requires_approval),
    max_carry_over: Number(row.max_carry_over),
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order),
  };
}

export async function upsertLeaveType(
  input: {
    id?: string;
    code: string;
    name: string;
    description?: string;
    default_days?: number;
    accrual_monthly?: number;
    is_paid?: boolean;
    is_convertible?: boolean;
    requires_approval?: boolean;
    max_carry_over?: number;
    is_active?: boolean;
    sort_order?: number;
  },
  user: ApiUser
): Promise<HrLeaveType> {
  const supabase = await createClient();
  const payload = {
    organization_id: user.organization_id,
    code: input.code.trim().toLowerCase(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    default_days: input.default_days ?? 0,
    accrual_monthly: input.accrual_monthly ?? 0,
    is_paid: input.is_paid ?? true,
    is_convertible: input.is_convertible ?? false,
    requires_approval: input.requires_approval ?? true,
    max_carry_over: input.max_carry_over ?? 0,
    is_active: input.is_active ?? true,
    sort_order: input.sort_order ?? 0,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("hr_leave_types")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", user.organization_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapLeaveType(data);
  }

  const { data, error } = await supabase
    .from("hr_leave_types")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapLeaveType(data);
}

export async function fetchHolidays(orgId: string, year?: number): Promise<HrHoliday[]> {
  const supabase = await createClient();
  let query = supabase
    .from("hr_holidays")
    .select("*")
    .eq("organization_id", orgId)
    .order("holiday_date");

  if (year) {
    query = query.gte("holiday_date", `${year}-01-01`).lte("holiday_date", `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as HrHoliday[];
}

export async function insertHoliday(
  input: { factory_id?: string; name: string; holiday_date: string; is_recurring?: boolean },
  user: ApiUser
): Promise<HrHoliday> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_holidays")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      name: input.name.trim(),
      holiday_date: input.holiday_date,
      is_recurring: input.is_recurring ?? false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrHoliday;
}

export async function deleteHoliday(id: string, user: ApiUser): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("hr_holidays")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);
  if (error) throw new Error(error.message);
}

export async function fetchLeavePolicies(orgId: string): Promise<HrLeavePolicy[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_policies")
    .select("*")
    .eq("organization_id", orgId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as HrLeavePolicy),
    annual_entitlement: Number(row.annual_entitlement),
    accrual_monthly: Number(row.accrual_monthly),
    max_carry_over: Number(row.max_carry_over),
  }));
}

export async function upsertLeavePolicy(
  input: {
    id?: string;
    leave_type_id: string;
    department_id?: string | null;
    position_id?: string | null;
    annual_entitlement: number;
    accrual_monthly?: number;
    max_carry_over?: number;
  },
  user: ApiUser
): Promise<HrLeavePolicy> {
  const supabase = await createClient();
  const payload = {
    organization_id: user.organization_id,
    leave_type_id: input.leave_type_id,
    department_id: input.department_id ?? null,
    position_id: input.position_id ?? null,
    annual_entitlement: input.annual_entitlement,
    accrual_monthly: input.accrual_monthly ?? 0,
    max_carry_over: input.max_carry_over ?? 0,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("hr_leave_policies")
      .update(payload)
      .eq("id", input.id)
      .eq("organization_id", user.organization_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as HrLeavePolicy;
  }

  const { data, error } = await supabase
    .from("hr_leave_policies")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrLeavePolicy;
}

export async function seedEmployeeLeaveBalances(
  employeeId: string,
  orgId: string,
  departmentId?: string | null,
  positionId?: string | null
): Promise<void> {
  const supabase = await createClient();
  const leaveTypes = await fetchLeaveTypes(orgId);
  const policies = await fetchLeavePolicies(orgId);
  const year = new Date().getFullYear();

  const rows = leaveTypes
    .filter((lt) => lt.is_active)
    .map((lt) => {
      const policy = policies.find(
        (p) =>
          p.leave_type_id === lt.id &&
          (p.department_id === departmentId || p.position_id === positionId)
      );
      const entitlement = policy?.annual_entitlement ?? lt.default_days;
      return {
        organization_id: orgId,
        employee_id: employeeId,
        leave_type: lt.code,
        leave_type_id: lt.id,
        balance_days: entitlement,
        used_days: 0,
        accrued_days: 0,
        carry_over_days: 0,
        balance_year: year,
      };
    });

  if (rows.length === 0) return;

  const { error } = await supabase.from("leave_balances").upsert(rows, {
    onConflict: "employee_id,leave_type",
  });
  if (error) throw new Error(error.message);
}

export async function runLeaveAccrual(orgId: string): Promise<number> {
  const supabase = await createClient();
  const leaveTypes = await fetchLeaveTypes(orgId);
  const accrualTypes = leaveTypes.filter((lt) => lt.is_active && lt.accrual_monthly > 0);
  if (accrualTypes.length === 0) return 0;

  const { data: balances, error } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("organization_id", orgId)
    .eq("balance_year", new Date().getFullYear());
  if (error) throw new Error(error.message);

  let updated = 0;
  for (const balance of balances ?? []) {
    const leaveType = accrualTypes.find(
      (lt) => lt.id === balance.leave_type_id || lt.code === balance.leave_type
    );
    if (!leaveType) continue;

    const newAccrued = Number(balance.accrued_days ?? 0) + leaveType.accrual_monthly;
    const newBalance = Number(balance.balance_days) + leaveType.accrual_monthly;
    const { error: updateError } = await supabase
      .from("leave_balances")
      .update({
        accrued_days: newAccrued,
        balance_days: newBalance,
      })
      .eq("id", balance.id);
    if (!updateError) updated += 1;
  }
  return updated;
}
