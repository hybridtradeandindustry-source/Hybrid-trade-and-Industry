import type { ApiUser } from "@/lib/api/auth-helpers";
import {
  getMaxToolRounds,
  isLlmConfigured,
  llmChatCompletion,
  type LlmMessage,
} from "@/lib/ai/llm-client";
import { AI_TOOL_DEFINITIONS } from "@/lib/ai/tools/index";
import { describeAiDataAccess, executeAiTool, formatToolResultForLlm } from "@/lib/ai/tools/executor";
import { userHasPermission } from "@/lib/api/auth-helpers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { FACTORY_IDS, type ViewScope } from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function scopeContextBlock(scope: ViewScope): string {
  if (scope === "recycling") {
    return `

CURRENT FACTORY CONTEXT: Plastic Recycling ONLY.
This factory converts raw plastic waste into recycled plastic pellets. The business flow is:
Supplier -> Raw Plastic Received -> Raw Material Inventory -> Sorting & Cleaning -> Production -> Finished Inventory (recycled pellets) -> Sales / Credit Sales -> Finance.
Key facts:
- Material is measured in KG.
- Production always has some waste/loss: waste = material_received - processed_output (e.g. input 1,000 KG plastic -> output 940 KG pellets -> waste 60 KG).
- Customers usually buy from finished pellet stock, not made-to-order production.
- Sales reduce finished inventory; raw material purchases increase raw material inventory.
- There is no "batch"/"checkpoint" concept here — production is logged as continuous daily entries (material received, processed output, waste).
Resource allocation priorities for Plastic Recycling: prioritize raw material intake and sorting/cleaning throughput against current finished-pellet demand (open orders), flag when raw material stock is too low to sustain planned production, and flag when finished stock can't cover open/pending orders. Justify decisions using real production_counts and inventory figures from tools.
STRICT RULE: Do not mention, reference, or blend in Block Factory concepts (block sizes 10/15/20/24cm, cement, poliche, batches, checkpoints, block molds) under any circumstances. Every number, tool call, and insight in this conversation must be about Plastic Recycling only.`;
  }
  if (scope === "block") {
    return `

CURRENT FACTORY CONTEXT: Block Factory ONLY.
This factory produces concrete blocks in sizes 10/15/20/24cm from cement, poliche, and ashwa raw materials, tracked through production batches. Each batch has only two states: in progress (still being logged against) or finished (locked, no more logging). There is no drying/curing checkpoint stage anymore — a batch's real output is the sum of its daily production logs (get_batch_status returns produced/available per batch from these logs, not the old planned quantity estimate).
Waste here means MATERIAL waste — extra cement/poliche consumed beyond the standard formula for the pieces actually produced, learned from real daily-log history (get_production_intelligence). There is no piece-rejection/damage tracking anymore. For any "how much waste will we get", "how much can we produce", or "how much cement/poliche will we need" question about a hypothetical or planned run, call predict_waste with the block size and planned piece count — never estimate this yourself.
Resource allocation priorities: allocate materials (cement, poliche, ashwa) based on relative priority — urgent orders, high-value pending orders, daily batches already created/in-progress, and current bottlenecks. Justify why specific sizes get priority, how existing batches impact remaining capacity, and what the limiting factors are.
STRICT RULE: Do not mention, reference, or blend in Plastic Recycling concepts (raw plastic waste intake, sorting & cleaning, recycled pellets, KG-based recycling yield/waste) under any circumstances. Every number, tool call, and insight in this conversation must be about Block Factory only.`;
  }
  return `

CURRENT FACTORY CONTEXT: Combined / company-wide view across both Block Factory and Plastic Recycling. You may compare the two businesses when relevant, and must clearly label which factory each figure belongs to.`;
}

/**
 * Role-based data-access rules, in plain language, computed from this user's
 * real permissions (the exact same checks the tool executor enforces). This
 * is a proactive courtesy so the model can decline out-of-scope questions
 * immediately instead of burning a tool round first — the executor's
 * permission check (src/lib/ai/tools/executor.ts) remains the real, load-bearing
 * gate regardless of what this text says.
 */
