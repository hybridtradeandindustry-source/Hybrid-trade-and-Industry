import { NextRequest } from "next/server";
import { verifySageSyncAuth } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { processSageSyncPayload } from "@/lib/services";

export async function POST(request: NextRequest) {
  if (!verifySageSyncAuth(request)) {
    return jsonError("Invalid sync credentials", 401);
  }

  try {
    const payload = await request.json();
    const log = await processSageSyncPayload(payload);
    return jsonOk(log);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Sync failed", 500);
  }
}
