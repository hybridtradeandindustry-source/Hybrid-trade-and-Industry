import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import {
  computeLeaveCompensationAmount,
  computePayrollItem,
  dailySalaryRate,
  leaveDaysBetween,
  overtimePayFromHours,
} from "@/lib/hr/calculations";
import { getHrSettings } from "@/lib/services/hr-settings";
import type {
  AttendanceSummary,
  Employee,
  HrLeaveCompensationRequest,
  HrPayrollItem,
  HrPayrollRun,
  ViewScope,
} from "@/types";
import { FACTORY_IDS } from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function mapPayrollRun(row: Record<string, unknown>): HrPayrollRun {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    factory_id: row.factory_id as string | null,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    status: row.status as HrPayrollRun["status"],
    total_gross: Number(row.total_gross),
    total_deductions: Number(row.total_deductions),
    total_net: Number(row.total_net),
    total_expense: Number(row.total_expense),
    notes: row.notes as string | null,
    calculated_by: row.calculated_by as string | null,
    approved_by: row.approved_by as string | null,
    paid_at: row.paid_at as string | null,
    created_at: row.created_at as string | undefined,
  };
}

function mapPayrollItem(row: Record<string, unknown>): HrPayrollItem {
  return {
    id: row.id as string,
    payroll_run_id: row.payroll_run_id as string,
    organization_id: row.organization_id as string,
    employee_id: row.employee_id as string,
    base_salary: Number(row.base_salary),
    allowances: Number(row.allowances),
    overtime_pay: Number(row.overtime_pay),
    bonus: Number(row.bonus),
    leave_compensation: Number(row.leave_compensation),
    gross_pay: Number(row.gross_pay),
    tax_deduction: Number(row.tax_deduction),
    other_deductions: Number(row.other_deductions),
    net_pay: Number(row.net_pay),
    payment_status: row.payment_status as HrPayrollItem["payment_status"],
    sage_transaction_id: row.sage_transaction_id as string | null,
  };
}

export async function fetchPayrollRuns(
  scope: ViewScope,
  orgId: string
): Promise<HrPayrollRun[]> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);
  let query = supabase
    .from("hr_payroll_runs")
    .select("*")
    .eq("organization_id", orgId)
    .order("period_start", { ascending: false });
  if (factoryId) query = query.eq("factory_id", factoryId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPayrollRun);
}

export async function fetchPayrollItems(payrollRunId: string, orgId: string): Promise<HrPayrollItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_items")
    .select("*")
    .eq("payroll_run_id", payrollRunId)
    .eq("organization_id", orgId)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapPayrollItem);
}

export async function createPayrollRun(
  input: {
    factory_id?: string;
    period_start: string;
    period_end: string;
    notes?: string;
  },
  user: ApiUser
): Promise<HrPayrollRun> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_payroll_runs")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      period_start: input.period_start,
      period_end: input.period_end,
      notes: input.notes?.trim() || null,
      status: "draft",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapPayrollRun(data);
}

async function attendanceSummaryForPeriod(
  orgId: string,
  employeeIds: string[],
  periodStart: string,
  periodEnd: string
): Promise<Map<string, AttendanceSummary>> {
  const supabase = await createClient();
  const summary = new Map<string, AttendanceSummary>();

  if (employeeIds.length === 0) return summary;

  const { data, error } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("organization_id", orgId)
    .in("employee_id", employeeIds)
    .gte("shift_date", periodStart)
    .lte("shift_date", periodEnd);
  if (error) throw new Error(error.message);

  for (const id of employeeIds) {
    summary.set(id, {
      employee_id: id,
      present_days: 0,
      absent_days: 0,
      late_days: 0,
      leave_days: 0,
      total_working_hours: 0,
      total_overtime_hours: 0,
      total_late_minutes: 0,
    });
  }

  for (const row of data ?? []) {
    const s = summary.get(row.employee_id as string);
    if (!s) continue;
    const status = row.status as string;
    if (status === "present") s.present_days += 1;
    else if (status === "late") {
      s.late_days += 1;
      s.present_days += 1;
    } else if (status === "leave") s.leave_days += 1;
    else if (status === "absent") s.absent_days += 1;
    s.total_working_hours += Number(row.working_hours ?? 0);
    s.total_overtime_hours += Number(row.overtime_hours ?? 0);
    s.total_late_minutes += Number(row.late_minutes ?? 0);
  }

  return summary;
}