function accessContextBlock(user: ApiUser): string {
  if (userHasPermission(user, "*", "*")) {
    return `

USER ACCESS LEVEL: CEO / Owner — full access to all company data across every module (finance, sales, production, inventory, HR, suppliers, customers). Answer any question fully using tools; do not refuse anything.`;
  }

  const { allowed, denied } = describeAiDataAccess(user);
  const allowedText = allowed.length ? allowed.join("; ") : "none";
  const deniedText = denied.length ? denied.join("; ") : "none";

  return `

USER ACCESS LEVEL: This user's role only grants access to: ${allowedText}.
They do NOT have access to: ${deniedText}.
If the user asks about something in the "do NOT have access to" list (or anything else outside their granted data, e.g. payroll, financial statements, customer credit, supplier payables), do not call a tool for it and do not guess or estimate a number. Instead, politely decline in 1-2 sentences: state briefly that this is outside their role's access, and suggest they ask someone with the right access (their manager or the relevant department) if they need it. Stay warm and professional, never curt. Still answer normally and fully for anything within their granted access.`;
}

const SYSTEM_PROMPT = `You are Hybrid AI, the intelligent assistant for Hybrid Block and Plastic Recycling Factory's ERP platform.

Your primary traits:
1. Smart, deep, detailed analysis of all production and resource constraints for whichever factory (Block Factory or Plastic Recycling) is currently in view — see CURRENT FACTORY CONTEXT below for which one applies to this conversation and its specific rules.
2. Active, multi-factor resource allocation reasoning. Never guess or assume default values — always call tools to get current inventory, open/pending orders, and production status before reasoning about allocation, priority, or bottlenecks. Justify your allocation decisions in detail: what's urgent, what existing production impacts remaining capacity, and what the limiting factors are.
3. Dynamically build dashboards when asked:
   - If the user asks you to "build a dashboard", "create a dashboard", "show a dashboard" (for finance, production, risk, capacity, or predictions), you MUST generate a dashboard JSON payload wrapped inside a single tag: <dashboard>{...}</dashboard>.
   - The JSON structure inside the <dashboard> tags must exactly be:
     {
       "title": "Dashboard Title",
       "description": "Brief context or subtitle",
       "metrics": [
         { "title": "Metric Name", "value": "Metric Value (e.g. 12,000 ETB)", "trend": "+12% compared to last week", "trendType": "positive" | "negative" | "neutral" }
       ],
       "charts": [
         {
           "title": "Chart Title",
           "type": "bar" | "line" | "area",
           "data": [
             { "name": "Label X", "value": 1500 }
           ],
           "dataKey": "value"
         }
       ],
       "tables": [
         {
           "title": "Table Title",
           "headers": ["Header A", "Header B"],
           "rows": [
             ["Val A1", "Val B1"],
             ["Val A2", "Val B2"]
           ]
         }
       ]
     }
   - Never output markdown inside the <dashboard> tags. Only output raw JSON inside the tag.
   - You can output regular detailed markdown analysis before and after the <dashboard> tag to explain your findings.
4. Always provide follow-up suggestions at the end of your response:
   - Provide exactly 3 dynamic, highly relevant follow-up questions or suggested prompts that the user might want to ask next, based on the context of your response.
   - Wrap these suggestions inside a single tag: <suggestions>["Suggestion 1", "Suggestion 2", "Suggestion 3"]</suggestions>. Do not put formatting or markdown inside the suggestions tag, only a valid JSON array of strings.
   - The UI renders these as clickable chips automatically — do NOT also write a visible heading or label like "Follow-up suggestions" in your response text. The tag by itself is enough; write nothing else about it.

Rules (non-negotiable):
- NEVER invent numbers. Only use values returned by tools.
- If data is missing or a tool fails, say what is missing — do not guess.
- Currency is Ethiopian Birr (ETB).
- Prefer calling tools before answering quantitative questions (capacity, waste, finance, credit, inventory, batches/production, orders).
- Be thorough, detailed, and role-aware.
- When you cite figures, mention they come from live ERP data.
- Strictly follow whichever CURRENT FACTORY CONTEXT is given below — never mix data, units, or concepts from the other factory into your answer.
- Respect USER ACCESS LEVEL below at all times. If a tool call comes back with "error": "permission_denied", never retry it, never mention the technical error, and never leak any data from it — just give the polite decline described in that tool result's message, then continue helping with anything else the user asked that IS in scope.`;

export type ChatOrchestratorResult = {
  reply: string;
  confidence: number;
  tools_used: string[];
  data?: unknown[];
  messages: Array<{ role: string; content: string; time?: string; tools?: string[] }>;
};

async function loadConversationHistory(
  userId: string,
  orgId: string,
  factoryId: string | null,
  limit = 10
): Promise<LlmMessage[]> {
  const supabase = await createClient();
  let query = supabase
    .from("ai_conversations")
    .select("messages")
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  query = factoryId ? query.eq("factory_id", factoryId) : query.is("factory_id", null);
  const { data } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const history = (data?.messages ?? []) as Array<{ role: string; content: string }>;
  return history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .slice(-limit)
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
}

