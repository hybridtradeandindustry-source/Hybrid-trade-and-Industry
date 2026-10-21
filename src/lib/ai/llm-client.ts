/**
 * xAI Grok LLM client (OpenAI-compatible chat completions + tool calling).
 * Prefers XAI_API_KEY; falls back to OPENAI_API_KEY for compatibility.
 */

export type LlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type LlmToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type LlmToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type LlmChatResult = {
  message: LlmMessage;
  finish_reason: string | null;
  raw: unknown;
};

export function getLlmApiKey(): string | null {
  return process.env.XAI_API_KEY || process.env.OPENAI_API_KEY || null;
}

export function isLlmConfigured(): boolean {
  return Boolean(getLlmApiKey());
}

export function getLlmBaseUrl(): string {
  if (process.env.XAI_API_KEY) {
    return process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  }
  return process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
}

export function getLlmModel(): string {
  if (process.env.XAI_API_KEY) {
    return process.env.XAI_MODEL || process.env.GROK_MODEL || "grok-3-mini";
  }
  return process.env.OPENAI_MODEL || "gpt-4o-mini";
}

export function getMaxToolRounds(): number {
  const n = Number(process.env.AI_CHAT_MAX_TOOL_ROUNDS ?? 5);
  return Number.isFinite(n) && n > 0 ? Math.min(10, Math.floor(n)) : 5;
}

export async function llmChatCompletion(input: {
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  max_tokens?: number;
  temperature?: number;
}): Promise<LlmChatResult> {
  const apiKey = getLlmApiKey();
  if (!apiKey) {
    throw new Error("LLM is not configured. Set XAI_API_KEY (Grok) in .env.local.");
  }

  const body: Record<string, unknown> = {
    model: getLlmModel(),
    messages: input.messages,
    max_tokens: input.max_tokens ?? 1200,
    temperature: input.temperature ?? 0.2,
  };

  if (input.tools?.length) {
    body.tools = input.tools;
    body.tool_choice = input.tool_choice ?? "auto";
  }

  const res = await fetch(`${getLlmBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    error?: { message?: string };
    choices?: Array<{
      finish_reason?: string | null;
      message?: {
        role?: string;
        content?: string | null;
        tool_calls?: LlmToolCall[];
      };
    }>;
  };

  if (!res.ok) {
    throw new Error(json.error?.message || `LLM request failed (${res.status})`);
  }

  const choice = json.choices?.[0];
  const msg = choice?.message;
  if (!msg) {
    throw new Error("LLM returned an empty response");
  }

  return {
    message: {
      role: "assistant",
      content: msg.content ?? null,
      tool_calls: msg.tool_calls,
    },
    finish_reason: choice.finish_reason ?? null,
    raw: json,
  };
}
