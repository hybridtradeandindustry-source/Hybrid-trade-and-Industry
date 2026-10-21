import { createClient } from "@/lib/supabase/server";
import { deriveAttendanceStatus, formatClockTime } from "@/lib/hr/calculations";
import { fetchLeaveLedger } from "@/lib/services/hr-leave-ledger";
import { fetchEmployeeDocuments, fetchPayrollRuns } from "@/lib/services/hr-payroll";
import { fetchLeaveTypes } from "@/lib/services/hr-settings";
import type {
  AttendanceRecord,
  AttendanceSummary,
  Document,
  Employee,
  HrAttendanceCorrection,
  HrDepartment,
  HrEmployeeBenefit,
  HrEmploymentHistoryEntry,
  HrLeaveBalanceLedgerEntry,
  HrLeaveCompensationRequest,
  HrLeaveType,
  HrPayrollItem,
  HrPayrollRun,
  HrPosition,
  LeaveBalance,
  LeaveRequest,
} from "@/types";

export interface EmployeePayrollHistoryItem extends HrPayrollItem {
  period_start: string;
  period_end: string;
  run_status: HrPayrollRun["status"];
}

export interface EmployeeAnalytics {
  tenureDays: number;
  tenureLabel: string;
  attendanceRatePercent: number;
  absentDaysMonth: number;
  lateDaysMonth: number;
  presentDaysMonth: number;
  leaveDaysMonth: number;
  overtimeHoursMonth: number;
  avgWorkingHoursMonth: number;
  leaveDaysUsedYtd: number;
  pendingLeaveRequests: number;
  approvedLeaveDaysYtd: number;
  totalNetPayYtd: number;
  totalGrossPayYtd: number;
  payrollRunsCount: number;
  leaveLiabilityDays: number;
  daysUntilContractEnd: number | null;
  daysUntilProbationEnd: number | null;
}

export interface EmployeeDetail {
  employee: Employee;
  department: HrDepartment | null;
  position: HrPosition | null;
  manager: Pick<Employee, "id" | "employee_number" | "first_name" | "last_name"> | null;
  departments: HrDepartment[];
  positions: HrPosition[];
  managerCandidates: Pick<Employee, "id" | "employee_number" | "first_name" | "last_name">[];
  leaveBalances: LeaveBalance[];
  leaveRequests: LeaveRequest[];
  leaveLedger: HrLeaveBalanceLedgerEntry[];
  leaveCompensationRequests: HrLeaveCompensationRequest[];
  attendanceHistory: AttendanceRecord[];
  attendanceSummaryMonth: AttendanceSummary;
  attendanceSummaryYtd: AttendanceSummary;
  employmentHistory: HrEmploymentHistoryEntry[];
  payrollHistory: EmployeePayrollHistoryItem[];
  attendanceCorrections: HrAttendanceCorrection[];
  benefits: HrEmployeeBenefit[];
  documents: Document[];
  leaveTypes: HrLeaveType[];
  analytics: EmployeeAnalytics;
  canViewSalary: boolean;
}

function mapAttendance(row: Record<string, unknown>): AttendanceRecord {
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    employee_id: row.employee_id as string,
    factory_id: row.factory_id as string | null,
    shift_date: row.shift_date as string,
    clock_in: formatClockTime(row.clock_in as string | null),
    clock_out: formatClockTime(row.clock_out as string | null),
    status: deriveAttendanceStatus(row.clock_in as string | null, row.status as string | null),
    working_hours: row.working_hours != null ? Number(row.working_hours) : null,
    overtime_hours: row.overtime_hours != null ? Number(row.overtime_hours) : null,
    late_minutes: row.late_minutes != null ? Number(row.late_minutes) : null,
    early_departure_minutes:
      row.early_departure_minutes != null ? Number(row.early_departure_minutes) : null,
    shift_id: row.shift_id as string | null,
    is_remote: row.is_remote as boolean | null,
    is_corrected: row.is_corrected as boolean | null,
    notes: row.notes as string | null,
  };
}

function summarizeAttendance(records: AttendanceRecord[], employeeId: string): AttendanceSummary {
  const mine = records.filter((r) => r.employee_id === employeeId);
  return {
    employee_id: employeeId,
    present_days: mine.filter((r) => r.status === "present" || r.status === "late").length,
    absent_days: mine.filter((r) => r.status === "absent").length,
    late_days: mine.filter((r) => r.status === "late").length,
    leave_days: mine.filter((r) => r.status === "leave").length,
    total_working_hours: mine.reduce((s, r) => s + Number(r.working_hours ?? 0), 0),
    total_overtime_hours: mine.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0),
    total_late_minutes: mine.reduce((s, r) => s + Number(r.late_minutes ?? 0), 0),
  };
}

function countWorkingDays(records: AttendanceRecord[]): number {
  return records.filter((r) => r.status !== "leave").length;
}