const DUPLICATE_SUBMIT_WINDOW_MS = 15_000;

/**
 * Safety net against duplicate chat turns — whatever the trigger (a UI
 * double-submit, a network-level retry, a slow client resending), if the
 * exact same message was already answered for this user+factory within the
 * last 15s, return that saved reply instead of running (and persisting) a
 * second full LLM completion. This guarantees the user can never see two
 * independently-generated answers to one question, regardless of cause.
 */
async function findRecentDuplicateReply(
  userId: string,
  orgId: string,
  factoryId: string | null,
  message: string
): Promise<ChatOrchestratorResult | null> {
  const supabase = await createClient();
  let query = supabase
    .from("ai_conversations")
    .select("messages")
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  query = factoryId ? query.eq("factory_id", factoryId) : query.is("factory_id", null);
  const { data } = await query
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const stored = (data?.messages ?? []) as Array<{
    role: string;
    content: string;
    time?: string;
    tools?: string[];
  }>;
  if (stored.length < 2) return null;

  const lastAssistant = stored[stored.length - 1];
  const lastUser = stored[stored.length - 2];
  if (lastAssistant.role !== "assistant" || lastUser.role !== "user") return null;
  if (lastUser.content !== message) return null;

  const replyTime = lastAssistant.time ? new Date(lastAssistant.time).getTime() : 0;
  if (!replyTime || Date.now() - replyTime > DUPLICATE_SUBMIT_WINDOW_MS) return null;

  return {
    reply: lastAssistant.content,
    confidence: 0.9,
    tools_used: lastAssistant.tools ?? [],
    messages: [
      { role: "user", content: lastUser.content, time: lastUser.time },
      {
        role: "assistant",
        content: lastAssistant.content,
        time: lastAssistant.time,
        tools: lastAssistant.tools,
      },
    ],
  };
}

function toAiRole(role: string): string {
  const map: Record<string, string> = {
    ceo: "ceo",
    finance_manager: "finance",
    finance: "finance",
    factory_manager: "production",
    production_supervisor: "production",
    production: "production",
    warehouse_officer: "warehouse",
    warehouse: "warehouse",
    hr_manager: "hr",
    hr: "hr",
    sales_manager: "sales",
    sales: "sales",
  };
  return map[role] ?? "ceo";
}

function stripSuggestionsTag(content: string): string {
  return content.replace(/<suggestions>[\s\S]*?<\/suggestions>/g, "").trim();
}

/**
 * Read-modify-write with optimistic concurrency. If two requests save around
 * the same time, a plain "SELECT then UPDATE by id" lets the second write
 * silently overwrite the first — the first request's turn never makes it
 * into the stored history, even though its HTTP response already reached
 * that client and got rendered (this is exactly what "I see two replies live,
 * but only one after refresh" looks like: two turns really were generated,
 * but only the last save actually stuck). Guarding the UPDATE on the
 * `updated_at` we originally read, and retrying against fresh data if
 * another request updated it first, means both turns get appended in turn
 * instead of one clobbering the other.
 */
