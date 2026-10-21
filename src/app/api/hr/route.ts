import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  approveLeave,
  createDepartment,
  createEmployee,
  createLeaveRequest,
  createPosition,
  deactivateDepartment,
  deactivateEmployee,
  deactivatePosition,
  getHrData,
  markAttendance,
  reactivateDepartment,
  reactivateEmployee,
  reactivatePosition,
  recordAttendance,
  updateDepartment,
  updateEmployee,
  updatePosition,
} from "@/lib/services";
import { adjustLeaveBalance } from "@/lib/services/hr-leave-ledger";
import {
  approvePayrollRun,
  calculatePayrollRun,
  createLeaveCompensationRequest,
  createPayrollRun,
  fetchPayrollItems,
  payPayrollRun,
  reviewLeaveCompensationRequest,
} from "@/lib/services/hr-payroll";
import {
  deleteHoliday,
  insertHoliday,
  runLeaveAccrual,
  updateHrSettings,
  upsertLeavePolicy,
  upsertLeaveType,
} from "@/lib/services/hr-settings";
import {
  importHolidays,
  upsertCostCenter,
  upsertLeavePolicyRule,
  upsertShift,
  upsertWorkSchedule,
} from "@/lib/services/hr-policies";
import {
  applyAttendanceCorrection,
  cancelLeaveRequest,
  submitAttendanceCorrection,
} from "@/lib/services/hr";
import type { ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("hr", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const attendanceMonth = request.nextUrl.searchParams.get("attendance_month");
  const attendanceYear = request.nextUrl.searchParams.get("attendance_year");
  const payrollRunId = request.nextUrl.searchParams.get("payroll_run_id");

  if (payrollRunId) {
    const items = await fetchPayrollItems(payrollRunId, auth.user.organization_id);
    return jsonOk({ items });
  }

  const data = await getHrData(scope, auth.user.organization_id, {
    attendanceMonth: attendanceMonth ? Number(attendanceMonth) : undefined,
    attendanceYear: attendanceYear ? Number(attendanceYear) : undefined,
  });
  return jsonOk(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "approve_leave";

  try {
    if (action === "create_department") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createDepartment(body, auth.user));
    }

    if (action === "update_department") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateDepartment(id, data, auth.user));
    }

    if (action === "delete_department") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await deactivateDepartment(body.id, auth.user));
    }

    if (action === "reactivate_department") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await reactivateDepartment(body.id, auth.user));
    }

    if (action === "create_position") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createPosition(body, auth.user));
    }

    if (action === "update_position") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updatePosition(id, data, auth.user));
    }

    if (action === "delete_position") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await deactivatePosition(body.id, auth.user));
    }

    if (action === "reactivate_position") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await reactivatePosition(body.id, auth.user));
    }

    if (action === "create_employee") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createEmployee(body, auth.user));
    }

    if (action === "update_employee") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateEmployee(id, data, auth.user));
    }

    if (action === "delete_employee") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await deactivateEmployee(body.id, auth.user));
    }

    if (action === "reactivate_employee") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await reactivateEmployee(body.id, auth.user));
    }

    if (action === "create_leave") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createLeaveRequest(body, auth.user));
    }

    if (action === "approve_leave") {
      const auth = await requireApiUser("hr", "approve_leave");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        const result = await approveLeave(
          body.id,
          body.status,
          fallback.user,
          body.rejection_reason
        );
        return jsonOk(result);
      }
      return jsonOk(
        await approveLeave(body.id, body.status, auth.user, body.rejection_reason)
      );
    }

    if (action === "record_attendance") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(
        await recordAttendance(
          { employee_id: body.employee_id, action: body.record_action },
          auth.user
        )
      );
    }

    if (action === "mark_attendance") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await markAttendance(body, auth.user));
    }

    if (action === "update_hr_settings") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      const { settings } = body;
      return jsonOk(await updateHrSettings(auth.user.organization_id, settings, auth.user.id));
    }

    if (action === "upsert_leave_type") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await upsertLeaveType(body, auth.user));
    }

    if (action === "upsert_leave_policy") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await upsertLeavePolicy(body, auth.user));
    }

    if (action === "create_holiday") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await insertHoliday(body, auth.user));
    }

    if (action === "delete_holiday") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      await deleteHoliday(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    if (action === "run_leave_accrual") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      const updated = await runLeaveAccrual(auth.user.organization_id);
      return jsonOk({ updated });
    }

    if (action === "create_leave_compensation") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createLeaveCompensationRequest(body, auth.user));
    }

    if (action === "review_leave_compensation") {
      const auth = await requireApiUser("hr", "approve_leave");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(
          await reviewLeaveCompensationRequest(
            body.id,
            body.status,
            fallback.user,
            body.rejection_reason
          )
        );
      }
      return jsonOk(
        await reviewLeaveCompensationRequest(
          body.id,
          body.status,
          auth.user,
          body.rejection_reason
        )
      );
    }

    if (action === "create_payroll_run") {
      const auth = await requireApiUser("hr", "payroll");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await createPayrollRun(body, fallback.user));
      }
      return jsonOk(await createPayrollRun(body, auth.user));
    }

    if (action === "calculate_payroll") {
      const auth = await requireApiUser("hr", "payroll");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await calculatePayrollRun(body.id, fallback.user));
      }
      return jsonOk(await calculatePayrollRun(body.id, auth.user));
    }

    if (action === "approve_payroll") {
      const auth = await requireApiUser("hr", "payroll");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await approvePayrollRun(body.id, fallback.user));
      }
      return jsonOk(await approvePayrollRun(body.id, auth.user));
    }

    if (action === "pay_payroll") {
      const auth = await requireApiUser("hr", "payroll");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await payPayrollRun(body.id, fallback.user));
      }
      return jsonOk(await payPayrollRun(body.id, auth.user));
    }

    if (action === "cancel_leave") {
      const auth = await requireApiUser("hr", "self_service");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await cancelLeaveRequest(body.id, fallback.user));
      }
      return jsonOk(await cancelLeaveRequest(body.id, auth.user));
    }

    if (action === "adjust_leave_balance") {
      const auth = await requireApiUser("hr", "adjust_leave");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await adjustLeaveBalance(body, fallback.user));
      }
      return jsonOk(await adjustLeaveBalance(body, auth.user));
    }

    if (action === "submit_attendance_correction") {
      const auth = await requireApiUser("hr", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await submitAttendanceCorrection(body, auth.user));
    }

    if (action === "approve_attendance_correction") {
      const auth = await requireApiUser("hr", "approve_attendance");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        await applyAttendanceCorrection(body.id, fallback.user);
        return jsonOk({ approved: true });
      }
      await applyAttendanceCorrection(body.id, auth.user);
      return jsonOk({ approved: true });
    }

    if (action === "upsert_shift") {
      const auth = await requireApiUser("hr", "manage_policies");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await upsertShift(body, fallback.user));
      }
      return jsonOk(await upsertShift(body, auth.user));
    }

    if (action === "upsert_work_schedule") {
      const auth = await requireApiUser("hr", "manage_policies");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await upsertWorkSchedule(body, fallback.user));
      }
      return jsonOk(await upsertWorkSchedule(body, auth.user));
    }

    if (action === "upsert_leave_policy_rule") {
      const auth = await requireApiUser("hr", "manage_policies");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await upsertLeavePolicyRule(body, fallback.user));
      }
      return jsonOk(await upsertLeavePolicyRule(body, auth.user));
    }

    if (action === "upsert_cost_center") {
      const auth = await requireApiUser("hr", "manage_policies");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await upsertCostCenter(body, fallback.user));
      }
      return jsonOk(await upsertCostCenter(body, auth.user));
    }

    if (action === "import_holidays") {
      const auth = await requireApiUser("hr", "manage_policies");
      if ("error" in auth) {
        const fallback = await requireApiUser("hr", "manage");
        if ("error" in fallback) return fallback.error;
        return jsonOk(await importHolidays(body, fallback.user));
      }
      return jsonOk(await importHolidays(body, auth.user));
    }

    return jsonError(`Unknown HR action: ${action}`);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "HR action failed");
  }
}
