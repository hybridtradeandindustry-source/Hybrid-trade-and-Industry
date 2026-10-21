import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { resolveAiAlert } from "@/lib/services";
import { aiChat, getAiData } from "@/lib/services";
import { FACTORY_IDS, type ViewScope } from "@/types";

import { createClient } from "@/lib/supabase/server";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("ai", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const role = request.nextUrl.searchParams.get("role") ?? auth.user.role;
  const data = await getAiData(role, scope);

  // Fetch the chat history for this user, scoped to the current factory so
  // Block Factory and Plastic Recycling never see each other's conversation.
  let chatHistory: any[] = [];
  try {
    const supabase = await createClient();
    const factoryId = scopeFactoryId(scope);
    let query = supabase
      .from("ai_conversations")
      .select("messages")
      .eq("organization_id", auth.user.organization_id)
      .eq("user_id", auth.user.id);
    query = factoryId ? query.eq("factory_id", factoryId) : query.is("factory_id", null);
    const { data: conv } = await query
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conv?.messages) {
      chatHistory = conv.messages;
    }
  } catch (err) {
    console.error("[api/ai] failed to load chat history:", err);
  }

  return jsonOk({
    ...data,
    chatHistory,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === "resolve_alert") {
    const auth = await requireApiUser("ai", "read");
    if ("error" in auth) return auth.error;
    return jsonOk(await resolveAiAlert(body.id, auth.user));
  }

  const auth = await requireApiUser("ai", "chat");
  if ("error" in auth) return auth.error;

  try {
    const role = body.role ?? auth.user.role;
    const scope = (body.scope ?? "combined") as ViewScope;
    const result = await aiChat(role, body.message, auth.user, scope);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "AI chat failed");
  }
}
