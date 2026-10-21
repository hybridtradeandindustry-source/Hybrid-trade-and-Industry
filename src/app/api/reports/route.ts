import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { toggleReportSchedule } from "@/lib/services";
import { getReportsData } from "@/lib/services";
import { generateReport } from "@/lib/services/report-generator";

export async function GET() {
  const auth = await requireApiUser("reports", "read");
  if ("error" in auth) return auth.error;

  const data = await getReportsData();
  return jsonOk(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === "toggle_schedule") {
    const auth = await requireApiUser("reports", "read");
    if ("error" in auth) return auth.error;
    return jsonOk(await toggleReportSchedule(body.id, body.active, auth.user));
  }

  const auth = await requireApiUser("reports", "export");
  if ("error" in auth) return auth.error;

  try {
    if (!body.templateId) {
      return jsonError("Report template is required");
    }
    if (!body.format || !["PDF", "Excel"].includes(body.format)) {
      return jsonError("Export format must be PDF or Excel");
    }

    const result = await generateReport({
      templateId: body.templateId,
      format: body.format ?? "PDF",
      scope: body.scope ?? "combined",
      filters: body.filters,
      templateSlug: body.templateSlug,
      templateModule: body.templateModule,
      templateName: body.templateName,
      orgId: auth.user.organization_id,
    });

    const { logAuditFromUser } = await import("@/lib/services/audit");
    await logAuditFromUser(
      auth.user,
      "reports",
      body.templateId,
      "EXPORT",
      null,
      {
        format: body.format,
        scope: body.scope ?? "combined",
        templateName: body.templateName ?? body.templateSlug ?? body.templateId,
      }
    ).catch(() => undefined);

    return jsonOk(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Export failed");
  }
}
