import { NextRequest } from "next/server";
import { requireApiUser, userHasPermission } from "@/lib/api/auth-helpers";
import { jsonError, jsonForbidden, jsonOk, jsonUnauthorized } from "@/lib/api/response";
import { refreshAllAiIntelligence } from "@/lib/services/ai-jobs";
import { APP_CONFIG } from "@/lib/config";

async function runRefresh(orgId: string, useLlm: boolean) {
  return refreshAllAiIntelligence(orgId, { useLlmBriefings: useLlm });
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.AI_CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Vercel Cron hits GET /api/ai/refresh */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return jsonUnauthorized("Cron authorization required");
  }

  try {
    const orgId = request.nextUrl.searchParams.get("orgId") || APP_CONFIG.orgId;
    const useLlm = request.nextUrl.searchParams.get("useLlm") === "1";
    return jsonOk(await runRefresh(orgId, useLlm));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "AI refresh failed");
  }
}

/** Manual refresh from the AI dashboard */
export async function POST(request: NextRequest) {
  if (isCronAuthorized(request) && process.env.CRON_SECRET) {
    try {
      const body = (await request.json().catch(() => ({}))) as {
        orgId?: string;
        useLlm?: boolean;
      };
      return jsonOk(await runRefresh(body.orgId || APP_CONFIG.orgId, Boolean(body.useLlm)));
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "AI refresh failed");
    }
  }

  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;

  const canRefresh =
    userHasPermission(auth.user, "ai", "refresh") ||
    userHasPermission(auth.user, "ai", "read") ||
    userHasPermission(auth.user, "*", "*") ||
    auth.user.role === "ceo" ||
    auth.user.role === "factory_manager";

  if (!canRefresh) return jsonForbidden();

  let useLlm = false;
  try {
    const body = await request.json();
    useLlm = Boolean(body?.useLlm);
  } catch {
    useLlm = false;
  }

  try {
    return jsonOk(await runRefresh(auth.user.organization_id, useLlm));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "AI refresh failed");
  }
}