function formatTenure(days: number): string {
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`;
}

function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function maskEmployeeSalary(employee: Employee): Employee {
  return {
    ...employee,
    salary: null,
    monthly_allowances: null,
    bank_name: null,
    bank_account_number: null,
  };
}

function maskPayrollHistory(items: EmployeePayrollHistoryItem[]): EmployeePayrollHistoryItem[] {
  return items.map((item) => ({
    ...item,
    base_salary: 0,
    allowances: 0,
    overtime_pay: 0,
    bonus: 0,
    leave_compensation: 0,
    gross_pay: 0,
    tax_deduction: 0,
    other_deductions: 0,
    net_pay: 0,
    unpaid_leave_deduction: 0,
    payroll_breakdown: undefined,
  }));
}

export async function getEmployeeDetail(
  employeeId: string,
  orgId: string,
  options?: { canViewSalary?: boolean }
): Promise<EmployeeDetail> {
  const canViewSalary = options?.canViewSalary ?? true;
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const ytdStart = `${year}-01-01`;
  const today = now.toISOString().slice(0, 10);

  const { data: employeeRow, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("id", employeeId)
    .eq("organization_id", orgId)
    .single();

  if (empError || !employeeRow) throw new Error("Employee not found");

  const [
    leaveTypes,
    departmentsRes,
    positionsRes,
    managersRes,
    departmentRes,
    positionRes,
    managerRes,
    leaveBalancesRes,
    leaveRequestsRes,
    leaveLedger,
    leaveCompRes,
    attendanceMonthRes,
    attendanceYtdRes,
    employmentHistoryRes,
    payrollItemsRes,
    correctionsRes,
    benefitsRes,
    documentsRaw,
    payrollRuns,
  ] = await Promise.all([
    fetchLeaveTypes(orgId),
    supabase
      .from("hr_departments")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    supabase
      .from("hr_positions")
      .select("*")
      .eq("organization_id", orgId)
      .order("title"),
    supabase
      .from("employees")
      .select("id, employee_number, first_name, last_name, is_active")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .neq("id", employeeId)
      .order("employee_number"),
    employeeRow.department_id
      ? supabase
          .from("hr_departments")
          .select("*")
          .eq("id", employeeRow.department_id)
          .eq("organization_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    employeeRow.position_id
      ? supabase
          .from("hr_positions")
          .select("*")
          .eq("id", employeeRow.position_id)
          .eq("organization_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    employeeRow.manager_employee_id
      ? supabase
          .from("employees")
          .select("id, employee_number, first_name, last_name")
          .eq("id", employeeRow.manager_employee_id)
          .eq("organization_id", orgId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("leave_balances")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId),
    supabase
      .from("leave_requests")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
    fetchLeaveLedger(orgId, employeeId),
    supabase
      .from("hr_leave_compensation_requests")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
    supabase
      .from("attendance_records")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .gte("shift_date", monthStart)
      .lte("shift_date", monthEnd)
      .order("shift_date", { ascending: false }),
    supabase
      .from("attendance_records")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .gte("shift_date", ytdStart)
      .lte("shift_date", today)
      .order("shift_date", { ascending: false }),
    supabase
      .from("hr_employment_history")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("effective_date", { ascending: false }),
    supabase
      .from("hr_payroll_items")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(48),
    supabase
      .from("hr_attendance_corrections")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
    supabase
      .from("hr_employee_benefits")
      .select("*")
      .eq("organization_id", orgId)
      .eq("employee_id", employeeId)
      .order("effective_from", { ascending: false }),
    fetchEmployeeDocuments(employeeId, orgId),
    fetchPayrollRuns("combined", orgId),
  ]);

  const departments = (departmentsRes.data ?? []) as HrDepartment[];
  const positions = (positionsRes.data ?? []) as HrPosition[];
  const managerCandidates = (managersRes.data ?? []) as EmployeeDetail["managerCandidates"];
  const department = (departmentRes.data as HrDepartment | null) ?? null;
  const position = (positionRes.data as HrPosition | null) ?? null;
  const manager = (managerRes.data as EmployeeDetail["manager"]) ?? null;

  let employee: Employee = {
    ...(employeeRow as Employee),
    department: department?.name ?? (employeeRow.department as string | null),
    position: position?.title ?? (employeeRow.position as string),
    salary: employeeRow.salary != null ? Number(employeeRow.salary) : null,
    monthly_allowances:
      employeeRow.monthly_allowances != null ? Number(employeeRow.monthly_allowances) : null,
  };

  const leaveBalances: LeaveBalance[] = (leaveBalancesRes.data ?? []).map((row) => ({
    ...(row as LeaveBalance),
    balance_days: Number(row.balance_days),
    used_days: Number(row.used_days),
    accrued_days: Number(row.accrued_days ?? 0),
    carry_over_days: Number(row.carry_over_days ?? 0),
  }));

  const leaveRequests = (leaveRequestsRes.data ?? []) as LeaveRequest[];
  const attendanceHistory = (attendanceMonthRes.data ?? []).map(mapAttendance);
  const attendanceYtd = (attendanceYtdRes.data ?? []).map(mapAttendance);

  const runById = new Map(payrollRuns.map((r) => [r.id, r]));
  let payrollHistory: EmployeePayrollHistoryItem[] = (payrollItemsRes.data ?? []).map((row) => {
    const run = runById.get(row.payroll_run_id as string);
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
      period_start: run?.period_start ?? "",
      period_end: run?.period_end ?? "",
      run_status: run?.status ?? "draft",
    };
  });

  const employmentHistory = (employmentHistoryRes.data ?? []) as HrEmploymentHistoryEntry[];
  const attendanceCorrections = (correctionsRes.data ?? []) as HrAttendanceCorrection[];
  const benefits = ((benefitsRes.data ?? []) as HrEmployeeBenefit[]).map((b) => ({
    ...b,
    amount: Number(b.amount),
  }));
  const leaveCompensationRequests = (leaveCompRes.data ?? []).map((row) => ({
    ...(row as HrLeaveCompensationRequest),
    days_converted: Number(row.days_converted),
    daily_rate: Number(row.daily_rate),
    amount: Number(row.amount),
  }));

  const documents = (documentsRaw ?? []) as Document[];
  const attendanceSummaryMonth = summarizeAttendance(attendanceHistory, employeeId);
  const attendanceSummaryYtd = summarizeAttendance(attendanceYtd, employeeId);

  const hireMs = new Date(employee.hire_date).getTime();
  const tenureDays = Number.isNaN(hireMs)
    ? 0
    : Math.max(0, Math.floor((now.getTime() - hireMs) / 86400000));

  const workingDaysMonth = countWorkingDays(attendanceHistory);
  const attendanceRatePercent =
    workingDaysMonth > 0
      ? Math.round((attendanceSummaryMonth.present_days / workingDaysMonth) * 100)
      : 0;

  const ytdApprovedLeave = leaveRequests.filter(
    (l) =>
      l.status === "approved" &&
      l.start_date >= ytdStart &&
      l.start_date <= today
  );
  const leaveDaysUsedYtd = ytdApprovedLeave.reduce((s, l) => s + Number(l.days_count ?? 0), 0);

  const paidPayroll = payrollHistory.filter((p) => p.run_status === "paid");
  const totalNetPayYtd = paidPayroll.reduce((s, p) => s + p.net_pay, 0);
  const totalGrossPayYtd = paidPayroll.reduce((s, p) => s + p.gross_pay, 0);

  const leaveLiabilityDays = leaveBalances.reduce(
    (s, b) => s + Math.max(0, b.balance_days - b.used_days),
    0
  );

  const analytics: EmployeeAnalytics = {
    tenureDays,
    tenureLabel: formatTenure(tenureDays),
    attendanceRatePercent,
    absentDaysMonth: attendanceSummaryMonth.absent_days,
    lateDaysMonth: attendanceSummaryMonth.late_days,
    presentDaysMonth: attendanceSummaryMonth.present_days,
    leaveDaysMonth: attendanceSummaryMonth.leave_days,
    overtimeHoursMonth: attendanceSummaryMonth.total_overtime_hours,
    avgWorkingHoursMonth:
      attendanceSummaryMonth.present_days > 0
        ? Math.round(
            (attendanceSummaryMonth.total_working_hours / attendanceSummaryMonth.present_days) * 10
          ) / 10
        : 0,
    leaveDaysUsedYtd,
    pendingLeaveRequests: leaveRequests.filter((l) => l.status === "pending").length,
    approvedLeaveDaysYtd: leaveDaysUsedYtd,
    totalNetPayYtd,
    totalGrossPayYtd,
    payrollRunsCount: payrollHistory.length,
    leaveLiabilityDays,
    daysUntilContractEnd: daysUntil(employee.contract_end_date),
    daysUntilProbationEnd: daysUntil(employee.probation_end_date),
  };

  if (!canViewSalary) {
    employee = maskEmployeeSalary(employee);
    payrollHistory = maskPayrollHistory(payrollHistory);
    analytics.totalNetPayYtd = 0;
    analytics.totalGrossPayYtd = 0;
  }

  return {
    employee,
    department,
    position,
    manager,
    departments,
    positions,
    managerCandidates,
    leaveBalances,
    leaveRequests,
    leaveLedger,
    leaveCompensationRequests,
    attendanceHistory,
    attendanceSummaryMonth,
    attendanceSummaryYtd,
    employmentHistory,
    payrollHistory,
    attendanceCorrections,
    benefits,
    documents,
    leaveTypes,
    analytics,
    canViewSalary,
  };
}

export async function resolveLeaveRequestEmployeeId(
  leaveRequestId: string,
  orgId: string
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select("employee_id")
    .eq("id", leaveRequestId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.employee_id) throw new Error("Leave request not found");
  return data.employee_id as string;
}

export async function resolveAttendanceCorrectionEmployeeId(
  correctionId: string,
  orgId: string
): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_attendance_corrections")
    .select("employee_id")
    .eq("id", correctionId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.employee_id) throw new Error("Attendance correction not found");
  return data.employee_id as string;
}