export async function calculatePayrollRun(payrollRunId: string, user: ApiUser): Promise<HrPayrollRun> {
  const supabase = await createClient();
  const settings = await getHrSettings(user.organization_id);

  const { data: run, error: runError } = await supabase
    .from("hr_payroll_runs")
    .select("*")
    .eq("id", payrollRunId)
    .eq("organization_id", user.organization_id)
    .single();
  if (runError || !run) throw new Error("Payroll run not found");
  if (run.is_locked) throw new Error("Payroll run is locked and cannot be recalculated");
  if (run.status === "paid") throw new Error("Cannot recalculate a paid payroll run");

  let employeesQuery = supabase
    .from("employees")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("is_active", true);
  if (run.factory_id) employeesQuery = employeesQuery.eq("factory_id", run.factory_id);
  const { data: employees, error: empError } = await employeesQuery;
  if (empError) throw new Error(empError.message);

  const employeeList = (employees ?? []) as Employee[];
  const employeeIds = employeeList.map((e) => e.id);
  const attendanceMap = await attendanceSummaryForPeriod(
    user.organization_id,
    employeeIds,
    run.period_start,
    run.period_end
  );

  const { data: compRequests } = await supabase
    .from("hr_leave_compensation_requests")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("status", "approved")
    .is("payroll_run_id", null);

  await supabase.from("hr_payroll_items").delete().eq("payroll_run_id", payrollRunId);

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;

  const items: Record<string, unknown>[] = [];

  for (const employee of employeeList) {
    const baseSalary = Number(employee.salary ?? 0);
    const allowances = Number(employee.monthly_allowances ?? 0);
    const attendance = attendanceMap.get(employee.id);
    const overtimePay = overtimePayFromHours(
      baseSalary,
      attendance?.total_overtime_hours ?? 0,
      settings.standard_work_hours,
      settings.overtime_multiplier
    );

    const leaveCompensation = (compRequests ?? [])
      .filter((r) => r.employee_id === employee.id)
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const calc = computePayrollItem({
      baseSalary,
      allowances,
      overtimePay,
      bonus: 0,
      leaveCompensation,
      taxRatePercent: settings.payroll_tax_rate_percent,
      otherDeductions: 0,
    });

    items.push({
      payroll_run_id: payrollRunId,
      organization_id: user.organization_id,
      employee_id: employee.id,
      base_salary: baseSalary,
      allowances,
      overtime_pay: overtimePay,
      bonus: 0,
      leave_compensation: leaveCompensation,
      gross_pay: calc.grossPay,
      tax_deduction: calc.taxDeduction,
      other_deductions: 0,
      net_pay: calc.netPay,
      payment_status: "pending",
    });

    totalGross += calc.grossPay;
    totalDeductions += calc.taxDeduction;
    totalNet += calc.netPay;
  }

  if (items.length > 0) {
    const { error: itemsError } = await supabase.from("hr_payroll_items").insert(items);
    if (itemsError) throw new Error(itemsError.message);
  }

  const { data: updated, error: updateError } = await supabase
    .from("hr_payroll_runs")
    .update({
      status: "calculated",
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      total_expense: totalGross,
      calculated_by: user.id,
    })
    .eq("id", payrollRunId)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  if (compRequests && compRequests.length > 0) {
    const linkedIds = (compRequests ?? [])
      .filter((r) => employeeIds.includes(r.employee_id as string))
      .map((r) => r.id as string);
    if (linkedIds.length > 0) {
      await supabase
        .from("hr_leave_compensation_requests")
        .update({ payroll_run_id: payrollRunId })
        .in("id", linkedIds);
    }
  }

  return mapPayrollRun(updated);
}

export async function approvePayrollRun(payrollRunId: string, user: ApiUser): Promise<HrPayrollRun> {
  const supabase = await createClient();
  const { data: run, error } = await supabase
    .from("hr_payroll_runs")
    .update({ status: "approved", approved_by: user.id })
    .eq("id", payrollRunId)
    .eq("organization_id", user.organization_id)
    .eq("status", "calculated")
    .select("*")
    .single();
  if (error) throw new Error(error.message ?? "Payroll run must be calculated before approval");
  return mapPayrollRun(run);
}

export async function payPayrollRun(payrollRunId: string, user: ApiUser): Promise<HrPayrollRun> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: run, error: runError } = await supabase
    .from("hr_payroll_runs")
    .select("*")
    .eq("id", payrollRunId)
    .eq("organization_id", user.organization_id)
    .single();
  if (runError || !run) throw new Error("Payroll run not found");
  if (run.is_locked && run.status === "paid") throw new Error("Payroll run is locked");
  if (run.status !== "approved") throw new Error("Payroll run must be approved before payment");

  const items = await fetchPayrollItems(payrollRunId, user.organization_id);
  const { data: employees } = await supabase
    .from("employees")
    .select("id, employee_number, first_name, last_name, department_id")
    .eq("organization_id", user.organization_id)
    .in(
      "id",
      items.map((i) => i.employee_id)
    );

  const employeeById = new Map((employees ?? []).map((e) => [e.id as string, e]));

  for (const item of items) {
    if (item.net_pay <= 0) continue;

    const emp = employeeById.get(item.employee_id);
    const empLabel = emp
      ? [emp.first_name, emp.last_name].filter(Boolean).join(" ") || emp.employee_number
      : item.employee_id.slice(0, 8);

    const sageId = `PAYROLL-${payrollRunId.slice(0, 8)}-${item.employee_id.slice(0, 8)}-${Date.now()}`;
    const { data: tx, error: txError } = await service
      .from("sage_transactions")
      .insert({
        organization_id: user.organization_id,
        factory_id: run.factory_id,
        sage_id: sageId,
        transaction_date: run.period_end,
        description: `Payroll — ${empLabel} (${run.period_start} to ${run.period_end})`,
        amount: -item.gross_pay,
        transaction_type: "payroll_expense",
        reference: item.id,
      })
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);

    await supabase
      .from("hr_payroll_items")
      .update({ payment_status: "paid", sage_transaction_id: tx.id })
      .eq("id", item.id);
  }

  const { data: paidRun, error: paidError } = await supabase
    .from("hr_payroll_runs")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      is_locked: true,
      locked_at: new Date().toISOString(),
      locked_by: user.id,
    })
    .eq("id", payrollRunId)
    .select("*")
    .single();
  if (paidError) throw new Error(paidError.message);

  await supabase
    .from("hr_leave_compensation_requests")
    .update({ status: "paid" })
    .eq("payroll_run_id", payrollRunId)
    .eq("status", "approved");

  return mapPayrollRun(paidRun);
}