async function saveConversation(
  user: ApiUser,
  role: string,
  turns: Array<{ role: string; content: string; time?: string; tools?: string[] }>,
  factoryId: string | null
) {
  try {
    const service = await createServiceClient();
    const aiRole = toAiRole(role);
    const cleanedTurns = turns.map((t) =>
      t.role === "assistant" ? { ...t, content: stripSuggestionsTag(t.content) } : t
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      let existingQuery = service
        .from("ai_conversations")
        .select("id, messages, updated_at")
        .eq("organization_id", user.organization_id)
        .eq("user_id", user.id);
      existingQuery = factoryId
        ? existingQuery.eq("factory_id", factoryId)
        : existingQuery.is("factory_id", null);
      const { data: existing } = await existingQuery
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const prev = (existing?.messages as Array<{ role: string; content: string; time?: string; tools?: string[] }> | null) ?? [];
      const messages = [...prev, ...cleanedTurns].slice(-40);

      if (existing?.id) {
        const { data: updated, error } = await service
          .from("ai_conversations")
          .update({ messages, role: aiRole, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .eq("updated_at", existing.updated_at)
          .select("id");
        if (!error && updated && updated.length > 0) return;
        // Lost the race — another request updated this row first. Retry
        // against the now-current data instead of overwriting it.
      } else {
        const { error } = await service.from("ai_conversations").insert({
          organization_id: user.organization_id,
          user_id: user.id,
          role: aiRole,
          factory_id: factoryId,
          messages,
        });
        if (!error) return;
      }
    }
  } catch (err) {
    console.warn("[ai] failed to persist conversation:", err);
  }
}

export async function runGroundedChat(input: {
  role: string;
  message: string;
  user: ApiUser;
  scope?: ViewScope;
}): Promise<ChatOrchestratorResult> {
  const scope: ViewScope = input.scope ?? "combined";
  const factoryId = scopeFactoryId(scope);
  const fallbackNoKey: ChatOrchestratorResult = {
    reply:
      "AI chat requires XAI_API_KEY (Grok). Add it to .env.local to enable grounded answers from your ERP data.",
    confidence: 0.4,
    tools_used: [],
    messages: [
      { role: "user", content: input.message },
      {
        role: "assistant",
        content:
          "AI chat requires XAI_API_KEY (Grok). Configure it in .env.local to enable the analyst.",
      },
    ],
  };

  if (!isLlmConfigured()) {
    return fallbackNoKey;
  }

  const duplicate = await findRecentDuplicateReply(
    input.user.id,
    input.user.organization_id,
    factoryId,
    input.message
  );
  if (duplicate) return duplicate;

  const history = await loadConversationHistory(input.user.id, input.user.organization_id, factoryId);
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}${scopeContextBlock(scope)}${accessContextBlock(input.user)}\nUser role context: ${input.role}.`,
    },
    ...history,
    { role: "user", content: input.message },
  ];

  const toolsUsed: string[] = [];
  const toolData: unknown[] = [];
  const maxRounds = getMaxToolRounds();

  try {
    for (let round = 0; round < maxRounds; round++) {
      const completion = await llmChatCompletion({
        messages,
        tools: AI_TOOL_DEFINITIONS,
        tool_choice: "auto",
        max_tokens: 1200,
        temperature: 0.2,
      });

      const assistantMsg = completion.message;
      messages.push(assistantMsg);

      const toolCalls = assistantMsg.tool_calls ?? [];
      if (!toolCalls.length) {
        const reply =
          assistantMsg.content?.trim() ||
          "I could not produce an answer from the available data.";

        await saveConversation(input.user, input.role, [
          { role: "user", content: input.message, time: new Date().toISOString() },
          { role: "assistant", content: reply, time: new Date().toISOString(), tools: [...new Set(toolsUsed)] },
        ], factoryId);

        return {
          reply,
          confidence: toolsUsed.length > 0 ? 0.9 : 0.7,
          tools_used: [...new Set(toolsUsed)],
          data: toolData.length ? toolData : undefined,
          messages: [
            { role: "user", content: input.message, time: new Date().toISOString() },
            { role: "assistant", content: reply, time: new Date().toISOString(), tools: [...new Set(toolsUsed)] },
          ],
        };
      }

      for (const call of toolCalls) {
        const name = call.function?.name ?? "unknown";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function?.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }

        toolsUsed.push(name);
        const executed = await executeAiTool(name, args, input.user, scope);
        toolData.push({ tool: name, result: executed.result });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: formatToolResultForLlm(executed),
        });
      }
    }

    // Exhausted tool rounds — ask for final answer without more tools
    const final = await llmChatCompletion({
      messages: [
        ...messages,
        {
          role: "user",
          content: "Using only the tool results above, give your final concise answer now.",
        },
      ],
      max_tokens: 900,
      temperature: 0.2,
    });

    const reply =
      final.message.content?.trim() ||
      "I gathered data but reached the tool-call limit before finishing. Please ask a more specific question.";

    await saveConversation(input.user, input.role, [
      { role: "user", content: input.message, time: new Date().toISOString() },
      { role: "assistant", content: reply, time: new Date().toISOString(), tools: [...new Set(toolsUsed)] },
    ], factoryId);

    return {
      reply,
      confidence: 0.85,
      tools_used: [...new Set(toolsUsed)],
      data: toolData,
      messages: [
        { role: "user", content: input.message, time: new Date().toISOString() },
        { role: "assistant", content: reply, time: new Date().toISOString(), tools: [...new Set(toolsUsed)] },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI chat failed";
    return {
      reply: `AI request failed: ${message}`,
      confidence: 0.3,
      tools_used: [...new Set(toolsUsed)],
      messages: [
        { role: "user", content: input.message },
        { role: "assistant", content: message },
      ],
    };
  }
}
