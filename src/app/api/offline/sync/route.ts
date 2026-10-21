import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { processOfflineSubmission } from "@/lib/services";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const submissions = Array.isArray(body.submissions) ? body.submissions : [body];

    const results = await Promise.all(
      submissions.map((sub: { type: string; payload: Record<string, unknown> }) =>
        processOfflineSubmission(sub.type, sub.payload, auth.user)
      )
    );

    return jsonOk({ synced: results.length, results });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Sync failed");
  }
}