export async function createLeaveCompensationRequest(
  input: {
    employee_id: string;
    leave_type: string;
    days_converted: number;
    notes?: string;
  },
  user: ApiUser
): Promise<HrLeaveCompensationRequest> {
  const supabase = await createClient();
  const settings = await getHrSettings(user.organization_id);
  if (!settings.leave_compensation_enabled) {
    throw new Error("Leave compensation is disabled in HR settings");
  }

  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("id", input.employee_id)
    .eq("organization_id", user.organization_id)
    .single();
  if (empError || !employee) throw new Error("Employee not found");

  const { data: leaveType } = await supabase
    .from("hr_leave_types")
    .select("*")
    .eq("organization_id", user.organization_id)
    .eq("code", input.leave_type.toLowerCase())
    .maybeSingle();
  if (leaveType && !leaveType.is_convertible) {
    throw new Error(`Leave type "${input.leave_type}" is not eligible for compensation conversion`);
  }

  const { data: balance } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("employee_id", input.employee_id)
    .eq("leave_type", input.leave_type.toLowerCase())
    .maybeSingle();

  if (balance) {
    const remaining = Number(balance.balance_days) - Number(balance.used_days);
    if (input.days_converted > remaining) {
      throw new Error(`Insufficient leave balance (${remaining} day(s) remaining)`);
    }
  }

  const dailyRate = dailySalaryRate(
    Number(employee.salary ?? 0),
    settings.leave_compensation_daily_rate_divisor
  );
  const amount = computeLeaveCompensationAmount(
    input.days_converted,
    Number(employee.salary ?? 0),
    settings.leave_compensation_daily_rate_divisor
  );

  const { data, error } = await supabase
    .from("hr_leave_compensation_requests")
    .insert({
      organization_id: user.organization_id,
      employee_id: input.employee_id,
      leave_type: input.leave_type.toLowerCase(),
      leave_type_id: leaveType?.id ?? null,
      days_converted: input.days_converted,
      daily_rate: dailyRate,
      amount,
      notes: input.notes?.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrLeaveCompensationRequest;
}

export async function reviewLeaveCompensationRequest(
  id: string,
  status: "approved" | "rejected",
  user: ApiUser,
  rejectionReason?: string
): Promise<HrLeaveCompensationRequest> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: existing, error: fetchError } = await supabase
    .from("hr_leave_compensation_requests")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();
  if (fetchError || !existing) throw new Error("Leave compensation request not found");
  if (existing.status !== "pending") throw new Error("Request has already been reviewed");

  if (status === "approved") {
    const { data: balance } = await service
      .from("leave_balances")
      .select("*")
      .eq("employee_id", existing.employee_id)
      .eq("leave_type", existing.leave_type)
      .maybeSingle();

    if (balance) {
      const days = Number(existing.days_converted);
      const remaining = Number(balance.balance_days) - Number(balance.used_days);
      if (days > remaining) {
        throw new Error(`Insufficient leave balance (${remaining} day(s) remaining)`);
      }
      await service
        .from("leave_balances")
        .update({
          used_days: Number(balance.used_days) + days,
          balance_days: Number(balance.balance_days) - days,
        })
        .eq("id", balance.id);
    }
  }

  const { data, error } = await supabase
    .from("hr_leave_compensation_requests")
    .update({
      status,
      approved_by: user.id,
      reviewed_at: new Date().toISOString(),
      notes: status === "rejected" && rejectionReason ? rejectionReason : existing.notes,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrLeaveCompensationRequest;
}

export async function fetchLeaveCompensationRequests(
  orgId: string
): Promise<HrLeaveCompensationRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_leave_compensation_requests")
    .select("*")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    ...(row as HrLeaveCompensationRequest),
    days_converted: Number(row.days_converted),
    daily_rate: Number(row.daily_rate),
    amount: Number(row.amount),
  }));
}

export async function fetchEmployeeDocuments(employeeId: string, orgId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("organization_id", orgId)
    .eq("entity_type", "employee")
    .eq("entity_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export { leaveDaysBetween };
