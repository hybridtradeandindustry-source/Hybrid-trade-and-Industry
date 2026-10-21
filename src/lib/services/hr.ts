import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import {
  computeAttendanceMetrics,
  deriveAttendanceStatus,
  formatClockTime,
  todayIso,
} from "@/lib/hr/calculations";
import {
  leaveDaysBetweenWithSchedule,
  resolveLeaveEntitlement,
  resolveWorkSchedule,
  validateLeaveRequest,
  type EmployeePolicyContext,
} from "@/lib/hr/policy-engine";
import { computeHrDashboard } from "@/lib/services/hr-dashboard";
import { fetchLeaveLedger, recordLeaveUsage, reverseLeaveUsage } from "@/lib/services/hr-leave-ledger";
import {
  fetchApprovalWorkflows,
  fetchCostCenters,
  fetchLeavePolicyRules,
  fetchShifts,
  fetchWorkSchedules,
} from "@/lib/services/hr-policies";
import { fetchHolidays, getHrSettings, seedEmployeeLeaveBalances } from "@/lib/services/hr-settings";
import {
  fetchLeaveCompensationRequests,
  fetchPayrollItems,
  fetchPayrollRuns,
} from "@/lib/services/hr-payroll";
import {
  FACTORY_IDS,
  type AttendanceRecord,
  type AttendanceSummary,
  type Employee,
  type HrApprovalWorkflow,
  type HrCostCenter,
  type HrDashboardMetrics,
  type HrDepartment,
  type HrHoliday,
  type HrLeaveBalanceLedgerEntry,
  type HrLeaveCompensationRequest,
  type HrLeavePolicyRule,
  type HrLeaveType,
  type HrMetrics,
  type HrPayrollItem,
  type HrPayrollRun,
  type HrPosition,
  type HrSettings,
  type HrShift,
  type HrWorkSchedule,
  type LeaveBalance,
  type LeaveRequest,
  type ViewScope,
} from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

export interface HrDataPayload {
  employees: Employee[];
  departments: HrDepartment[];
  positions: HrPosition[];
  leaveRequests: LeaveRequest[];
  leaveBalances: LeaveBalance[];
  attendance: AttendanceRecord[];
  attendanceHistory: AttendanceRecord[];
  attendanceSummaries: AttendanceSummary[];
  metrics: HrMetrics;
  settings: HrSettings;
  leaveTypes: HrLeaveType[];
  holidays: HrHoliday[];
  leaveCompensationRequests: HrLeaveCompensationRequest[];
  payrollRuns: HrPayrollRun[];
  payrollItems: HrPayrollItem[];
  dashboard: HrDashboardMetrics;
  shifts: HrShift[];
  workSchedules: HrWorkSchedule[];
  leavePolicyRules: HrLeavePolicyRule[];
  approvalWorkflows: HrApprovalWorkflow[];
  costCenters: HrCostCenter[];
  leaveLedger: HrLeaveBalanceLedgerEntry[];
}

type HrSupabase = Awaited<ReturnType<typeof createClient>>;

async function countActiveEmployeesOnDepartment(
  supabase: HrSupabase,
  orgId: string,
  departmentId: string
): Promise<number> {
  const { data: positions, error: posError } = await supabase
    .from("hr_positions")
    .select("id")
    .eq("organization_id", orgId)
    .eq("department_id", departmentId);
  if (posError) throw new Error(posError.message);

  const positionIds = (positions ?? []).map((row) => row.id as string);

  const { data: byDepartment, error: deptError } = await supabase
    .from("employees")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq("department_id", departmentId);
  if (deptError) throw new Error(deptError.message);

  let byPosition: { id: string }[] = [];
  if (positionIds.length > 0) {
    const { data, error } = await supabase
      .from("employees")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .in("position_id", positionIds);
    if (error) throw new Error(error.message);
    byPosition = (data ?? []) as { id: string }[];
  }

  return new Set([
    ...(byDepartment ?? []).map((row) => row.id as string),
    ...byPosition.map((row) => row.id),
  ]).size;
}

