import { redirect } from "next/navigation";
import { getApiUser } from "@/lib/api/auth-helpers";
import { resolveAttendanceCorrectionEmployeeId } from "@/lib/services/employee-detail";

export default async function AttendanceCorrectionRedirectPage({
  params,
}: {
  params: Promise<{ correctionId: string }>;
}) {
  const user = await getApiUser();
  if (!user) redirect("/login");

  const { correctionId } = await params;

  try {
    const employeeId = await resolveAttendanceCorrectionEmployeeId(
      correctionId,
      user.organization_id
    );
    redirect(`/dashboard/hr/${employeeId}?tab=attendance`);
  } catch {
    redirect("/dashboard/hr");
  }
}
