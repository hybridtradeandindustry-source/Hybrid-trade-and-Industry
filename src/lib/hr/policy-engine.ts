/**
 * Central HR policy resolution engine.
 * Resolves effective-dated rules by employee context without hard-coded business logic.
 */

import type { Employee, HrLeavePolicyRule, HrLeaveType, HrShift, HrWorkSchedule } from "@/types";

export interface PolicyCriteria {
  department_id?: string | null;
  position_id?: string | null;
  employment_type?: string | null;
  branch_id?: string | null;
  factory_id?: string | null;
  employee_id?: string | null;
  seniority_level?: string | null;
  min_tenure_months?: number;
}

export interface EmployeePolicyContext {
  employee: Pick<
    Employee,
    | "id"
    | "department_id"
    | "position_id"
    | "employment_type"
    | "branch_id"
    | "factory_id"
    | "hire_date"
    | "probation_end_date"
    | "employment_status"
    | "seniority_level"
  >;
  asOfDate?: string;
}

export function monthsBetween(fromDate: string, toDate: string): number {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function isOnProbation(ctx: EmployeePolicyContext): boolean {
  const asOf = ctx.asOfDate ?? new Date().toISOString().slice(0, 10);
  if (ctx.employee.employment_status === "probation") return true;
  if (ctx.employee.probation_end_date && ctx.employee.probation_end_date >= asOf) return true;
  return false;
}

export function employeeTenureMonths(ctx: EmployeePolicyContext): number {
  const asOf = ctx.asOfDate ?? new Date().toISOString().slice(0, 10);
  return Math.max(0, monthsBetween(ctx.employee.hire_date, asOf));
}

export function matchesPolicyCriteria(
  ctx: EmployeePolicyContext,
  criteria: PolicyCriteria
): boolean {
  const emp = ctx.employee;
  if (criteria.employee_id && criteria.employee_id !== emp.id) return false;
  if (criteria.department_id && criteria.department_id !== emp.department_id) return false;
  if (criteria.position_id && criteria.position_id !== emp.position_id) return false;
  if (criteria.employment_type && criteria.employment_type !== emp.employment_type) return false;
  if (criteria.branch_id && criteria.branch_id !== emp.branch_id) return false;
  if (criteria.factory_id && criteria.factory_id !== emp.factory_id) return false;
  if (criteria.seniority_level && criteria.seniority_level !== emp.seniority_level) return false;
  if (criteria.min_tenure_months != null && employeeTenureMonths(ctx) < criteria.min_tenure_months) {
    return false;
  }
  return true;
}

export function isEffectiveOnDate(
  effectiveFrom: string,
  effectiveTo: string | null | undefined,
  asOfDate: string
): boolean {
  if (asOfDate < effectiveFrom) return false;
  if (effectiveTo && asOfDate > effectiveTo) return false;
  return true;
}

export function resolveLeavePolicyRule(
  ctx: EmployeePolicyContext,
  leaveTypeId: string,
  rules: HrLeavePolicyRule[],
  leaveType: HrLeaveType
): HrLeavePolicyRule | null {
  const asOf = ctx.asOfDate ?? new Date().toISOString().slice(0, 10);
  const applicable = rules
    .filter(
      (r) =>
        r.leave_type_id === leaveTypeId &&
        r.is_active &&
        isEffectiveOnDate(r.effective_from, r.effective_to, asOf) &&
        matchesPolicyCriteria(ctx, r.criteria)
    )
    .sort((a, b) => a.priority - b.priority);

  return applicable[0] ?? null;
}

export function resolveLeaveEntitlement(
  ctx: EmployeePolicyContext,
  leaveType: HrLeaveType,
  rules: HrLeavePolicyRule[]
): {
  annualEntitlement: number;
  accrualMonthly: number;
  maxCarryOver: number;
  maxConsecutive: number | null;
  minNoticeDays: number;
  probationRestricted: boolean;
  rule: HrLeavePolicyRule | null;
} {
  const rule = resolveLeavePolicyRule(ctx, leaveType.id, rules, leaveType);
  return {
    annualEntitlement: rule?.annual_entitlement ?? leaveType.default_days,
    accrualMonthly: rule?.accrual_monthly ?? leaveType.accrual_monthly,
    maxCarryOver: rule?.max_carry_over ?? leaveType.max_carry_over,
    maxConsecutive: rule?.max_consecutive_days ?? leaveType.max_consecutive_days ?? null,
    minNoticeDays: rule?.min_notice_days ?? leaveType.min_notice_days ?? 0,
    probationRestricted: rule?.probation_restricted ?? leaveType.probation_restricted ?? false,
    rule,
  };
}

export function resolveWorkSchedule(
  schedules: HrWorkSchedule[],
  scheduleId?: string | null,
  asOfDate?: string
): HrWorkSchedule {
  const asOf = asOfDate ?? new Date().toISOString().slice(0, 10);
  if (scheduleId) {
    const assigned = schedules.find(
      (s) => s.id === scheduleId && isEffectiveOnDate(s.effective_from, s.effective_to, asOf)
    );
    if (assigned) return assigned;
  }
  const defaultSchedule = schedules.find(
    (s) => s.is_default && isEffectiveOnDate(s.effective_from, s.effective_to, asOf)
  );
  return (
    defaultSchedule ?? {
      id: "default",
      organization_id: "",
      name: "Default",
      working_days: [1, 2, 3, 4, 5],
      weekend_days: [0, 6],
      effective_from: "2000-01-01",
      is_default: true,
    }
  );
}

export function resolveShift(
  shifts: HrShift[],
  shiftId?: string | null
): HrShift | null {
  if (!shiftId) return null;
  return shifts.find((s) => s.id === shiftId && s.is_active) ?? null;
}

export function isWorkingDay(date: string, schedule: HrWorkSchedule): boolean {
  const dow = new Date(date).getDay();
  if (schedule.weekend_days.includes(dow)) return false;
  if (schedule.working_days.length > 0) return schedule.working_days.includes(dow);
  return dow !== 0 && dow !== 6;
}

export function leaveDaysBetweenWithSchedule(
  start: string,
  end: string,
  holidays: string[],
  schedule: HrWorkSchedule,
  options?: { halfDay?: boolean }
): number {
  if (options?.halfDay) {
    if (start !== end) throw new Error("Half-day leave must be a single date");
    const iso = start;
    if (!isWorkingDay(iso, schedule)) return 0;
    if (holidays.includes(iso)) return 0;
    return 0.5;
  }

  const holidaySet = new Set(holidays);
  let days = 0;
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isWorkingDay(iso, schedule) && !holidaySet.has(iso)) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export type EncashmentFormula = "basic_salary_daily" | "fixed_rate" | "gross_daily";

export function computeEncashmentAmount(input: {
  days: number;
  formula: EncashmentFormula;
  monthlySalary: number;
  divisor?: number;
  fixedRate?: number | null;
  allowances?: number;
}): number {
  const { days, formula, monthlySalary, divisor = 30, fixedRate, allowances = 0 } = input;
  if (days <= 0) return 0;

  if (formula === "fixed_rate") {
    return Math.round((fixedRate ?? 0) * days * 100) / 100;
  }

  const base = formula === "gross_daily" ? monthlySalary + allowances : monthlySalary;
  const daily = base / divisor;
  return Math.round(daily * days * 100) / 100;
}

export function validateLeaveRequest(input: {
  ctx: EmployeePolicyContext;
  leaveType: HrLeaveType;
  entitlement: ReturnType<typeof resolveLeaveEntitlement>;
  daysRequested: number;
  remainingBalance: number;
  requestStartDate: string;
  today?: string;
  hasAttachment?: boolean;
}): string | null {
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  if (input.entitlement.probationRestricted && isOnProbation(input.ctx)) {
    return `Leave type "${input.leaveType.name}" is not available during probation`;
  }

  if (input.entitlement.minNoticeDays > 0) {
    const noticeDays = Math.floor(
      (new Date(input.requestStartDate).getTime() - new Date(today).getTime()) / 86400000
    );
    if (noticeDays < input.entitlement.minNoticeDays) {
      return `Minimum notice is ${input.entitlement.minNoticeDays} day(s)`;
    }
  }

  if (
    input.entitlement.maxConsecutive != null &&
    input.daysRequested > input.entitlement.maxConsecutive
  ) {
    return `Maximum consecutive days is ${input.entitlement.maxConsecutive}`;
  }

  if (input.leaveType.is_paid && input.daysRequested > input.remainingBalance) {
    return `Insufficient balance (${input.remainingBalance} day(s) remaining)`;
  }

  if (input.leaveType.requires_attachment && !input.hasAttachment) {
    return "Supporting document attachment is required for this leave type";
  }

  return null;
}

export function prorateEntitlementForJoinYear(
  annualEntitlement: number,
  hireDate: string,
  year: number
): number {
  const hire = new Date(hireDate);
  if (hire.getFullYear() < year) return annualEntitlement;
  if (hire.getFullYear() > year) return 0;
  const monthsRemaining = 12 - hire.getMonth();
  return Math.round((annualEntitlement * (monthsRemaining / 12)) * 10) / 10;
}