async function countActiveEmployeesOnPosition(
  supabase: HrSupabase,
  orgId: string,
  positionId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .eq("position_id", positionId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function assertDepartmentCanDeactivate(
  supabase: HrSupabase,
  orgId: string,
  departmentId: string
): Promise<void> {
  const assigned = await countActiveEmployeesOnDepartment(supabase, orgId, departmentId);
  if (assigned > 0) {
    throw new Error(
      `Cannot deactivate department: ${assigned} active employee(s) are still assigned. Reassign or deactivate them first.`
    );
  }
}

async function assertPositionCanDeactivate(
  supabase: HrSupabase,
  orgId: string,
  positionId: string
): Promise<void> {
  const assigned = await countActiveEmployeesOnPosition(supabase, orgId, positionId);
  if (assigned > 0) {
    throw new Error(
      `Cannot deactivate position: ${assigned} active employee(s) are still assigned. Reassign or deactivate them first.`
    );
  }
}

async function assertEmployeeHrAssignmentActive(
  supabase: HrSupabase,
  orgId: string,
  departmentId?: string | null,
  positionId?: string | null
): Promise<void> {
  if (departmentId) {
    const { data, error } = await supabase
      .from("hr_departments")
      .select("name, is_active")
      .eq("id", departmentId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Department not found");
    if (!data.is_active) {
      throw new Error(
        `Department "${data.name}" is inactive. Choose an active department or reactivate it first.`
      );
    }
  }

  if (positionId) {
    const { data, error } = await supabase
      .from("hr_positions")
      .select("title, is_active")
      .eq("id", positionId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Position not found");
    if (!data.is_active) {
      throw new Error(
        `Position "${data.title}" is inactive. Choose an active position or reactivate it first.`
      );
    }
  }
}

function computeMetrics(
  employees: Employee[],
  departments: HrDepartment[],
  positions: HrPosition[],
  leaveRequests: LeaveRequest[],
  attendance: AttendanceRecord[]
): HrMetrics {
  const activeEmployees = employees.filter((e) => e.is_active);
  return {
    totalEmployees: employees.length,
    activeEmployees: activeEmployees.length,
    presentToday: attendance.filter((a) => a.status === "present" || a.status === "late").length,
    pendingLeave: leaveRequests.filter((l) => l.status === "pending").length,
    departmentCount: departments.filter((d) => d.is_active).length,
    positionCount: positions.filter((p) => p.is_active).length,
    blockEmployees: activeEmployees.filter((e) => e.factory_id === FACTORY_IDS.block).length,
    recyclingEmployees: activeEmployees.filter((e) => e.factory_id === FACTORY_IDS.recycling).length,
  };
}

export async function fetchHrData(
  scope: ViewScope,
  orgId: string,
  options?: { attendanceMonth?: number; attendanceYear?: number }
): Promise<HrDataPayload> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);
  const year = options?.attendanceYear ?? new Date().getFullYear();
  const month = options?.attendanceMonth ?? new Date().getMonth() + 1;
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [settings, leaveTypes, holidays, payrollRuns, leaveCompensationRequests, shifts, workSchedules, leavePolicyRules, approvalWorkflows, costCenters] =
    await Promise.all([
    getHrSettings(orgId),
    import("@/lib/services/hr-settings").then((m) => m.fetchLeaveTypes(orgId)),
    fetchHolidays(orgId, year),
    fetchPayrollRuns(scope, orgId),
    fetchLeaveCompensationRequests(orgId),
    fetchShifts(orgId),
    fetchWorkSchedules(orgId),
    fetchLeavePolicyRules(orgId),
    fetchApprovalWorkflows(orgId),
    fetchCostCenters(orgId),
  ]);

  let departmentsQuery = supabase
    .from("hr_departments")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");
  let positionsQuery = supabase
    .from("hr_positions")
    .select("*")
    .eq("organization_id", orgId)
    .order("title");
  let employeesQuery = supabase
    .from("employees")
    .select("*")
    .eq("organization_id", orgId)
    .order("employee_number");

  if (factoryId) {
    departmentsQuery = departmentsQuery.eq("factory_id", factoryId);
    positionsQuery = positionsQuery.eq("factory_id", factoryId);
    employeesQuery = employeesQuery.eq("factory_id", factoryId);
  }

  const [
    { data: departmentsRaw, error: deptError },
    { data: positionsRaw, error: posError },
    { data: employeesRaw, error: empError },
  ] = await Promise.all([departmentsQuery, positionsQuery, employeesQuery]);

  if (deptError) throw new Error(deptError.message);
  if (posError) throw new Error(posError.message);
  if (empError) throw new Error(empError.message);

  const departmentById = new Map(
    (departmentsRaw ?? []).map((row) => [row.id as string, row as HrDepartment])
  );
  const positionById = new Map(
    (positionsRaw ?? []).map((row) => [row.id as string, row as HrPosition])
  );

  const employees: Employee[] = (employeesRaw ?? []).map((row) => {
    const dept = row.department_id
      ? departmentById.get(row.department_id as string)
      : null;
    const pos = row.position_id ? positionById.get(row.position_id as string) : null;
    return {
      ...(row as Employee),
      department: dept?.name ?? row.department,
      position: pos?.title ?? row.position,
      department_id: row.department_id,
      position_id: row.position_id,
      salary: row.salary != null ? Number(row.salary) : null,
    };
  });

  const employeeIds = employees.map((e) => e.id);
  const departments: HrDepartment[] = (departmentsRaw ?? []).map((row) => ({
    ...(row as HrDepartment),
    employee_count: employees.filter((e) => e.department_id === row.id && e.is_active).length,
  }));

  const positions: HrPosition[] = (positionsRaw ?? []).map((row) => ({
    ...(row as HrPosition),
    headcount_limit: row.headcount_limit != null ? Number(row.headcount_limit) : null,
    filled_count: employees.filter((e) => e.position_id === row.id && e.is_active).length,
  }));

  let leaveRequests: LeaveRequest[] = [];
  let leaveBalances: LeaveBalance[] = [];
  let attendance: AttendanceRecord[] = [];
  let attendanceHistory: AttendanceRecord[] = [];

  if (employeeIds.length > 0) {
    const [{ data: leaveRaw }, { data: balanceRaw }, { data: attendanceRaw }, { data: historyRaw }] =
      await Promise.all([
      supabase
        .from("leave_requests")
        .select("*")
        .eq("organization_id", orgId)
        .in("employee_id", employeeIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("leave_balances")
        .select("*")
        .eq("organization_id", orgId)
        .in("employee_id", employeeIds),
      supabase
        .from("attendance_records")
        .select("*")
        .eq("organization_id", orgId)
        .in("employee_id", employeeIds)
        .eq("shift_date", todayIso())
        .order("clock_in", { ascending: false }),
      supabase
        .from("attendance_records")
        .select("*")
        .eq("organization_id", orgId)
        .in("employee_id", employeeIds)
        .gte("shift_date", monthStart)
        .lte("shift_date", monthEnd)
        .order("shift_date", { ascending: false }),
    ]);

    leaveRequests = (leaveRaw ?? []) as LeaveRequest[];
    leaveBalances = (balanceRaw ?? []).map((row) => ({
      ...(row as LeaveBalance),
      balance_days: Number(row.balance_days),
      used_days: Number(row.used_days),
      accrued_days: Number(row.accrued_days ?? 0),
      carry_over_days: Number(row.carry_over_days ?? 0),
    }));
    const mapAttendance = (row: Record<string, unknown>): AttendanceRecord => ({
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
      notes: row.notes as string | null,
    });
    attendance = (attendanceRaw ?? []).map(mapAttendance);
    attendanceHistory = (historyRaw ?? []).map(mapAttendance);
  }

  const attendanceSummaries: AttendanceSummary[] = employeeIds.map((employeeId) => {
    const records = attendanceHistory.filter((r) => r.employee_id === employeeId);
    return {
      employee_id: employeeId,
      present_days: records.filter((r) => r.status === "present" || r.status === "late").length,
      absent_days: records.filter((r) => r.status === "absent").length,
      late_days: records.filter((r) => r.status === "late").length,
      leave_days: records.filter((r) => r.status === "leave").length,
      total_working_hours: records.reduce((s, r) => s + Number(r.working_hours ?? 0), 0),
      total_overtime_hours: records.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0),
      total_late_minutes: records.reduce((s, r) => s + Number(r.late_minutes ?? 0), 0),
    };
  });

  const latestPayrollRun = payrollRuns[0];
  const payrollItems = latestPayrollRun
    ? await fetchPayrollItems(latestPayrollRun.id, orgId)
    : [];

  const dashboard = await computeHrDashboard(scope, orgId, employees, leaveRequests, holidays);
  const leaveLedger = await fetchLeaveLedger(orgId);

  return {
    employees,
    departments,
    positions,
    leaveRequests,
    leaveBalances,
    attendance,
    attendanceHistory,
    attendanceSummaries,
    metrics: computeMetrics(employees, departments, positions, leaveRequests, attendance),
    settings,
    leaveTypes,
    holidays,
    leaveCompensationRequests,
    payrollRuns,
    payrollItems,
    dashboard,
    shifts,
    workSchedules,
    leavePolicyRules,
    approvalWorkflows,
    costCenters,
    leaveLedger,
  };
}

export async function insertDepartment(
  input: {
    factory_id?: string;
    code: string;
    name: string;
    description?: string;
    manager_employee_id?: string;
  },
  user: ApiUser
): Promise<HrDepartment> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_departments")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      description: input.description?.trim() || null,
      manager_employee_id: input.manager_employee_id ?? null,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrDepartment;
}

export async function updateDepartmentRecord(
  id: string,
  input: Partial<{
    factory_id: string;
    code: string;
    name: string;
    description: string;
    manager_employee_id: string | null;
    is_active: boolean;
  }>,
  user: ApiUser
): Promise<HrDepartment> {
  const supabase = await createClient();
  if (input.is_active === false) {
    await assertDepartmentCanDeactivate(supabase, user.organization_id, id);
  }
  const { data, error } = await supabase
    .from("hr_departments")
    .update({
      ...(input.factory_id !== undefined ? { factory_id: input.factory_id } : {}),
      ...(input.code != null ? { code: input.code.trim().toUpperCase() } : {}),
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.manager_employee_id !== undefined
        ? { manager_employee_id: input.manager_employee_id }
        : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrDepartment;
}

export async function insertPosition(
  input: {
    factory_id?: string;
    department_id?: string;
    title: string;
    grade?: string;
    description?: string;
    headcount_limit?: number;
  },
  user: ApiUser
): Promise<HrPosition> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_positions")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      department_id: input.department_id ?? null,
      title: input.title.trim(),
      grade: input.grade?.trim() || null,
      description: input.description?.trim() || null,
      headcount_limit: input.headcount_limit ?? null,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrPosition;
}

export async function updatePositionRecord(
  id: string,
  input: Partial<{
    factory_id: string;
    department_id: string | null;
    title: string;
    grade: string;
    description: string;
    headcount_limit: number | null;
    is_active: boolean;
  }>,
  user: ApiUser
): Promise<HrPosition> {
  const supabase = await createClient();
  if (input.is_active === false) {
    await assertPositionCanDeactivate(supabase, user.organization_id, id);
  }
  const { data, error } = await supabase
    .from("hr_positions")
    .update({
      ...(input.factory_id !== undefined ? { factory_id: input.factory_id } : {}),
      ...(input.department_id !== undefined ? { department_id: input.department_id } : {}),
      ...(input.title != null ? { title: input.title.trim() } : {}),
      ...(input.grade !== undefined ? { grade: input.grade || null } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.headcount_limit !== undefined ? { headcount_limit: input.headcount_limit } : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as HrPosition;
}

async function resolvePositionTitle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  positionId?: string | null,
  fallback?: string
): Promise<string> {
  if (!positionId) return fallback?.trim() || "Staff";
  const { data } = await supabase.from("hr_positions").select("title").eq("id", positionId).maybeSingle();
  return (data?.title ?? fallback?.trim()) || "Staff";
}

async function resolveDepartmentName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  departmentId?: string | null,
  fallback?: string
): Promise<string | null> {
  if (!departmentId) return fallback?.trim() || null;
  const { data } = await supabase.from("hr_departments").select("name").eq("id", departmentId).maybeSingle();
  return (data?.name ?? fallback?.trim()) || null;
}

export async function insertEmployee(
  input: {
    factory_id?: string;
    employee_number: string;
    department_id?: string;
    position_id?: string;
    department?: string;
    position?: string;
    manager_employee_id?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    employment_type?: string;
    employment_status?: string;
    salary?: number;
    monthly_allowances?: number;
    hire_date: string;
    date_of_birth?: string;
    gender?: string;
    address?: string;
    city?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    bank_name?: string;
    bank_account_number?: string;
    tax_id?: string;
    notes?: string;
    work_location?: string;
    probation_end_date?: string;
    contract_end_date?: string;
  },
  user: ApiUser
): Promise<Employee> {
  const supabase = await createClient();
  await assertEmployeeHrAssignmentActive(
    supabase,
    user.organization_id,
    input.department_id,
    input.position_id
  );
  const positionTitle = await resolvePositionTitle(supabase, input.position_id, input.position);
  const departmentName = await resolveDepartmentName(supabase, input.department_id, input.department);

  const { data, error } = await supabase
    .from("employees")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      employee_number: input.employee_number.trim(),
      department_id: input.department_id ?? null,
      position_id: input.position_id ?? null,
      manager_employee_id: input.manager_employee_id ?? null,
      department: departmentName,
      position: positionTitle,
      first_name: input.first_name?.trim() || null,
      last_name: input.last_name?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      employment_type: input.employment_type ?? "full_time",
      employment_status: input.employment_status ?? "active",
      salary: input.salary ?? null,
      monthly_allowances: input.monthly_allowances ?? 0,
      hire_date: input.hire_date,
      date_of_birth: input.date_of_birth ?? null,
      gender: input.gender ?? null,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      emergency_contact_name: input.emergency_contact_name?.trim() || null,
      emergency_contact_phone: input.emergency_contact_phone?.trim() || null,
      bank_name: input.bank_name?.trim() || null,
      bank_account_number: input.bank_account_number?.trim() || null,
      tax_id: input.tax_id?.trim() || null,
      notes: input.notes?.trim() || null,
      work_location: input.work_location?.trim() || null,
      probation_end_date: input.probation_end_date ?? null,
      contract_end_date: input.contract_end_date ?? null,
      is_active: true,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await seedEmployeeLeaveBalances(
    data.id,
    user.organization_id,
    input.department_id,
    input.position_id
  );

  await recordEmploymentHistory(
    {
      employee_id: data.id,
      event_type: "hired",
      effective_date: input.hire_date,
      department_id: input.department_id,
      position_id: input.position_id,
      salary: input.salary ?? null,
      notes: "Initial hire",
    },
    user
  );

  return data as Employee;
}

export async function updateEmployeeRecord(
  id: string,
  input: Partial<{
    factory_id: string;
    employee_number: string;
    department_id: string | null;
    position_id: string | null;
    manager_employee_id: string | null;
    department: string;
    position: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    employment_type: string;
    employment_status: string;
    salary: number;
    monthly_allowances: number;
    hire_date: string;
    termination_date: string | null;
    date_of_birth: string | null;
    gender: string | null;
    address: string | null;
    city: string | null;
    emergency_contact_name: string | null;
    emergency_contact_phone: string | null;
    bank_name: string | null;
    bank_account_number: string | null;
    tax_id: string | null;
    notes: string | null;
    work_location: string | null;
    probation_end_date: string | null;
    contract_end_date: string | null;
    is_active: boolean;
  }>,
  user: ApiUser
): Promise<Employee> {
  const supabase = await createClient();

  const { data: current, error: currentError } = await supabase
    .from("employees")
    .select("department_id, position_id, is_active")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (currentError) throw new Error(currentError.message);
  if (!current) throw new Error("Employee not found");

  const willBeActive = input.is_active !== false && (input.is_active === true || current.is_active);
  if (willBeActive) {
    await assertEmployeeHrAssignmentActive(
      supabase,
      user.organization_id,
      input.department_id !== undefined ? input.department_id : (current.department_id as string | null),
      input.position_id !== undefined ? input.position_id : (current.position_id as string | null)
    );
  }

  const positionTitle =
    input.position_id !== undefined
      ? await resolvePositionTitle(supabase, input.position_id, input.position)
      : input.position;
  const departmentName =
    input.department_id !== undefined
      ? await resolveDepartmentName(supabase, input.department_id, input.department)
      : input.department;

  const { data, error } = await supabase
    .from("employees")
    .update({
      ...(input.factory_id !== undefined ? { factory_id: input.factory_id } : {}),
      ...(input.employee_number != null ? { employee_number: input.employee_number.trim() } : {}),
      ...(input.department_id !== undefined ? { department_id: input.department_id } : {}),
      ...(input.position_id !== undefined ? { position_id: input.position_id } : {}),
      ...(input.manager_employee_id !== undefined
        ? { manager_employee_id: input.manager_employee_id }
        : {}),
      ...(departmentName !== undefined ? { department: departmentName } : {}),
      ...(positionTitle != null ? { position: positionTitle } : {}),
      ...(input.first_name !== undefined ? { first_name: input.first_name || null } : {}),
      ...(input.last_name !== undefined ? { last_name: input.last_name || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.employment_type != null ? { employment_type: input.employment_type } : {}),
      ...(input.employment_status != null ? { employment_status: input.employment_status } : {}),
      ...(input.salary !== undefined ? { salary: input.salary } : {}),
      ...(input.monthly_allowances !== undefined
        ? { monthly_allowances: input.monthly_allowances }
        : {}),
      ...(input.hire_date != null ? { hire_date: input.hire_date } : {}),
      ...(input.termination_date !== undefined ? { termination_date: input.termination_date } : {}),
      ...(input.date_of_birth !== undefined ? { date_of_birth: input.date_of_birth } : {}),
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.address !== undefined ? { address: input.address || null } : {}),
      ...(input.city !== undefined ? { city: input.city || null } : {}),
      ...(input.emergency_contact_name !== undefined
        ? { emergency_contact_name: input.emergency_contact_name || null }
        : {}),
      ...(input.emergency_contact_phone !== undefined
        ? { emergency_contact_phone: input.emergency_contact_phone || null }
        : {}),
      ...(input.bank_name !== undefined ? { bank_name: input.bank_name || null } : {}),
      ...(input.bank_account_number !== undefined
        ? { bank_account_number: input.bank_account_number || null }
        : {}),
      ...(input.tax_id !== undefined ? { tax_id: input.tax_id || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      ...(input.work_location !== undefined ? { work_location: input.work_location || null } : {}),
      ...(input.probation_end_date !== undefined
        ? { probation_end_date: input.probation_end_date || null }
        : {}),
      ...(input.contract_end_date !== undefined
        ? { contract_end_date: input.contract_end_date || null }
        : {}),
      ...(input.is_active != null ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Employee;
}

export async function deactivateEmployeeRecord(id: string, user: ApiUser): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id);
  if (error) throw new Error(error.message);
}

export async function insertLeaveRequest(
  input: {
    employee_id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason?: string;
    is_half_day?: boolean;
    half_day_period?: string;
    attachment_document_id?: string;
  },
  user: ApiUser
): Promise<LeaveRequest> {
  const supabase = await createClient();
  const [holidaysRaw, leaveTypes, policyRules, workSchedules] = await Promise.all([
    fetchHolidays(user.organization_id),
    import("@/lib/services/hr-settings").then((m) => m.fetchLeaveTypes(user.organization_id)),
    fetchLeavePolicyRules(user.organization_id),
    fetchWorkSchedules(user.organization_id),
  ]);

  const { data: employee, error: empError } = await supabase
    .from("employees")
    .select("*")
    .eq("id", input.employee_id)
    .eq("organization_id", user.organization_id)
    .single();
  if (empError || !employee) throw new Error("Employee not found");

  const leaveType =
    leaveTypes.find((t) => t.code === input.leave_type.toLowerCase()) ??
    leaveTypes.find((t) => t.code === input.leave_type);
  if (!leaveType) throw new Error("Leave type not found");

  const ctx: EmployeePolicyContext = { employee: employee as Employee };
  const entitlement = resolveLeaveEntitlement(ctx, leaveType, policyRules);
  const schedule = resolveWorkSchedule(workSchedules);
  const holidayDates = holidaysRaw.map((h) => h.holiday_date);
  const daysCount = leaveDaysBetweenWithSchedule(
    input.start_date,
    input.end_date,
    holidayDates,
    schedule,
    { halfDay: input.is_half_day }
  );

  const { data: balance } = await supabase
    .from("leave_balances")
    .select("*")
    .eq("employee_id", input.employee_id)
    .eq("leave_type", input.leave_type.toLowerCase())
    .maybeSingle();

  const remaining = Number(balance?.balance_days ?? 0) - Number(balance?.used_days ?? 0);
  const validationError = validateLeaveRequest({
    ctx,
    leaveType,
    entitlement,
    daysRequested: daysCount,
    remainingBalance: remaining,
    requestStartDate: input.start_date,
    hasAttachment: !!input.attachment_document_id,
  });
  if (validationError) throw new Error(validationError);

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      organization_id: user.organization_id,
      employee_id: input.employee_id,
      leave_type: input.leave_type.toLowerCase(),
      leave_type_id: leaveType.id,
      start_date: input.start_date,
      end_date: input.end_date,
      days_count: daysCount,
      reason: input.reason?.trim() || null,
      is_half_day: input.is_half_day ?? false,
      half_day_period: input.half_day_period ?? null,
      attachment_document_id: input.attachment_document_id ?? null,
      status: "pending",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (!leaveType.requires_approval) {
    return approveLeaveRequest(data.id, "approved", user, undefined, true);
  }

  await import("@/lib/services/notifications").then((m) =>
    m.notifyLeaveRequestSubmitted(data as LeaveRequest, user)
  );
  return data as LeaveRequest;
}

export async function cancelLeaveRequest(id: string, user: ApiUser): Promise<LeaveRequest> {
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();
  if (error || !existing) throw new Error("Leave request not found");
  if (existing.status === "cancelled") throw new Error("Leave request already cancelled");

  if (existing.status === "approved") {
    const days = Number(existing.days_count ?? 0);
    if (days > 0) {
      await reverseLeaveUsage(
        user.organization_id,
        existing.employee_id,
        existing.leave_type,
        days,
        { type: "leave_request", id },
        user.id
      );
    }
  }

  const { data, error: updateError } = await supabase
    .from("leave_requests")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: user.id,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);
  return data as LeaveRequest;
}

export async function approveLeaveRequest(
  id: string,
  status: "approved" | "rejected",
  user: ApiUser,
  rejectionReason?: string,
  skipNotification = false
): Promise<LeaveRequest> {
  const supabase = await createClient();

  const { data: existing, error: fetchError } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();
  if (fetchError || !existing) throw new Error("Leave request not found");

  const days = Number(existing.days_count ?? 0);
  const leaveType = String(existing.leave_type).toLowerCase();

  if (status === "approved" && existing.status === "pending") {
    await recordLeaveUsage(
      user.organization_id,
      existing.employee_id,
      leaveType,
      days,
      { type: "leave_request", id },
      user.id,
      existing.leave_type_id
    );
  }

  if (status === "rejected" && existing.status === "approved" && days > 0) {
    await reverseLeaveUsage(
      user.organization_id,
      existing.employee_id,
      leaveType,
      days,
      { type: "leave_request", id },
      user.id
    );
  }

  const { data, error } = await supabase
    .from("leave_requests")
    .update({
      status,
      approved_by: user.id,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      days_count: days,
      rejection_reason: status === "rejected" ? rejectionReason?.trim() || null : null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (!skipNotification) {
    await import("@/lib/services/notifications").then((m) =>
      m.notifyLeaveRequestReviewed(data as LeaveRequest, status, user)
    );
  }
  return data as LeaveRequest;
}

export async function recordAttendanceAction(
  input: { employee_id: string; action: "clock_in" | "clock_out" },
  user: ApiUser
): Promise<AttendanceRecord> {
  const supabase = await createClient();
  const settings = await getHrSettings(user.organization_id);
  const now = new Date().toISOString();
  const shiftDate = todayIso();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, factory_id")
    .eq("id", input.employee_id)
    .eq("organization_id", user.organization_id)
    .single();
  if (!employee) throw new Error("Employee not found");

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("employee_id", input.employee_id)
    .eq("shift_date", shiftDate)
    .maybeSingle();

  if (input.action === "clock_in") {
    if (existing?.clock_in) throw new Error("Employee already clocked in today");
    const metrics = computeAttendanceMetrics({
      clockIn: now,
      clockOut: null,
      workStartTime: settings.work_start_time,
      workEndTime: settings.work_end_time,
      lateGraceMinutes: settings.late_grace_minutes,
      standardWorkHours: settings.standard_work_hours,
    });
    const { data, error } = await supabase
      .from("attendance_records")
      .insert({
        organization_id: user.organization_id,
        employee_id: input.employee_id,
        factory_id: employee.factory_id,
        shift_date: shiftDate,
        clock_in: now,
        status: metrics.status,
        late_minutes: metrics.lateMinutes,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapAttendanceRow(data);
  }

  if (!existing?.clock_in) throw new Error("Employee has not clocked in today");
  if (existing.clock_out) throw new Error("Employee already clocked out today");

  const metrics = computeAttendanceMetrics({
    clockIn: existing.clock_in,
    clockOut: now,
    workStartTime: settings.work_start_time,
    workEndTime: settings.work_end_time,
    lateGraceMinutes: settings.late_grace_minutes,
    standardWorkHours: settings.standard_work_hours,
    overtimeMultiplier: settings.overtime_multiplier,
  });

  const { data, error } = await supabase
    .from("attendance_records")
    .update({
      clock_out: now,
      status: metrics.status,
      working_hours: metrics.workingHours,
      overtime_hours: metrics.overtimeHours,
      late_minutes: metrics.lateMinutes,
      early_departure_minutes: metrics.earlyDepartureMinutes,
    })
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return mapAttendanceRow(data);
}

function mapAttendanceRow(row: Record<string, unknown>): AttendanceRecord {
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
    notes: row.notes as string | null,
  };
}

export async function markAttendanceStatus(
  input: {
    employee_id: string;
    shift_date: string;
    status: AttendanceRecord["status"];
    notes?: string;
  },
  user: ApiUser
): Promise<AttendanceRecord> {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, factory_id")
    .eq("id", input.employee_id)
    .eq("organization_id", user.organization_id)
    .single();
  if (!employee) throw new Error("Employee not found");

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("employee_id", input.employee_id)
    .eq("shift_date", input.shift_date)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from("attendance_records")
      .update({ status: input.status, notes: input.notes?.trim() || existing.notes })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapAttendanceRow(data);
  }

  const { data, error } = await supabase
    .from("attendance_records")
    .insert({
      organization_id: user.organization_id,
      employee_id: input.employee_id,
      factory_id: employee.factory_id,
      shift_date: input.shift_date,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapAttendanceRow(data);
}

export async function submitAttendanceCorrection(
  input: {
    employee_id: string;
    shift_date: string;
    reason: string;
    new_clock_in?: string;
    new_clock_out?: string;
    new_status?: AttendanceRecord["status"];
  },
  user: ApiUser
) {
  const supabase = await createClient();
  const settings = await getHrSettings(user.organization_id);

  const { data: existing } = await supabase
    .from("attendance_records")
    .select("*")
    .eq("employee_id", input.employee_id)
    .eq("shift_date", input.shift_date)
    .maybeSingle();

  const { data, error } = await supabase
    .from("hr_attendance_corrections")
    .insert({
      organization_id: user.organization_id,
      attendance_record_id: existing?.id ?? null,
      employee_id: input.employee_id,
      shift_date: input.shift_date,
      reason: input.reason.trim(),
      old_clock_in: existing?.clock_in ?? null,
      new_clock_in: input.new_clock_in ?? existing?.clock_in ?? null,
      old_clock_out: existing?.clock_out ?? null,
      new_clock_out: input.new_clock_out ?? existing?.clock_out ?? null,
      old_status: existing?.status ?? null,
      new_status: input.new_status ?? existing?.status ?? "present",
      status: settings.attendance_correction_requires_approval ? "pending" : "approved",
      corrected_by: user.id,
      approved_by: settings.attendance_correction_requires_approval ? null : user.id,
      reviewed_at: settings.attendance_correction_requires_approval ? null : new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (settings.attendance_correction_requires_approval) {
    void import("@/lib/services/notifications").then((m) =>
      m.notifyAttendanceCorrectionPending(
        {
          id: data.id as string,
          employee_id: input.employee_id,
          shift_date: input.shift_date,
          reason: input.reason.trim(),
        },
        user
      )
    );
  }

  if (!settings.attendance_correction_requires_approval) {
    await applyAttendanceCorrection(data.id, user);
  }
  return data;
}

export async function applyAttendanceCorrection(correctionId: string, user: ApiUser) {
  const supabase = await createClient();
  const { data: correction, error } = await supabase
    .from("hr_attendance_corrections")
    .select("*")
    .eq("id", correctionId)
    .eq("organization_id", user.organization_id)
    .single();
  if (error || !correction) throw new Error("Correction not found");

  const settings = await getHrSettings(user.organization_id);
  const metrics = computeAttendanceMetrics({
    clockIn: correction.new_clock_in,
    clockOut: correction.new_clock_out,
    workStartTime: settings.work_start_time,
    workEndTime: settings.work_end_time,
    lateGraceMinutes: settings.late_grace_minutes,
    standardWorkHours: settings.standard_work_hours,
  });

  if (correction.attendance_record_id) {
    await supabase
      .from("attendance_records")
      .update({
        clock_in: correction.new_clock_in,
        clock_out: correction.new_clock_out,
        status: correction.new_status ?? metrics.status,
        working_hours: metrics.workingHours,
        overtime_hours: metrics.overtimeHours,
        late_minutes: metrics.lateMinutes,
        early_departure_minutes: metrics.earlyDepartureMinutes,
        is_corrected: true,
      })
      .eq("id", correction.attendance_record_id);
  } else {
    const { data: employee } = await supabase
      .from("employees")
      .select("factory_id")
      .eq("id", correction.employee_id)
      .single();
    await supabase.from("attendance_records").insert({
      organization_id: user.organization_id,
      employee_id: correction.employee_id,
      factory_id: employee?.factory_id,
      shift_date: correction.shift_date,
      clock_in: correction.new_clock_in,
      clock_out: correction.new_clock_out,
      status: correction.new_status ?? metrics.status,
      working_hours: metrics.workingHours,
      overtime_hours: metrics.overtimeHours,
      late_minutes: metrics.lateMinutes,
      early_departure_minutes: metrics.earlyDepartureMinutes,
      is_corrected: true,
    });
  }

  await supabase
    .from("hr_attendance_corrections")
    .update({ status: "approved", approved_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", correctionId);
}

export async function recordEmploymentHistory(
  input: {
    employee_id: string;
    event_type: string;
    effective_date: string;
    department_id?: string | null;
    position_id?: string | null;
    salary?: number | null;
    notes?: string;
  },
  user: ApiUser
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hr_employment_history")
    .insert({
      organization_id: user.organization_id,
      employee_id: input.employee_id,
      event_type: input.event_type,
      effective_date: input.effective_date,
      department_id: input.department_id ?? null,
      position_id: input.position_id ?? null,
      salary: input.salary ?? null,
      notes: input.notes?.trim() || null,
      recorded_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
