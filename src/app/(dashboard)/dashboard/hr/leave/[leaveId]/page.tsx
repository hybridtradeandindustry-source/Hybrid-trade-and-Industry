import { redirect } from "next/navigation";
import { getApiUser } from "@/lib/api/auth-helpers";
import { resolveLeaveRequestEmployeeId } from "@/lib/services/employee-detail";

export default async function LeaveNotificationRedirectPage({
  params,
}: {
  params: Promise<{ leaveId: string }>;
}) {
  const user = await getApiUser();
  if (!user) redirect("/login");

  const { leaveId } = await params;

  try {
    const employeeId = await resolveLeaveRequestEmployeeId(leaveId, user.organization_id);
    redirect(`/dashboard/hr/${employeeId}?tab=leave`);
  } catch {
    redirect("/dashboard/hr");
  }
}
