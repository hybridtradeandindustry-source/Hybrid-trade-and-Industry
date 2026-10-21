"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Clock,
  Mail,
  MapPin,
  Phone,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  buildEmployeePayload,
  HrEmployeeEditDialog,
} from "@/components/hr/hr-employee-edit-dialog";
import { useEmployeeDetail } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { parseEmployeeDetailTab } from "@/lib/notifications/notification-links";
import { formatCurrency, formatDate } from "@/lib/utils";
import { FACTORY_IDS, type Employee } from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

const LEAVE_STATUS_MAP: Record<string, "active" | "inactive" | "on_hold" | "pending"> = {
  approved: "active",
  pending: "pending",
  rejected: "inactive",
  cancelled: "inactive",
};

const ATTENDANCE_STATUS_MAP: Record<string, "active" | "inactive" | "on_hold"> = {
  present: "active",
  late: "on_hold",
  absent: "inactive",
  leave: "on_hold",
  half_day: "on_hold",
};

function employeeDisplayName(employee: Employee) {
  const full = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
  return full || employee.employee_number;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value?.trim() || "—"}</p>
    </div>
  );
}

function eventLabel(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseEmployeeDetailTab(searchParams.get("tab"));
  const { hasPermission } = useAuth();
  const { data, isLoading, error, refetch, mutate } = useEmployeeDetail(id);

  const canManage = hasPermission("hr", "manage");
  const canApproveLeave = hasPermission("hr", "approve_leave") || canManage;
  const canAdjustLeave = hasPermission("hr", "adjust_leave") || canManage;
  const canViewSalary = hasPermission("hr", "view_salary") || canManage;

  const [editOpen, setEditOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [adjustLeaveOpen, setAdjustLeaveOpen] = useState(false);
  const [markAttendanceOpen, setMarkAttendanceOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  const [leaveForm, setLeaveForm] = useState({
    leave_type: "annual",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [adjustForm, setAdjustForm] = useState({
    leave_type: "annual",
    days_delta: "",
    reason: "",
  });
  const [attendanceForm, setAttendanceForm] = useState({
    shift_date: new Date().toISOString().slice(0, 10),
    status: "present" as "present" | "absent" | "late" | "leave" | "half_day",
    notes: "",
  });

  const todayAttendance = useMemo(() => {
    if (!data) return null;
    const today = new Date().toISOString().slice(0, 10);
    return data.attendanceHistory.find((a) => a.shift_date === today) ?? null;
  }, [data]);

  const post = (body: Record<string, unknown>, successMsg: string) => {
    mutate.mutate(body, {
      onSuccess: () => {
        toast.success(successMsg);
        refetch();
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Action failed"),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-8">
        <PageHeader title="Employee not found" description="This employee may have been removed." />
        <Button variant="outline" asChild>
          <Link href="/dashboard/hr">
            <ArrowLeft className="size-4" />
            Back to HR
          </Link>
        </Button>
      </div>
    );
  }

  const {
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
  } = data;

  const leaveTypeOptions =
    leaveTypes.length > 0
      ? leaveTypes.filter((t) => t.is_active).map((t) => t.code)
      : ["annual", "sick", "personal"];

  const managerLabel = manager
    ? `${manager.employee_number} — ${[manager.first_name, manager.last_name].filter(Boolean).join(" ") || "Manager"}`
    : undefined;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${employee.employee_number} — ${employeeDisplayName(employee)}`}
        description={`${position?.title ?? employee.position}${department ? ` · ${department.name}` : ""}${
          employee.email ? ` · ${employee.email}` : ""
        }`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              status={employee.is_active ? "active" : "inactive"}
              label={employee.is_active ? "Active" : "Inactive"}
            />
            <Badge variant="outline">{employee.employment_status ?? "active"}</Badge>
            <Badge variant="outline">{employee.employment_type ?? "full_time"}</Badge>
            <Button variant="outline" asChild>
              <Link href="/dashboard/hr">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            {canManage && (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                Edit Profile
              </Button>
            )}
            {canManage && employee.is_active && (
              <>
                <Button variant="outline" onClick={() => setLeaveOpen(true)}>
                  Request Leave
                </Button>
                {canAdjustLeave && (
                  <Button variant="outline" onClick={() => setAdjustLeaveOpen(true)}>
                    Adjust Leave
                  </Button>
                )}
                <Button variant="outline" onClick={() => setMarkAttendanceOpen(true)}>
                  Mark Attendance
                </Button>
                {!todayAttendance?.clock_in && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      post(
                        { action: "record_attendance", employee_id: id, record_action: "clock_in" },
                        "Clocked in"
                      )
                    }
                  >
                    Clock In
                  </Button>
                )}
                {todayAttendance?.clock_in && !todayAttendance.clock_out && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      post(
                        { action: "record_attendance", employee_id: id, record_action: "clock_out" },
                        "Clocked out"
                      )
                    }
                  >
                    Clock Out
                  </Button>
                )}
              </>
            )}
            {canManage && employee.is_active && (
              <Button variant="destructive" onClick={() => setDeactivateOpen(true)}>
                Deactivate
              </Button>
            )}
            {canManage && !employee.is_active && (
              <Button
                onClick={() =>
                  post({ action: "reactivate_employee", id }, "Employee reactivated")
                }
              >
                Reactivate
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Tenure"
          value={analytics.tenureLabel}
          icon={<User className="size-4" />}
          info={`${analytics.tenureDays} days since hire on ${formatDate(employee.hire_date)}`}
        />
        <MetricCard
          title="Attendance Rate (Month)"
          value={`${analytics.attendanceRatePercent}%`}
          icon={<TrendingUp className="size-4" />}
          info={`${analytics.presentDaysMonth} present / late days this month`}
        />
        <MetricCard
          title="Leave Used (YTD)"
          value={`${analytics.leaveDaysUsedYtd} days`}
          icon={<Calendar className="size-4" />}
          info={`${analytics.pendingLeaveRequests} pending request(s)`}
        />
        <MetricCard
          title="Leave Balance"
          value={`${analytics.leaveLiabilityDays} days`}
          icon={<Calendar className="size-4" />}
          info="Total remaining leave days across all types"
        />
        <MetricCard
          title="Absent (Month)"
          value={analytics.absentDaysMonth}
          icon={<Clock className="size-4" />}
          info={`${analytics.lateDaysMonth} late days · ${analytics.leaveDaysMonth} on leave`}
        />
        <MetricCard
          title="Overtime (Month)"
          value={`${analytics.overtimeHoursMonth}h`}
          icon={<Clock className="size-4" />}
          info={`Avg ${analytics.avgWorkingHoursMonth}h working hours on present days`}
        />
        {canViewSalary && data.canViewSalary && (
          <>
            <MetricCard
              title="Monthly Package"
              value={
                employee.salary != null
                  ? formatCurrency(employee.salary + (employee.monthly_allowances ?? 0))
                  : "—"
              }
              icon={<Wallet className="size-4" />}
              info="Base salary plus monthly allowances"
            />
            <MetricCard
              title="Net Pay (YTD)"
              value={formatCurrency(analytics.totalNetPayYtd)}
              icon={<Wallet className="size-4" />}
              info={`Gross ${formatCurrency(analytics.totalGrossPayYtd)} across ${analytics.payrollRunsCount} payroll line(s)`}
            />
          </>
        )}
        {analytics.daysUntilProbationEnd != null && analytics.daysUntilProbationEnd >= 0 && (
          <MetricCard
            title="Probation Ends"
            value={`${analytics.daysUntilProbationEnd}d`}
            icon={<Briefcase className="size-4" />}
            info={
              employee.probation_end_date
                ? formatDate(employee.probation_end_date)
                : "Probation period"
            }
          />
        )}
        {analytics.daysUntilContractEnd != null && analytics.daysUntilContractEnd >= 0 && (
          <MetricCard
            title="Contract Ends"
            value={`${analytics.daysUntilContractEnd}d`}
            icon={<Briefcase className="size-4" />}
            info={
              employee.contract_end_date
                ? formatDate(employee.contract_end_date)
                : "Contract end date"
            }
          />
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(tab) => router.replace(`/dashboard/hr/${id}?tab=${tab}`, { scroll: false })}
      >
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="history">Employment History</TabsTrigger>
          <TabsTrigger value="documents">Documents & Benefits</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  {employee.email ?? "—"}
                </div>
                <div className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  {employee.phone ?? "—"}
                </div>
                <div className="flex items-center gap-2 text-sm sm:col-span-2">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  {[employee.address, employee.city].filter(Boolean).join(", ") || "—"}
                </div>
                <Field
                  label="Date of Birth"
                  value={employee.date_of_birth ? formatDate(employee.date_of_birth) : null}
                />
                <Field label="Gender" value={employee.gender} />
                <Field label="Emergency Contact" value={employee.emergency_contact_name} />
                <Field label="Emergency Phone" value={employee.emergency_contact_phone} />
              </CardContent>
            </Card>

            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Job & Compensation</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="Department" value={department?.name ?? employee.department} />
                <Field label="Position" value={position?.title ?? employee.position} />
                <Field label="Factory" value={FACTORY_NAMES[employee.factory_id ?? ""] ?? "—"} />
                <Field label="Reporting Manager" value={managerLabel} />
                <Field label="Hire Date" value={formatDate(employee.hire_date)} />
                <Field
                  label="Termination Date"
                  value={
                    employee.termination_date ? formatDate(employee.termination_date) : null
                  }
                />
                <Field label="Work Location" value={employee.work_location} />
                <Field label="Seniority" value={employee.seniority_level} />
                {canViewSalary && data.canViewSalary && (
                  <>
                    <Field
                      label="Monthly Salary"
                      value={employee.salary != null ? formatCurrency(employee.salary) : null}
                    />
                    <Field
                      label="Allowances"
                      value={formatCurrency(employee.monthly_allowances ?? 0)}
                    />
                    <Field label="Bank" value={employee.bank_name} />
                    <Field label="Account" value={employee.bank_account_number} />
                    <Field label="Tax ID" value={employee.tax_id} />
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {employee.notes && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{employee.notes}</p>
              </CardContent>
            </Card>
          )}

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Leave Balances</CardTitle>
              <CardDescription>Current entitlement by leave type</CardDescription>
            </CardHeader>
            <CardContent>
              {leaveBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave balances on file.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {leaveBalances.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="capitalize">{b.leave_type}</span>
                      <span className="font-mono">
                        {b.balance_days - b.used_days} / {b.balance_days} days
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>YTD Attendance Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="Present" value={String(attendanceSummaryYtd.present_days)} />
              <Field label="Absent" value={String(attendanceSummaryYtd.absent_days)} />
              <Field label="Late" value={String(attendanceSummaryYtd.late_days)} />
              <Field label="On Leave" value={String(attendanceSummaryYtd.leave_days)} />
              <Field
                label="Working Hours"
                value={`${attendanceSummaryYtd.total_working_hours}h`}
              />
              <Field label="Overtime" value={`${attendanceSummaryYtd.total_overtime_hours}h`} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leave" className="mt-6 space-y-4">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Leave Requests</CardTitle>
              <CardDescription>All requests for this employee</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={leaveRequests}
                getRowKey={(row) => row.id}
                emptyMessage="No leave requests yet."
                columns={[
                  {
                    id: "type",
                    header: "Type",
                    cell: (row) => <span className="capitalize">{row.leave_type}</span>,
                  },
                  {
                    id: "dates",
                    header: "Dates",
                    cell: (row) =>
                      `${formatDate(row.start_date)} – ${formatDate(row.end_date)}`,
                  },
                  {
                    id: "days",
                    header: "Days",
                    cell: (row) => row.days_count ?? "—",
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={LEAVE_STATUS_MAP[row.status] ?? "inactive"}
                        label={row.status}
                      />
                    ),
                  },
                  {
                    id: "reason",
                    header: "Reason",
                    cell: (row) => (
                      <span className="max-w-[200px] truncate text-muted-foreground">
                        {row.reason ?? "—"}
                      </span>
                    ),
                  },
                  ...(canApproveLeave
                    ? [
                        {
                          id: "actions",
                          header: "",
                          cell: (row: (typeof leaveRequests)[0]) =>
                            row.status === "pending" ? (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  disabled={mutate.isPending}
                                  onClick={() =>
                                    post(
                                      { action: "approve_leave", id: row.id, status: "approved" },
                                      "Leave approved"
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7"
                                  disabled={mutate.isPending}
                                  onClick={() =>
                                    post(
                                      {
                                        action: "approve_leave",
                                        id: row.id,
                                        status: "rejected",
                                        rejection_reason: "Rejected by admin",
                                      },
                                      "Leave rejected"
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

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Leave Ledger</CardTitle>
              <CardDescription>Accruals, usage, adjustments, and encashments</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={leaveLedger}
                getRowKey={(row) => row.id}
                emptyMessage="No ledger entries."
                columns={[
                  {
                    id: "date",
                    header: "Date",
                    cell: (row) => formatDate(row.effective_date),
                  },
                  {
                    id: "type",
                    header: "Leave Type",
                    cell: (row) => <span className="capitalize">{row.leave_type}</span>,
                  },
                  {
                    id: "txn",
                    header: "Transaction",
                    cell: (row) => (
                      <span className="capitalize">{row.transaction_type.replace(/_/g, " ")}</span>
                    ),
                  },
                  {
                    id: "delta",
                    header: "Change",
                    cell: (row) => (
                      <span className={row.days_delta >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {row.days_delta >= 0 ? "+" : ""}
                        {row.days_delta}d
                      </span>
                    ),
                  },
                  {
                    id: "balance",
                    header: "Balance After",
                    cell: (row) => `${row.balance_after}d`,
                  },
                  {
                    id: "reason",
                    header: "Reason",
                    cell: (row) => row.reason ?? "—",
                  },
                ]}
              />
            </CardContent>
          </Card>

          {leaveCompensationRequests.length > 0 && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Leave Compensation</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={leaveCompensationRequests}
                  getRowKey={(row) => row.id}
                  columns={[
                    {
                      id: "type",
                      header: "Type",
                      cell: (row) => <span className="capitalize">{row.leave_type}</span>,
                    },
                    { id: "days", header: "Days", cell: (row) => row.days_converted },
                    {
                      id: "amount",
                      header: "Amount",
                      cell: (row) =>
                        canViewSalary && data.canViewSalary ? formatCurrency(row.amount) : "—",
                    },
                    {
                      id: "status",
                      header: "Status",
                      cell: (row) => (
                        <StatusBadge
                          status={LEAVE_STATUS_MAP[row.status] ?? "inactive"}
                          label={row.status}
                        />
                      ),
                    },
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard title="Present" value={attendanceSummaryMonth.present_days} />
            <MetricCard title="Absent" value={attendanceSummaryMonth.absent_days} />
            <MetricCard title="Late" value={attendanceSummaryMonth.late_days} />
            <MetricCard
              title="Overtime"
              value={`${attendanceSummaryMonth.total_overtime_hours}h`}
            />
          </div>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Attendance This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={attendanceHistory}
                getRowKey={(row) => row.id}
                emptyMessage="No attendance records this month."
                columns={[
                  {
                    id: "date",
                    header: "Date",
                    cell: (row) => formatDate(row.shift_date),
                  },
                  { id: "in", header: "Clock In", cell: (row) => row.clock_in ?? "—" },
                  { id: "out", header: "Clock Out", cell: (row) => row.clock_out ?? "—" },
                  {
                    id: "hours",
                    header: "Hours",
                    cell: (row) => (row.working_hours != null ? `${row.working_hours}h` : "—"),
                  },
                  {
                    id: "status",
                    header: "Status",
                    cell: (row) => (
                      <StatusBadge
                        status={ATTENDANCE_STATUS_MAP[row.status] ?? "inactive"}
                        label={row.status}
                      />
                    ),
                  },
                  {
                    id: "notes",
                    header: "Notes",
                    cell: (row) => row.notes ?? "—",
                  },
                ]}
              />
            </CardContent>
          </Card>

          {attendanceCorrections.length > 0 && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <CardTitle>Attendance Corrections</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={attendanceCorrections}
                  getRowKey={(row) => row.id}
                  columns={[
                    {
                      id: "date",
                      header: "Date",
                      cell: (row) => formatDate(row.shift_date),
                    },
                    { id: "reason", header: "Reason", cell: (row) => row.reason },
                    {
                      id: "status",
                      header: "Status",
                      cell: (row) => (
                        <StatusBadge
                          status={row.status === "approved" ? "active" : "pending"}
                          label={row.status}
                        />
                      ),
                    },
                    {
                      id: "change",
                      header: "Change",
                      cell: (row) =>
                        row.old_status && row.new_status
                          ? `${row.old_status} → ${row.new_status}`
                          : "—",
                    },
                    ...(canManage
                      ? [
                          {
                            id: "approve",
                            header: "",
                            cell: (row: (typeof attendanceCorrections)[0]) =>
                              row.status === "pending" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  onClick={() =>
                                    post(
                                      {
                                        action: "approve_attendance_correction",
                                        id: row.id,
                                      },
                                      "Correction applied"
                                    )
                                  }
                                >
                                  Approve
                                </Button>
                              ) : null,
                          },
                        ]
                      : []),
                  ]}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="payroll" className="mt-6">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Payroll History</CardTitle>
              <CardDescription>Payslip lines across payroll runs</CardDescription>
            </CardHeader>
            <CardContent>
              {!canViewSalary || !data.canViewSalary ? (
                <p className="text-sm text-muted-foreground">
                  You don&apos;t have permission to view salary and payroll details.
                </p>
              ) : (
                <DataTable
                  data={payrollHistory}
                  getRowKey={(row) => row.id}
                  emptyMessage="No payroll records for this employee."
                  columns={[
                    {
                      id: "period",
                      header: "Period",
                      cell: (row) =>
                        row.period_start
                          ? `${formatDate(row.period_start)} – ${formatDate(row.period_end)}`
                          : "—",
                    },
                    {
                      id: "gross",
                      header: "Gross",
                      cell: (row) => formatCurrency(row.gross_pay),
                    },
                    {
                      id: "deductions",
                      header: "Deductions",
                      cell: (row) =>
                        formatCurrency(row.tax_deduction + row.other_deductions),
                    },
                    {
                      id: "net",
                      header: "Net Pay",
                      cell: (row) => formatCurrency(row.net_pay),
                    },
                    {
                      id: "status",
                      header: "Run Status",
                      cell: (row) => (
                        <StatusBadge
                          status={row.run_status === "paid" ? "active" : "pending"}
                          label={row.run_status}
                        />
                      ),
                    },
                    {
                      id: "payment",
                      header: "Payment",
                      cell: (row) => (
                        <StatusBadge
                          status={row.payment_status === "paid" ? "active" : "pending"}
                          label={row.payment_status}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Employment Timeline</CardTitle>
              <CardDescription>Hires, promotions, transfers, and salary changes</CardDescription>
            </CardHeader>
            <CardContent>
              {employmentHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No history entries yet. Events are recorded on hire and role changes.
                </p>
              ) : (
                <div className="space-y-4">
                  {employmentHistory.map((entry, index) => (
                    <div key={entry.id} className="relative pl-6">
                      {index < employmentHistory.length - 1 && (
                        <span className="absolute left-[7px] top-6 h-full w-px bg-border" />
                      )}
                      <span className="absolute left-0 top-1.5 size-3.5 rounded-full border-2 border-primary bg-background" />
                      <div className="rounded-md border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{eventLabel(entry.event_type)}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(entry.effective_date)}
                          </p>
                        </div>
                        {entry.salary != null && canViewSalary && data.canViewSalary && (
                          <p className="mt-1 text-sm">
                            Salary: {formatCurrency(Number(entry.salary))}
                          </p>
                        )}
                        {entry.notes && (
                          <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6 space-y-4">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Contracts, IDs, and files linked to this employee</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No documents uploaded. Use the Documents module to attach files with entity type
                  &quot;employee&quot;.
                </p>
              ) : (
                <DataTable
                  data={documents}
                  getRowKey={(row) => row.id}
                  columns={[
                    { id: "name", header: "Name", cell: (row) => row.name },
                    { id: "tag", header: "Tag", cell: (row) => row.tag },
                    {
                      id: "link",
                      header: "",
                      cell: (row) => (
                        <Button size="sm" variant="outline" className="h-7" asChild>
                          <a href={row.file_url} target="_blank" rel="noopener noreferrer">
                            Open
                          </a>
                        </Button>
                      ),
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle>Benefits</CardTitle>
            </CardHeader>
            <CardContent>
              {benefits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No benefits configured.</p>
              ) : (
                <DataTable
                  data={benefits}
                  getRowKey={(row) => row.id}
                  columns={[
                    {
                      id: "type",
                      header: "Type",
                      cell: (row) => <span className="capitalize">{row.benefit_type}</span>,
                    },
                    { id: "desc", header: "Description", cell: (row) => row.description ?? "—" },
                    {
                      id: "amount",
                      header: "Amount",
                      cell: (row) =>
                        canViewSalary && data.canViewSalary ? formatCurrency(row.amount) : "—",
                    },
                    { id: "freq", header: "Frequency", cell: (row) => row.frequency },
                    {
                      id: "from",
                      header: "From",
                      cell: (row) => formatDate(row.effective_from),
                    },
                    {
                      id: "active",
                      header: "Status",
                      cell: (row) => (
                        <StatusBadge
                          status={row.is_active ? "active" : "inactive"}
                          label={row.is_active ? "Active" : "Inactive"}
                        />
                      ),
                    },
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <HrEmployeeEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        employee={employee}
        departments={departments}
        positions={positions}
        managers={managerCandidates}
        canViewSalary={canViewSalary && data.canViewSalary}
        isSubmitting={mutate.isPending}
        onSubmit={(form) => {
          if (!form.employee_number.trim() || !form.position_id) {
            toast.error("Employee number and position are required");
            return;
          }
          mutate.mutate(buildEmployeePayload(form, positions, { employeeId: id, mode: "update" }), {
            onSuccess: () => {
              toast.success("Employee profile updated");
              setEditOpen(false);
              refetch();
            },
            onError: (err) =>
              toast.error(err instanceof Error ? err.message : "Update failed"),
          });
        }}
      />

      <EntityFormDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        title="Request Leave"
        submitLabel="Submit Request"
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          if (!leaveForm.start_date || !leaveForm.end_date) {
            toast.error("Start and end dates are required");
            return;
          }
          mutate.mutate(
            {
              action: "create_leave",
              employee_id: id,
              ...leaveForm,
              reason: leaveForm.reason || undefined,
            },
            {
              onSuccess: () => {
                toast.success("Leave request submitted");
                setLeaveOpen(false);
                refetch();
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Leave request failed"),
            }
          );
        }}
      >
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
              {leaveTypeOptions.map((type) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type}
                </SelectItem>
              ))}
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
        open={adjustLeaveOpen}
        onOpenChange={setAdjustLeaveOpen}
        title="Adjust Leave Balance"
        submitLabel="Apply Adjustment"
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          const days = Number(adjustForm.days_delta);
          if (!days || !adjustForm.reason.trim()) {
            toast.error("Days change and reason are required");
            return;
          }
          mutate.mutate(
            {
              action: "adjust_leave_balance",
              employee_id: id,
              leave_type: adjustForm.leave_type,
              days_delta: days,
              reason: adjustForm.reason.trim(),
            },
            {
              onSuccess: () => {
                toast.success("Leave balance adjusted");
                setAdjustLeaveOpen(false);
                setAdjustForm({ leave_type: "annual", days_delta: "", reason: "" });
                refetch();
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Adjustment failed"),
            }
          );
        }}
      >
        <div className="space-y-2">
          <Label>Leave Type</Label>
          <Select
            value={adjustForm.leave_type}
            onValueChange={(v) => setAdjustForm((f) => ({ ...f, leave_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {leaveTypeOptions.map((type) => (
                <SelectItem key={type} value={type} className="capitalize">
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Days Change (+ or −)</Label>
          <Input
            type="number"
            step="0.5"
            placeholder="e.g. 2 or -1"
            value={adjustForm.days_delta}
            onChange={(e) => setAdjustForm((f) => ({ ...f, days_delta: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Reason</Label>
          <Textarea
            rows={2}
            value={adjustForm.reason}
            onChange={(e) => setAdjustForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={markAttendanceOpen}
        onOpenChange={setMarkAttendanceOpen}
        title="Mark Attendance"
        submitLabel="Save"
        isSubmitting={mutate.isPending}
        onSubmit={() => {
          mutate.mutate(
            {
              action: "mark_attendance",
              employee_id: id,
              shift_date: attendanceForm.shift_date,
              status: attendanceForm.status,
              notes: attendanceForm.notes || undefined,
            },
            {
              onSuccess: () => {
                toast.success("Attendance updated");
                setMarkAttendanceOpen(false);
                refetch();
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Attendance update failed"),
            }
          );
        }}
      >
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            type="date"
            value={attendanceForm.shift_date}
            onChange={(e) =>
              setAttendanceForm((f) => ({ ...f, shift_date: e.target.value }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={attendanceForm.status}
            onValueChange={(v) =>
              setAttendanceForm((f) => ({
                ...f,
                status: v as typeof attendanceForm.status,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["present", "absent", "late", "leave", "half_day"] as const).map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            rows={2}
            value={attendanceForm.notes}
            onChange={(e) => setAttendanceForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Deactivate employee?"
        description={`This will mark ${employeeDisplayName(employee)} as inactive. They will no longer appear in active employee lists.`}
        confirmLabel="Deactivate"
        variant="destructive"
        onConfirm={() => {
          mutate.mutate(
            { action: "delete_employee", id },
            {
              onSuccess: () => {
                toast.success("Employee deactivated");
                setDeactivateOpen(false);
                router.push("/dashboard/hr");
              },
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Deactivation failed"),
            }
          );
        }}
      />
    </div>
  );
}
