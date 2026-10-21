"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Building2,
  Calendar,
  Check,
  Clock,
  Plus,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { HrDashboardPanel } from "@/components/hr/hr-dashboard-panel";
import { HrPayrollPanel } from "@/components/hr/hr-payroll-panel";
import { HrPoliciesPanel } from "@/components/hr/hr-policies-panel";
import { HrSettingsPanel } from "@/components/hr/hr-settings-panel";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { RowActions } from "@/components/crud/row-actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useHr } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  FACTORY_IDS,
  type AttendanceRecord,
  type AttendanceSummary,
  type Employee,
  type HrCostCenter,
  type HrDashboardMetrics,
  type HrDepartment,
  type HrHoliday,
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
} from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract"];
const EMPLOYMENT_STATUSES = ["active", "probation", "on_leave", "terminated", "resigned"];

function employeeName(employee: Employee) {
  const full = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
  return full || employee.employee_number;
}

export function HrModule() {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const now = new Date();
  const [attendanceMonth, setAttendanceMonth] = useState(now.getMonth() + 1);
  const [attendanceYear, setAttendanceYear] = useState(now.getFullYear());
  const [selectedPayrollRunId, setSelectedPayrollRunId] = useState<string | undefined>();
  const { data, isLoading, mutate } = useHr({ attendanceMonth, attendanceYear });
  const canManage = hasPermission("hr", "manage");
  const canPayroll = hasPermission("hr", "payroll") || canManage;
  const canApproveLeave = hasPermission("hr", "approve_leave") || canManage;
  const canViewSalary = hasPermission("hr", "view_salary") || canManage;
  const canManagePolicies = hasPermission("hr", "manage_policies") || canManage;

  const defaultFactoryId =
    viewScope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  const employees = (data?.employees ?? []) as Employee[];
  const departments = (data?.departments ?? []) as HrDepartment[];
  const positions = (data?.positions ?? []) as HrPosition[];
  const leaveRequests = (data?.leaveRequests ?? []) as LeaveRequest[];
  const leaveBalances = (data?.leaveBalances ?? []) as LeaveBalance[];
  const attendance = (data?.attendance ?? []) as AttendanceRecord[];
  const attendanceHistory = (data?.attendanceHistory ?? []) as AttendanceRecord[];
  const attendanceSummaries = (data?.attendanceSummaries ?? []) as AttendanceSummary[];
  const settings = (data?.settings ?? {
    work_start_time: "08:00",
    work_end_time: "17:00",
    late_grace_minutes: 15,
    standard_work_hours: 8,
    overtime_multiplier: 1.5,
    leave_compensation_enabled: true,
    leave_compensation_daily_rate_divisor: 30,
    payroll_tax_rate_percent: 0,
    payroll_day_of_month: 25,
  }) as HrSettings;
  const leaveTypes = (data?.leaveTypes ?? []) as HrLeaveType[];
  const holidays = (data?.holidays ?? []) as HrHoliday[];
  const leaveCompensationRequests = (data?.leaveCompensationRequests ?? []) as HrLeaveCompensationRequest[];
  const payrollRuns = (data?.payrollRuns ?? []) as HrPayrollRun[];
  const payrollItems = (data?.payrollItems ?? []) as HrPayrollItem[];
  const dashboard = (data?.dashboard ?? {
    headcount: 0,
    activeEmployees: 0,
    onProbation: 0,
    pendingLeave: 0,
    pendingApprovals: 0,
    absentToday: 0,
    overtimeHoursMonth: 0,
    payrollExpenseMonth: 0,
    leaveLiabilityDays: 0,
    contractsExpiring30: 0,
    probationExpiring30: 0,
    upcomingHolidays: [],
  }) as HrDashboardMetrics;
  const shifts = (data?.shifts ?? []) as HrShift[];
  const workSchedules = (data?.workSchedules ?? []) as HrWorkSchedule[];
  const leavePolicyRules = (data?.leavePolicyRules ?? []) as HrLeavePolicyRule[];
  const costCenters = (data?.costCenters ?? []) as HrCostCenter[];
  const leaveTypeCodes = leaveTypes.filter((t) => t.is_active).map((t) => t.code);

  const visibleEmployees = canViewSalary
    ? employees
    : employees.map((e) => ({ ...e, salary: null, bank_account_number: null }));
  const metrics = (data?.metrics ?? {
    totalEmployees: 0,
    activeEmployees: 0,
    presentToday: 0,
    pendingLeave: 0,
    departmentCount: 0,
    positionCount: 0,
    blockEmployees: 0,
    recyclingEmployees: 0,
  }) as HrMetrics;

  const scopedDepartments = useMemo(
    () => departments.filter((d) => d.is_active),
    [departments]
  );
  const scopedPositions = useMemo(
    () => positions.filter((p) => p.is_active),
    [positions]
  );

  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [deptFormOpen, setDeptFormOpen] = useState(false);
  const [posFormOpen, setPosFormOpen] = useState(false);
  const [leaveFormOpen, setLeaveFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editingDept, setEditingDept] = useState<HrDepartment | null>(null);
  const [editingPos, setEditingPos] = useState<HrPosition | null>(null);
  const [deleteEmployee, setDeleteEmployee] = useState<Employee | null>(null);

  const [employeeForm, setEmployeeForm] = useState({
    employee_number: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    factory_id: defaultFactoryId as string,
    department_id: "",
    position_id: "",
    manager_employee_id: "",
    employment_type: "full_time",
    employment_status: "active",
    salary: "",
    monthly_allowances: "",
    hire_date: "",
    date_of_birth: "",
    gender: "",
    address: "",
    city: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    bank_name: "",
    bank_account_number: "",
    tax_id: "",
    notes: "",
  });

  const [deptForm, setDeptForm] = useState({
    code: "",
    name: "",
    description: "",
    factory_id: defaultFactoryId as string,
    manager_employee_id: "",
  });

  const [posForm, setPosForm] = useState({
    title: "",
    grade: "",
    description: "",
    factory_id: defaultFactoryId as string,
    department_id: "",
    headcount_limit: "",
  });

  const [leaveCompFormOpen, setLeaveCompFormOpen] = useState(false);
  const [leaveCompForm, setLeaveCompForm] = useState({
    employee_id: "",
    leave_type: "annual",
    days_converted: "",
    notes: "",
  });

  const [leaveForm, setLeaveForm] = useState({
    employee_id: "",
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });

  const scopeLabel =
    viewScope === "combined"
      ? "Overall Company"
      : FACTORY_NAMES[defaultFactoryId] ?? viewScope;

  const getEmployeeLabel = (id: string) => {
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.employee_number} — ${employeeName(emp)}` : id;
  };

  const getLeaveBalance = (employeeId: string, leaveType: string) => {
    const row = leaveBalances.find(
      (b) => b.employee_id === employeeId && b.leave_type === leaveType.toLowerCase()
    );
    if (!row) return "—";
    return `${row.balance_days - row.used_days} / ${row.balance_days} days`;
  };

  const positionsForFactory = (factoryId: string, includePositionIds: string[] = []) => {
    const active = scopedPositions.filter((p) => p.factory_id === factoryId);
    const extras = positions.filter(
      (p) =>
        includePositionIds.includes(p.id) &&
        !p.is_active &&
        !active.some((item) => item.id === p.id)
    );
    return [...active, ...extras];
  };

  const departmentsForFactory = (factoryId: string, includeDepartmentIds: string[] = []) => {
    const active = scopedDepartments.filter((d) => d.factory_id === factoryId);
    const extras = departments.filter(
      (d) =>
        includeDepartmentIds.includes(d.id) &&
        !d.is_active &&
        !active.some((item) => item.id === d.id)
    );
    return [...active, ...extras];
  };

  const editingAssignmentIds = editingEmployee
    ? {
        departmentIds: editingEmployee.department_id ? [editingEmployee.department_id] : [],
        positionIds: editingEmployee.position_id ? [editingEmployee.position_id] : [],
      }
    : { departmentIds: [] as string[], positionIds: [] as string[] };

  const countActiveEmployeesOnDepartment = (departmentId: string) => {
    const positionIds = new Set(
      positions.filter((p) => p.department_id === departmentId).map((p) => p.id)
    );
    return employees.filter(
      (e) =>
        e.is_active &&
        (e.department_id === departmentId ||
          (e.position_id != null && positionIds.has(e.position_id)))
    ).length;
  };

  const countActiveEmployeesOnPosition = (positionId: string) =>
    employees.filter((e) => e.is_active && e.position_id === positionId).length;

  const tryDeactivateDepartment = (row: HrDepartment) => {
    const assigned = countActiveEmployeesOnDepartment(row.id);
    if (assigned > 0) {
      toast.error(
        `Cannot deactivate ${row.name}: ${assigned} active employee(s) still assigned. Reassign or deactivate them first.`
      );
      return;
    }
    post({ action: "delete_department", id: row.id }, "Department deactivated");
  };

  const tryDeactivatePosition = (row: HrPosition) => {
    const assigned = countActiveEmployeesOnPosition(row.id);
    if (assigned > 0) {
      toast.error(
        `Cannot deactivate ${row.title}: ${assigned} active employee(s) still assigned. Reassign or deactivate them first.`
      );
      return;
    }
    post({ action: "delete_position", id: row.id }, "Position deactivated");
  };

  const renderAssignmentCell = (
    label: string | null | undefined,
    recordId: string | null | undefined,
    records: { id: string; is_active: boolean }[]
  ) => {
    const record = recordId ? records.find((item) => item.id === recordId) : null;
    if (!label) return "—";
    if (record && !record.is_active) {
      return (
        <div className="space-y-1">
          <p>{label}</p>
          <Badge variant="secondary" className="text-[10px]">
            Inactive org unit
          </Badge>
        </div>
      );
    }
    return label;
  };

  const resetEmployeeForm = () =>
    setEmployeeForm({
      employee_number: "",
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      factory_id: defaultFactoryId,
      department_id: departmentsForFactory(defaultFactoryId)[0]?.id ?? "",
      position_id: positionsForFactory(defaultFactoryId)[0]?.id ?? "",
      manager_employee_id: "",
      employment_type: "full_time",
      employment_status: "active",
      salary: "",
      monthly_allowances: "",
      hire_date: "",
      date_of_birth: "",
      gender: "",
      address: "",
      city: "",
      emergency_contact_name: "",
      emergency_contact_phone: "",
      bank_name: "",
      bank_account_number: "",
      tax_id: "",
      notes: "",
    });

  const post = (payload: Record<string, unknown>, success: string) => {
    mutate.mutate(payload, {
      onSuccess: () => toast.success(success),
      onError: (err) => toast.error(err instanceof Error ? err.message : "HR action failed"),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Human Resources"
        description={`Workforce management for ${scopeLabel} — employees, leave, attendance, payroll, and finance integration.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <MetricCard title="Active Staff" value={metrics.activeEmployees} icon={<Users className="size-4" />} info="Total number of currently active employees." />
        <MetricCard title="Present Today" value={metrics.presentToday} icon={<UserCheck className="size-4" />} info="Number of employees checked in as present today." />
        <MetricCard title="Pending Leave" value={metrics.pendingLeave} icon={<Calendar className="size-4" />} info="Leave requests awaiting approval." />
        <MetricCard title="Departments" value={metrics.departmentCount} icon={<Building2 className="size-4" />} info="Number of distinct departments." />
        <MetricCard title="Positions" value={metrics.positionCount} icon={<Briefcase className="size-4" />} info="Number of distinct job positions." />
        {viewScope === "combined" && (
          <MetricCard
            title="Block / Recycling"
            value={`${metrics.blockEmployees} / ${metrics.recyclingEmployees}`}
            info="Active staff count split between the Block factory and the Recycling factory."
          />
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <HrDashboardPanel dashboard={dashboard} />
        </TabsContent>

        <TabsContent value="employees" className="mt-6">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Employee Directory</CardTitle>
                <CardDescription>Profiles linked to factory departments and positions</CardDescription>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setEditingEmployee(null);
                    resetEmployeeForm();
                    setEmployeeFormOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add Employee
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable
                data={visibleEmployees}
                getRowKey={(row) => row.id}
                onRowClick={(row) => router.push(`/dashboard/hr/${row.id}`)}
                columns={[
                  {
                    id: "number",
                    header: "Employee",
                    cell: (row) => (
                      <div>
                        <p className="font-mono text-sm">{row.employee_number}</p>
                        <p className="text-xs text-muted-foreground">{employeeName(row)}</p>
                      </div>
                    ),
                  },
                  { id: "position", header: "Position", cell: (row) => renderAssignmentCell(row.position, row.position_id, positions) },
                  {
                    id: "department",
                    header: "Department",
                    cell: (row) => renderAssignmentCell(row.department, row.department_id, departments),
                  },
                  {
                    id: "factory",
                    header: "Factory",
                    cell: (row) => (
                      <Badge variant="outline" className="text-[10px]">
                        {FACTORY_NAMES[row.factory_id ?? ""] ?? "—"}
                      </Badge>
                    ),
                  },
                  {
                    id: "salary",
                    header: "Salary",
                    cell: (row) =>
                      canViewSalary && row.salary != null ? formatCurrency(row.salary) : "—",
                  },
                  {
                    id: "hire",
                    header: "Hire Date",
                    cell: (row) => formatDate(row.hire_date),
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    ),
                  },
                  ...(canManage
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: Employee) => (
                            <RowActions
                              onEdit={() => {
                                setEditingEmployee(row);
                                setEmployeeForm({
                                  employee_number: row.employee_number,
                                  first_name: row.first_name ?? "",
                                  last_name: row.last_name ?? "",
                                  email: row.email ?? "",
                                  phone: row.phone ?? "",
                                  factory_id: row.factory_id ?? defaultFactoryId,
                                  department_id: row.department_id ?? "",
                                  position_id: row.position_id ?? "",
                                  manager_employee_id: row.manager_employee_id ?? "",
                                  employment_type: row.employment_type ?? "full_time",
                                  employment_status: row.employment_status ?? "active",
                                  salary: row.salary != null ? String(row.salary) : "",
                                  monthly_allowances:
                                    row.monthly_allowances != null
                                      ? String(row.monthly_allowances)
                                      : "",
                                  hire_date: row.hire_date.slice(0, 10),
                                  date_of_birth: row.date_of_birth?.slice(0, 10) ?? "",
                                  gender: row.gender ?? "",
                                  address: row.address ?? "",
                                  city: row.city ?? "",
                                  emergency_contact_name: row.emergency_contact_name ?? "",
                                  emergency_contact_phone: row.emergency_contact_phone ?? "",
                                  bank_name: row.bank_name ?? "",
                                  bank_account_number: row.bank_account_number ?? "",
                                  tax_id: row.tax_id ?? "",
                                  notes: row.notes ?? "",
                                });
                                setEmployeeFormOpen(true);
                              }}
                              onDelete={
                                row.is_active ? () => setDeleteEmployee(row) : undefined
                              }
                              onRestore={
                                row.is_active
                                  ? undefined
                                  : () =>
                                      post(
                                        { action: "reactivate_employee", id: row.id },
                                        "Employee reactivated"
                                      )
                              }
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="departments" className="mt-6">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Departments</CardTitle>
                <CardDescription>Organizational units per factory</CardDescription>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setEditingDept(null);
                    setDeptForm({
                      code: "",
                      name: "",
                      description: "",
                      factory_id: defaultFactoryId,
                      manager_employee_id: "",
                    });
                    setDeptFormOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add Department
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable
                data={departments}
                getRowKey={(row) => row.id}
                columns={[
                  { id: "code", header: "Code", cell: (row) => <span className="font-mono text-sm">{row.code}</span> },
                  { id: "name", header: "Name", cell: (row) => row.name },
                  {
                    id: "factory",
                    header: "Factory",
                    cell: (row) => FACTORY_NAMES[row.factory_id ?? ""] ?? "—",
                  },
                  {
                    id: "staff",
                    header: "Staff",
                    cell: (row) => row.employee_count ?? 0,
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    ),
                  },
                  ...(canManage
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: HrDepartment) => (
                            <RowActions
                              onEdit={() => {
                                setEditingDept(row);
                                setDeptForm({
                                  code: row.code,
                                  name: row.name,
                                  description: row.description ?? "",
                                  factory_id: row.factory_id ?? defaultFactoryId,
                                  manager_employee_id: row.manager_employee_id ?? "",
                                });
                                setDeptFormOpen(true);
                              }}
                              onDelete={
                                row.is_active
                                  ? () => tryDeactivateDepartment(row)
                                  : undefined
                              }
                              onRestore={
                                row.is_active
                                  ? undefined
                                  : () =>
                                      post(
                                        { action: "reactivate_department", id: row.id },
                                        "Department reactivated"
                                      )
                              }
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="mt-6">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Positions</CardTitle>
                <CardDescription>Job titles, grades, and headcount limits</CardDescription>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => {
                    setEditingPos(null);
                    setPosForm({
                      title: "",
                      grade: "",
                      description: "",
                      factory_id: defaultFactoryId,
                      department_id: departmentsForFactory(defaultFactoryId)[0]?.id ?? "",
                      headcount_limit: "",
                    });
                    setPosFormOpen(true);
                  }}
                >
                  <Plus className="size-4" />
                  Add Position
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <DataTable
                data={positions}
                getRowKey={(row) => row.id}
                columns={[
                  { id: "title", header: "Title", cell: (row) => row.title },
                  { id: "grade", header: "Grade", cell: (row) => row.grade ?? "—" },
                  {
                    id: "dept",
                    header: "Department",
                    cell: (row) =>
                      departments.find((d) => d.id === row.department_id)?.name ?? "—",
                  },
                  {
                    id: "factory",
                    header: "Factory",
                    cell: (row) => FACTORY_NAMES[row.factory_id ?? ""] ?? "—",
                  },
                  {
                    id: "headcount",
                    header: "Filled / Limit",
                    cell: (row) =>
                      row.headcount_limit
                        ? `${row.filled_count ?? 0} / ${row.headcount_limit}`
                        : row.filled_count ?? 0,
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge status={row.is_active ? "active" : "inactive"} />
                    ),
                  },
                  ...(canManage
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: HrPosition) => (
                            <RowActions
                              onEdit={() => {
                                setEditingPos(row);
                                setPosForm({
                                  title: row.title,
                                  grade: row.grade ?? "",
                                  description: row.description ?? "",
                                  factory_id: row.factory_id ?? defaultFactoryId,
                                  department_id: row.department_id ?? "",
                                  headcount_limit:
                                    row.headcount_limit != null ? String(row.headcount_limit) : "",
                                });
                                setPosFormOpen(true);
                              }}
                              onDelete={
                                row.is_active ? () => tryDeactivatePosition(row) : undefined
                              }
                              onRestore={
                                row.is_active
                                  ? undefined
                                  : () =>
                                      post(
                                        { action: "reactivate_position", id: row.id },
                                        "Position reactivated"
                                      )
                              }
                            />
                          ),
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="mt-6 space-y-6">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Leave Management</CardTitle>
                <CardDescription>Requests with balance tracking, approvals, and history</CardDescription>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setLeaveCompForm({
                        employee_id: employees[0]?.id ?? "",
                        leave_type: leaveTypeCodes[0] ?? "annual",
                        days_converted: "",
                        notes: "",
                      });
                      setLeaveCompFormOpen(true);
                    }}
                  >
                    Convert to Pay
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => {
                      setLeaveForm({
                        employee_id: employees[0]?.id ?? "",
                        leave_type: leaveTypeCodes[0] ?? "annual",
                        start_date: "",
                        end_date: "",
                        reason: "",
                      });
                      setLeaveFormOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    Request Leave
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <DataTable
                data={leaveRequests}
                getRowKey={(row) => row.id}
                emptyMessage="No leave requests for this scope"
                columns={[
                  {
                    id: "employee",
                    header: "Employee",
                    cell: (row) => getEmployeeLabel(row.employee_id),
                  },
                  {
                    id: "type",
                    header: "Type",
                    cell: (row) => (
                      <span className="capitalize">{row.leave_type.replace(/_/g, " ")}</span>
                    ),
                  },
                  {
                    id: "days",
                    header: "Days",
                    cell: (row) => row.days_count ?? "—",
                  },
                  {
                    id: "balance",
                    header: "Balance Left",
                    cell: (row) => getLeaveBalance(row.employee_id, row.leave_type),
                  },
                  {
                    id: "dates",
                    header: "Dates",
                    cell: (row) => `${formatDate(row.start_date)} → ${formatDate(row.end_date)}`,
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={
                          row.status === "approved"
                            ? "completed"
                            : row.status === "rejected"
                              ? "rejected"
                              : "pending"
                        }
                        label={row.status}
                      />
                    ),
                  },
                  ...(canApproveLeave
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: LeaveRequest) =>
                            row.status === "pending" ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 border-success/25 bg-success/[0.06] text-success"
                                  disabled={mutate.isPending}
                                  onClick={() =>
                                    post(
                                      { action: "approve_leave", id: row.id, status: "approved" },
                                      "Leave approved"
                                    )
                                  }
                                >
                                  <Check className="size-3.5" />
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 border-destructive/30 bg-destructive/5 text-destructive"
                                  disabled={mutate.isPending}
                                  onClick={() =>
                                    post(
                                      { action: "approve_leave", id: row.id, status: "rejected" },
                                      "Leave rejected"
                                    )
                                  }
                                >
                                  <X className="size-3.5" />
                                  Reject
                                </Button>
                              </div>
                            ) : null,
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Leave Compensation Requests</CardTitle>
              <CardDescription>Convert unused leave to monetary compensation for payroll</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={leaveCompensationRequests}
                getRowKey={(row) => row.id}
                emptyMessage="No leave compensation requests"
                columns={[
                  {
                    id: "employee",
                    header: "Employee",
                    cell: (row) => getEmployeeLabel(row.employee_id),
                  },
                  { id: "type", header: "Leave Type", cell: (row) => row.leave_type },
                  { id: "days", header: "Days", cell: (row) => row.days_converted },
                  { id: "amount", header: "Amount", cell: (row) => formatCurrency(row.amount) },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={
                          row.status === "approved" || row.status === "paid"
                            ? "completed"
                            : row.status === "rejected"
                              ? "rejected"
                              : "pending"
                        }
                        label={row.status}
                      />
                    ),
                  },
                  ...(canApproveLeave
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: HrLeaveCompensationRequest) =>
                            row.status === "pending" ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  onClick={() =>
                                    post(
                                      {
                                        action: "review_leave_compensation",
                                        id: row.id,
                                        status: "approved",
                                      },
                                      "Compensation approved"
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  onClick={() =>
                                    post(
                                      {
                                        action: "review_leave_compensation",
                                        id: row.id,
                                        status: "rejected",
                                      },
                                      "Compensation rejected"
                                    )
                                  }
                                >
                                  Reject
                                </Button>
                              </div>
                            ) : null,
                        },
                      ]
                    : []),
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-6 space-y-6">
          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle>Today&apos;s Attendance</CardTitle>
              <CardDescription>
                Clock-in/out — work hours {settings.work_start_time} to {settings.work_end_time}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={attendance}
                getRowKey={(row) => row.id}
                emptyMessage="No attendance records for today"
                columns={[
                  {
                    id: "employee",
                    header: "Employee",
                    cell: (row) => getEmployeeLabel(row.employee_id),
                  },
                  { id: "in", header: "Clock In", cell: (row) => row.clock_in ?? "—" },
                  { id: "out", header: "Clock Out", cell: (row) => row.clock_out ?? "—" },
                  {
                    id: "hours",
                    header: "Hours",
                    cell: (row) => (row.working_hours != null ? `${row.working_hours}h` : "—"),
                  },
                  {
                    id: "ot",
                    header: "OT",
                    cell: (row) =>
                      row.overtime_hours && row.overtime_hours > 0 ? `${row.overtime_hours}h` : "—",
                  },
                  {
                    id: "late",
                    header: "Late",
                    cell: (row) =>
                      row.late_minutes && row.late_minutes > 0 ? `${row.late_minutes}m` : "—",
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={
                          row.status === "present"
                            ? "active"
                            : row.status === "late"
                              ? "on_hold"
                              : "inactive"
                        }
                        label={row.status}
                      />
                    ),
                  },
                  ...(canManage
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: AttendanceRecord) => {
                            const emp = employees.find((e) => e.id === row.employee_id);
                            if (!emp?.is_active) return null;
                            return (
                              <div className="flex gap-1">
                                {!row.clock_in && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1"
                                    onClick={() =>
                                      post(
                                        {
                                          action: "record_attendance",
                                          employee_id: row.employee_id,
                                          record_action: "clock_in",
                                        },
                                        "Clocked in"
                                      )
                                    }
                                  >
                                    <Clock className="size-3.5" />
                                    In
                                  </Button>
                                )}
                                {row.clock_in && !row.clock_out && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1"
                                    onClick={() =>
                                      post(
                                        {
                                          action: "record_attendance",
                                          employee_id: row.employee_id,
                                          record_action: "clock_out",
                                        },
                                        "Clocked out"
                                      )
                                    }
                                  >
                                    Out
                                  </Button>
                                )}
                              </div>
                            );
                          },
                        },
                      ]
                    : []),
                ]}
              />
              {canManage && employees.some((e) => e.is_active) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <p className="w-full text-xs text-muted-foreground">Quick clock-in (no record yet today):</p>
                  {employees
                    .filter(
                      (e) =>
                        e.is_active &&
                        !attendance.some((a) => a.employee_id === e.id && a.clock_in)
                    )
                    .map((emp) => (
                      <Button
                        key={emp.id}
                        size="sm"
                        variant="secondary"
                        className="text-xs"
                        onClick={() =>
                          post(
                            {
                              action: "record_attendance",
                              employee_id: emp.id,
                              record_action: "clock_in",
                            },
                            `${emp.employee_number} clocked in`
                          )
                        }
                      >
                        {emp.employee_number}
                      </Button>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Monthly Attendance Report</CardTitle>
                <CardDescription>Daily records and per-employee summaries</CardDescription>
              </div>
              <div className="flex gap-2">
                <Select
                  value={String(attendanceMonth)}
                  onValueChange={(v) => setAttendanceMonth(Number(v))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {new Date(2000, m - 1).toLocaleString("default", { month: "long" })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-24"
                  value={attendanceYear}
                  onChange={(e) => setAttendanceYear(Number(e.target.value))}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <DataTable
                data={attendanceSummaries}
                getRowKey={(row) => row.employee_id}
                emptyMessage="No attendance data for this month"
                columns={[
                  {
                    id: "employee",
                    header: "Employee",
                    cell: (row) => getEmployeeLabel(row.employee_id),
                  },
                  { id: "present", header: "Present", cell: (row) => row.present_days },
                  { id: "absent", header: "Absent", cell: (row) => row.absent_days },
                  { id: "late", header: "Late", cell: (row) => row.late_days },
                  { id: "leave", header: "Leave", cell: (row) => row.leave_days },
                  {
                    id: "hours",
                    header: "Total Hours",
                    cell: (row) => row.total_working_hours.toFixed(1),
                  },
                  {
                    id: "ot",
                    header: "Overtime",
                    cell: (row) => row.total_overtime_hours.toFixed(1),
                  },
                ]}
              />
              <DataTable
                data={attendanceHistory}
                getRowKey={(row) => row.id}
                emptyMessage="No daily records for this month"
                columns={[
                  {
                    id: "employee",
                    header: "Employee",
                    cell: (row) => getEmployeeLabel(row.employee_id),
                  },
                  { id: "date", header: "Date", cell: (row) => formatDate(row.shift_date) },
                  { id: "in", header: "In", cell: (row) => row.clock_in ?? "—" },
                  { id: "out", header: "Out", cell: (row) => row.clock_out ?? "—" },
                  { id: "hours", header: "Hours", cell: (row) => row.working_hours ?? "—" },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={
                          row.status === "present"
                            ? "active"
                            : row.status === "late"
                              ? "on_hold"
                              : row.status === "leave"
                                ? "processing"
                                : "inactive"
                        }
                        label={row.status}
                      />
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payroll" className="mt-6">
          <HrPayrollPanel
            payrollRuns={payrollRuns}
            payrollItems={payrollItems}
            employees={employees}
            canPayroll={canPayroll}
            defaultFactoryId={defaultFactoryId}
            selectedRunId={selectedPayrollRunId ?? payrollRuns[0]?.id}
            onSelectRun={setSelectedPayrollRunId}
            onAction={post}
          />
        </TabsContent>

        <TabsContent value="policies" className="mt-6">
          <HrPoliciesPanel
            shifts={shifts}
            workSchedules={workSchedules}
            leavePolicyRules={leavePolicyRules}
            leaveTypes={leaveTypes}
            costCenters={costCenters}
            canManage={canManagePolicies}
            onAction={post}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          <HrSettingsPanel
            settings={settings}
            leaveTypes={leaveTypes}
            holidays={holidays}
            canManage={canManage}
            onAction={post}
          />
        </TabsContent>
      </Tabs>

      <EntityFormDialog
        open={employeeFormOpen}
        onOpenChange={setEmployeeFormOpen}
        title={editingEmployee ? "Edit Employee" : "Add Employee"}
        submitLabel={editingEmployee ? "Save Changes" : "Add Employee"}
        isSubmitting={mutate.isPending}
        contentClassName="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
        onSubmit={() => {
          if (!employeeForm.employee_number.trim() || !employeeForm.position_id) {
            toast.error("Employee number and position are required");
            return;
          }
          const selectedPos = positions.find((p) => p.id === employeeForm.position_id);
          const payload = {
            action: editingEmployee ? "update_employee" : "create_employee",
            ...(editingEmployee ? { id: editingEmployee.id } : {}),
            employee_number: employeeForm.employee_number.trim(),
            first_name: employeeForm.first_name || undefined,
            last_name: employeeForm.last_name || undefined,
            email: employeeForm.email || undefined,
            phone: employeeForm.phone || undefined,
            factory_id: employeeForm.factory_id,
            department_id: employeeForm.department_id || undefined,
            position_id: employeeForm.position_id,
            manager_employee_id: employeeForm.manager_employee_id || undefined,
            position: selectedPos?.title ?? "Staff",
            employment_type: employeeForm.employment_type,
            employment_status: employeeForm.employment_status,
            salary: employeeForm.salary ? Number(employeeForm.salary) : undefined,
            monthly_allowances: employeeForm.monthly_allowances
              ? Number(employeeForm.monthly_allowances)
              : undefined,
            hire_date: employeeForm.hire_date,
            date_of_birth: employeeForm.date_of_birth || undefined,
            gender: employeeForm.gender || undefined,
            address: employeeForm.address || undefined,
            city: employeeForm.city || undefined,
            emergency_contact_name: employeeForm.emergency_contact_name || undefined,
            emergency_contact_phone: employeeForm.emergency_contact_phone || undefined,
            bank_name: employeeForm.bank_name || undefined,
            bank_account_number: employeeForm.bank_account_number || undefined,
            tax_id: employeeForm.tax_id || undefined,
            notes: employeeForm.notes || undefined,
          };
          mutate.mutate(payload, {
            onSuccess: () => {
              toast.success(editingEmployee ? "Employee updated" : "Employee added");
              setEmployeeFormOpen(false);
            },
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : "Employee action failed"),
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Employee Number</Label>
            <Input
              value={employeeForm.employee_number}
              onChange={(e) =>
                setEmployeeForm((f) => ({ ...f, employee_number: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Hire Date</Label>
            <Input
              type="date"
              value={employeeForm.hire_date}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, hire_date: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>First Name</Label>
            <Input
              value={employeeForm.first_name}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, first_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Last Name</Label>
            <Input
              value={employeeForm.last_name}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, last_name: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Factory</Label>
          <Select
            value={employeeForm.factory_id}
            onValueChange={(v) =>
              setEmployeeForm((f) => ({
                ...f,
                factory_id: v,
                department_id: departmentsForFactory(v)[0]?.id ?? "",
                position_id: positionsForFactory(v)[0]?.id ?? "",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FACTORY_NAMES).map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={employeeForm.department_id}
              onValueChange={(v) => setEmployeeForm((f) => ({ ...f, department_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departmentsForFactory(
                  employeeForm.factory_id,
                  editingAssignmentIds.departmentIds
                ).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {!d.is_active ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Position</Label>
            <Select
              value={employeeForm.position_id}
              onValueChange={(v) => setEmployeeForm((f) => ({ ...f, position_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select position" />
              </SelectTrigger>
              <SelectContent>
                {positionsForFactory(
                  employeeForm.factory_id,
                  editingAssignmentIds.positionIds
                ).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                    {p.grade ? ` (${p.grade})` : ""}
                    {!p.is_active ? " — inactive" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Employment Type</Label>
            <Select
              value={employeeForm.employment_type}
              onValueChange={(v) => setEmployeeForm((f) => ({ ...f, employment_type: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Monthly Salary</Label>
            <Input
              type="number"
              min="0"
              value={employeeForm.salary}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, salary: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly Allowances</Label>
            <Input
              type="number"
              min="0"
              value={employeeForm.monthly_allowances}
              onChange={(e) =>
                setEmployeeForm((f) => ({ ...f, monthly_allowances: e.target.value }))
              }
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Employment Status</Label>
            <Select
              value={employeeForm.employment_status}
              onValueChange={(v) => setEmployeeForm((f) => ({ ...f, employment_status: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reporting Manager</Label>
            <Select
              value={employeeForm.manager_employee_id || "__none__"}
              onValueChange={(v) =>
                setEmployeeForm((f) => ({
                  ...f,
                  manager_employee_id: v === "__none__" ? "" : v,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Optional" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {employees
                  .filter((e) => e.is_active && e.id !== editingEmployee?.id)
                  .map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.employee_number} — {employeeName(e)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Date of Birth</Label>
            <Input
              type="date"
              value={employeeForm.date_of_birth}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, date_of_birth: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Gender</Label>
            <Input
              value={employeeForm.gender}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, gender: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input
              value={employeeForm.address}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>City</Label>
            <Input
              value={employeeForm.city}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Emergency Contact</Label>
            <Input
              value={employeeForm.emergency_contact_name}
              onChange={(e) =>
                setEmployeeForm((f) => ({ ...f, emergency_contact_name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Emergency Phone</Label>
            <Input
              value={employeeForm.emergency_contact_phone}
              onChange={(e) =>
                setEmployeeForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input
              value={employeeForm.bank_name}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, bank_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Bank Account</Label>
            <Input
              value={employeeForm.bank_account_number}
              onChange={(e) =>
                setEmployeeForm((f) => ({ ...f, bank_account_number: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Tax ID (TIN)</Label>
            <Input
              value={employeeForm.tax_id}
              onChange={(e) => setEmployeeForm((f) => ({ ...f, tax_id: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={employeeForm.notes}
            onChange={(e) => setEmployeeForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={deptFormOpen}
        onOpenChange={setDeptFormOpen}
        title={editingDept ? "Edit Department" : "Add Department"}
        submitLabel={editingDept ? "Save Changes" : "Create Department"}
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          if (!deptForm.code.trim() || !deptForm.name.trim()) {
            toast.error("Code and name are required");
            return;
          }
          mutate.mutate(
            {
              action: editingDept ? "update_department" : "create_department",
              ...(editingDept ? { id: editingDept.id } : {}),
              code: deptForm.code,
              name: deptForm.name,
              description: deptForm.description || undefined,
              factory_id: deptForm.factory_id,
              manager_employee_id: deptForm.manager_employee_id || undefined,
            },
            {
              onSuccess: () => {
                toast.success(editingDept ? "Department updated" : "Department created");
                setDeptFormOpen(false);
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Department action failed"),
            }
          );
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Code</Label>
            <Input
              value={deptForm.code}
              onChange={(e) => setDeptForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Factory</Label>
            <Select
              value={deptForm.factory_id}
              onValueChange={(v) => setDeptForm((f) => ({ ...f, factory_id: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FACTORY_NAMES).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            value={deptForm.name}
            onChange={(e) => setDeptForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Description</Label>
          <Textarea
            rows={2}
            value={deptForm.description}
            onChange={(e) => setDeptForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={posFormOpen}
        onOpenChange={setPosFormOpen}
        title={editingPos ? "Edit Position" : "Add Position"}
        submitLabel={editingPos ? "Save Changes" : "Create Position"}
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          if (!posForm.title.trim()) {
            toast.error("Position title is required");
            return;
          }
          mutate.mutate(
            {
              action: editingPos ? "update_position" : "create_position",
              ...(editingPos ? { id: editingPos.id } : {}),
              title: posForm.title,
              grade: posForm.grade || undefined,
              description: posForm.description || undefined,
              factory_id: posForm.factory_id,
              department_id: posForm.department_id || undefined,
              headcount_limit: posForm.headcount_limit
                ? Number(posForm.headcount_limit)
                : undefined,
            },
            {
              onSuccess: () => {
                toast.success(editingPos ? "Position updated" : "Position created");
                setPosFormOpen(false);
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Position action failed"),
            }
          );
        }}
      >
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={posForm.title}
            onChange={(e) => setPosForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Grade</Label>
            <Input
              value={posForm.grade}
              onChange={(e) => setPosForm((f) => ({ ...f, grade: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Headcount Limit</Label>
            <Input
              type="number"
              min="1"
              value={posForm.headcount_limit}
              onChange={(e) => setPosForm((f) => ({ ...f, headcount_limit: e.target.value }))}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Factory</Label>
            <Select
              value={posForm.factory_id}
              onValueChange={(v) =>
                setPosForm((f) => ({
                  ...f,
                  factory_id: v,
                  department_id: departmentsForFactory(v)[0]?.id ?? "",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FACTORY_NAMES).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select
              value={posForm.department_id}
              onValueChange={(v) => setPosForm((f) => ({ ...f, department_id: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {departmentsForFactory(posForm.factory_id).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={leaveFormOpen}
        onOpenChange={setLeaveFormOpen}
        title="Request Leave"
        submitLabel="Submit Request"
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          if (!leaveForm.employee_id || !leaveForm.start_date || !leaveForm.end_date) {
            toast.error("Fill in employee and dates");
            return;
          }
          mutate.mutate(
            { action: "create_leave", ...leaveForm, reason: leaveForm.reason || undefined },
            {
              onSuccess: () => {
                toast.success("Leave request submitted");
                setLeaveFormOpen(false);
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Leave request failed"),
            }
          );
        }}
      >
        <div className="space-y-2">
          <Label>Employee</Label>
          <Select
            value={leaveForm.employee_id}
            onValueChange={(v) => setLeaveForm((f) => ({ ...f, employee_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.filter((e) => e.is_active).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.employee_number} — {employeeName(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Leave Type</Label>
          <Select
            value={leaveForm.leave_type}
            onValueChange={(v) => setLeaveForm((f) => ({ ...f, leave_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(leaveTypeCodes.length > 0 ? leaveTypeCodes : ["annual", "sick", "personal"]).map(
                (type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Input
              type="date"
              value={leaveForm.start_date}
              onChange={(e) => setLeaveForm((f) => ({ ...f, start_date: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>End Date</Label>
            <Input
              type="date"
              value={leaveForm.end_date}
              onChange={(e) => setLeaveForm((f) => ({ ...f, end_date: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea
            rows={2}
            value={leaveForm.reason}
            onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={leaveCompFormOpen}
        onOpenChange={setLeaveCompFormOpen}
        title="Leave Compensation Request"
        submitLabel="Submit"
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          if (!leaveCompForm.employee_id || !leaveCompForm.days_converted) {
            toast.error("Employee and days are required");
            return;
          }
          mutate.mutate(
            {
              action: "create_leave_compensation",
              employee_id: leaveCompForm.employee_id,
              leave_type: leaveCompForm.leave_type,
              days_converted: Number(leaveCompForm.days_converted),
              notes: leaveCompForm.notes || undefined,
            },
            {
              onSuccess: () => {
                toast.success("Leave compensation request submitted");
                setLeaveCompFormOpen(false);
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Request failed"),
            }
          );
        }}
      >
        <div className="space-y-2">
          <Label>Employee</Label>
          <Select
            value={leaveCompForm.employee_id}
            onValueChange={(v) => setLeaveCompForm((f) => ({ ...f, employee_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {employees.filter((e) => e.is_active).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.employee_number} — {employeeName(e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Leave Type</Label>
          <Select
            value={leaveCompForm.leave_type}
            onValueChange={(v) => setLeaveCompForm((f) => ({ ...f, leave_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {leaveTypes
                .filter((t) => t.is_convertible)
                .map((t) => (
                  <SelectItem key={t.id} value={t.code}>
                    {t.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Days to Convert</Label>
          <Input
            type="number"
            step="0.5"
            min="0.5"
            value={leaveCompForm.days_converted}
            onChange={(e) =>
              setLeaveCompForm((f) => ({ ...f, days_converted: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={leaveCompForm.notes}
            onChange={(e) => setLeaveCompForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteEmployee}
        onOpenChange={(open) => !open && setDeleteEmployee(null)}
        title="Deactivate Employee"
        description={`Deactivate ${deleteEmployee?.employee_number}? They will remain in history but marked inactive.`}
        confirmLabel="Deactivate"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={() => {
          if (!deleteEmployee) return;
          mutate.mutate(
            { action: "delete_employee", id: deleteEmployee.id },
            {
              onSuccess: () => {
                toast.success("Employee deactivated");
                setDeleteEmployee(null);
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Delete failed"),
            }
          );
        }}
      />
    </div>
  );
}
