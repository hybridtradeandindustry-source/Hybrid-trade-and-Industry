export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("your-project")
  );
}

/** App requires Supabase — demo/in-memory mode is removed. */
export function requireSupabase(): void {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is required. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then run: npx supabase db reset"
    );
  }
}

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** xAI Grok (preferred) or OpenAI fallback. */
export function isLlmConfigured(): boolean {
  return Boolean(process.env.XAI_API_KEY || process.env.OPENAI_API_KEY);
}

export const APP_CONFIG = {
  name: "HYBRID",
  orgId: "11111111-1111-1111-1111-111111111111",
  factoryIds: {
    block: "22222222-2222-2222-2222-222222222221",
    recycling: "22222222-2222-2222-2222-222222222222",
  },
  /** ISO 4217 — Ethiopian Birr */
  currency: "ETB",
  currencyLabel: "Birr",
  locale: "en-ET",
  sageSyncApiKey: process.env.SAGE50_SYNC_API_KEY ?? "",
  sageSyncSecret: process.env.SAGE50_SYNC_SECRET ?? "",
} as const;
