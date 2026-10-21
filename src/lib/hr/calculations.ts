/** Shared HR calculation helpers — payroll, leave, attendance. */

export type AttendanceStatus = "present" | "absent" | "late" | "leave" | "half_day";

const MANUAL_ATTENDANCE_STATUSES: AttendanceStatus[] = [
  "present",
  "absent",
  "late",
  "leave",
  "half_day",
];

function isAttendanceStatus(value: string | null | undefined): value is AttendanceStatus {
  return Boolean(value && MANUAL_ATTENDANCE_STATUSES.includes(value as AttendanceStatus));
}

/** Resolve display status from stored value and clock-in time. */
export function deriveAttendanceStatus(
  clockIn: string | null | undefined,
  explicit?: string | null
): AttendanceStatus {
  // Manual mark (no clock-in): honor the status saved in the database.
  if (!clockIn && isAttendanceStatus(explicit ?? undefined)) {
    return explicit as AttendanceStatus;
  }

  if (explicit === "absent" || explicit === "leave" || explicit === "half_day") {
    return explicit;
  }

  if (!clockIn) return "absent";

  const hour = Number(String(clockIn).slice(11, 13));
  if (hour >= 8) return "late";
  return "present";
}

export function leaveDaysBetween(start: string, end: string, holidays: string[] = []): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return 0;

  const holidaySet = new Set(holidays);
  let days = 0;
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    const iso = cursor.toISOString().slice(0, 10);
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) {
      days += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function computeAttendanceMetrics(input: {
  clockIn: string | null;
  clockOut: string | null;
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  standardWorkHours: number;
  overtimeMultiplier?: number;
}): {
  workingHours: number;
  overtimeHours: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  status: "present" | "absent" | "late" | "leave" | "half_day";
} {
  if (!input.clockIn) {
    return {
      workingHours: 0,
      overtimeHours: 0,
      lateMinutes: 0,
      earlyDepartureMinutes: 0,
      status: "absent",
    };
  }

  const clockInDate = new Date(input.clockIn);
  const scheduledStart = parseTimeToMinutes(input.workStartTime);
  const scheduledEnd = parseTimeToMinutes(input.workEndTime);
  const actualStart = clockInDate.getHours() * 60 + clockInDate.getMinutes();

  const lateMinutes = Math.max(0, actualStart - scheduledStart - input.lateGraceMinutes);

  let workingHours = 0;
  let overtimeHours = 0;
  let earlyDepartureMinutes = 0;

  if (input.clockOut) {
    const clockOutDate = new Date(input.clockOut);
    const actualEnd = clockOutDate.getHours() * 60 + clockOutDate.getMinutes();
    const workedMinutes = Math.max(0, (clockOutDate.getTime() - clockInDate.getTime()) / 60000);
    workingHours = Math.round((workedMinutes / 60) * 100) / 100;
    earlyDepartureMinutes = Math.max(0, scheduledEnd - actualEnd);
    overtimeHours = Math.max(0, Math.round((workingHours - input.standardWorkHours) * 100) / 100);
  }

  let status: "present" | "late" = lateMinutes > 0 ? "late" : "present";
  if (workingHours > 0 && workingHours < input.standardWorkHours / 2) {
    return {
      workingHours,
      overtimeHours,
      lateMinutes,
      earlyDepartureMinutes,
      status: "half_day",
    };
  }

  return { workingHours, overtimeHours, lateMinutes, earlyDepartureMinutes, status };
}

export function dailySalaryRate(
  monthlySalary: number,
  divisor = 30
): number {
  if (!monthlySalary || divisor <= 0) return 0;
  return Math.round((monthlySalary / divisor) * 100) / 100;
}

export function computeLeaveCompensationAmount(
  days: number,
  monthlySalary: number,
  divisor = 30
): number {
  return Math.round(dailySalaryRate(monthlySalary, divisor) * days * 100) / 100;
}

export function computePayrollItem(input: {
  baseSalary: number;
  allowances: number;
  overtimePay: number;
  bonus: number;
  leaveCompensation: number;
  taxRatePercent: number;
  otherDeductions: number;
}): {
  grossPay: number;
  taxDeduction: number;
  netPay: number;
} {
  const grossPay =
    input.baseSalary +
    input.allowances +
    input.overtimePay +
    input.bonus +
    input.leaveCompensation;
  const taxDeduction = Math.round(grossPay * (input.taxRatePercent / 100) * 100) / 100;
  const netPay = Math.round((grossPay - taxDeduction - input.otherDeductions) * 100) / 100;
  return { grossPay, taxDeduction, netPay };
}

export function overtimePayFromHours(
  monthlySalary: number,
  overtimeHours: number,
  standardWorkHours: number,
  multiplier: number,
  workingDaysPerMonth = 22
): number {
  if (overtimeHours <= 0 || !monthlySalary) return 0;
  const hourlyRate = monthlySalary / (workingDaysPerMonth * standardWorkHours);
  return Math.round(hourlyRate * overtimeHours * multiplier * 100) / 100;
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  if (iso.length <= 5) return iso;
  return iso.slice(11, 16);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}
