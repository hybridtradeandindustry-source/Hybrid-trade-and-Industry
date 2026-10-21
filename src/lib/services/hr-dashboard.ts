import { createClient } from "@/lib/supabase/server";
import type { Employee, HrDashboardMetrics, HrHoliday, LeaveRequest, ViewScope } from "@/types";
import { FACTORY_IDS } from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

export async function computeHrDashboard(
  scope: ViewScope,
  orgId: string,
  employees: Employee[],
  leaveRequests: LeaveRequest[],
  holidays: HrHoliday[]
): Promise<HrDashboardMetrics> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);
  const today = new Date().toISOString().slice(0, 10);
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const scopedEmployees = factoryId
    ? employees.filter((e) => e.factory_id === factoryId)
    : employees;
  const employeeIds = scopedEmployees.map((e) => e.id);

  let absentToday = 0;
  let overtimeHoursMonth = 0;
  if (employeeIds.length > 0) {
    const monthStart = today.slice(0, 8) + "01";
    const [{ data: todayAttendance }, { data: monthAttendance }] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("employee_id, status")
        .eq("organization_id", orgId)
        .eq("shift_date", today)
        .in("employee_id", employeeIds),
      supabase
        .from("attendance_records")
        .select("overtime_hours")
        .eq("organization_id", orgId)
        .gte("shift_date", monthStart)
        .lte("shift_date", today)
        .in("employee_id", employeeIds),
    ]);

    const presentIds = new Set(
      (todayAttendance ?? [])
        .filter((a) => a.status === "present" || a.status === "late")
        .map((a) => a.employee_id as string)
    );
    absentToday = scopedEmployees.filter((e) => e.is_active && !presentIds.has(e.id)).length;
    overtimeHoursMonth = (monthAttendance ?? []).reduce(
      (s, r) => s + Number(r.overtime_hours ?? 0),
      0
    );
  }

  const { data: payrollRuns } = await supabase
    .from("hr_payroll_runs")
    .select("total_expense, period_start")
    .eq("organization_id", orgId)
    .eq("status", "paid")
    .gte("period_start", today.slice(0, 8) + "01");

  const payrollExpenseMonth = (payrollRuns ?? []).reduce(
    (s, r) => s + Number(r.total_expense ?? 0),
    0
  );

  const { data: balances } = await supabase
    .from("leave_balances")
    .select("balance_days, used_days, employee_id")
    .eq("organization_id", orgId)
    .in("employee_id", employeeIds.length ? employeeIds : ["00000000-0000-0000-0000-000000000000"]);

  const leaveLiabilityDays = (balances ?? []).reduce(
    (s, b) => s + Math.max(0, Number(b.balance_days) - Number(b.used_days)),
    0
  );

  const scopedLeave = leaveRequests.filter((l) => employeeIds.includes(l.employee_id));
  const pendingLeave = scopedLeave.filter((l) => l.status === "pending").length;

  const { count: pendingApprovals } = await supabase
    .from("hr_approval_instances")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "pending");

  const onProbation = scopedEmployees.filter(
    (e) =>
      e.is_active &&
      (e.employment_status === "probation" ||
        (e.probation_end_date && e.probation_end_date >= today))
  ).length;

  const contractsExpiring30 = scopedEmployees.filter(
    (e) => e.is_active && e.contract_end_date && e.contract_end_date <= in30Days && e.contract_end_date >= today
  ).length;

  const probationExpiring30 = scopedEmployees.filter(
    (e) =>
      e.is_active &&
      e.probation_end_date &&
      e.probation_end_date <= in30Days &&
      e.probation_end_date >= today
  ).length;

  const upcomingHolidays = holidays
    .filter((h) => h.holiday_date >= today)
    .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
    .slice(0, 5);

  return {
    headcount: scopedEmployees.length,
    activeEmployees: scopedEmployees.filter((e) => e.is_active).length,
    onProbation,
    pendingLeave,
    pendingApprovals: pendingApprovals ?? 0,
    absentToday,
    overtimeHoursMonth: Math.round(overtimeHoursMonth * 10) / 10,
    payrollExpenseMonth,
    leaveLiabilityDays: Math.round(leaveLiabilityDays * 10) / 10,
    contractsExpiring30,
    probationExpiring30,
    upcomingHolidays,
  };
}

export function maskEmployeeSalary<T extends { salary?: number | null; bank_account_number?: string | null }>(
  employee: T,
  canViewSalary: boolean
): T {
  if (canViewSalary) return employee;
  return {
    ...employee,
    salary: null,
    bank_account_number: employee.bank_account_number ? "****" : null,
  };
}
