import type { AiRole, AiAlert } from "@/types";
import type { CapacityResult, ProductionIntelligence } from "@/types/production-intelligence";
import type { RecyclingIntelligenceSummary } from "@/lib/services/recycling-intelligence";
import { isLlmConfigured, llmChatCompletion } from "@/lib/ai/llm-client";

export type BriefingContext = {
  role: AiRole;
  intelligence: ProductionIntelligence;
  capacity: CapacityResult;
  finance?: {
    revenue?: number;
    collections?: number;
    outstanding?: number;
    cashFlow?: number;
    periodLabel?: string;
  };
  alerts: Array<Pick<AiAlert, "title" | "message" | "severity" | "alert_type">>;
  openOrderCount: number;
  activeBatchCount: number;
};

export type GeneratedBriefing = {
  role: AiRole;
  summary: string;
  confidence_level: number;
  data_gaps: Record<string, string>;
  generated_at: string;
};

function templateBriefing(ctx: BriefingContext): GeneratedBriefing {
  const focus20 = ctx.capacity.predictions.find((p) => p.block_size_cm === 20);
  const waste =
    ctx.intelligence.metrics.by_block_size["20"]?.avg_waste_rate ??
    ctx.intelligence.metrics.global.avg_waste_rate;
  const gaps: Record<string, string> = {};

  if (ctx.intelligence.sample_batches === 0) {
    gaps.batch_history = "No batch history yet — using default 3% waste assumption until real data exists.";
  } else if (ctx.intelligence.sample_batches < 3) {
    gaps.batch_history = `Waste rate is estimated from only ${ctx.intelligence.sample_batches} batch(es) of history — confidence will improve as more batches complete.`;
  }
  if (ctx.capacity.inventory.cementBags <= 0) {
    gaps.cement = "No cement stock on hand.";
  }
  if (ctx.capacity.inventory.policheLoads <= 0) {
    gaps.poliche = "No poliche stock on hand.";
  }

  const alertLines =
    ctx.alerts.length === 0
      ? "No open AI alerts."
      : ctx.alerts
          .slice(0, 5)
          .map((a) => `• [${a.severity}] ${a.title}: ${a.message}`)
          .join("\n");

  const financeLine = ctx.finance
    ? `Finance (${ctx.finance.periodLabel ?? "period"}): revenue ${Math.round(ctx.finance.revenue ?? 0)} Birr, collections ${Math.round(ctx.finance.collections ?? 0)} Birr, outstanding ${Math.round(ctx.finance.outstanding ?? 0)} Birr, cash flow ${Math.round(ctx.finance.cashFlow ?? 0)} Birr.`
    : "Finance metrics were not included in this briefing cycle.";

  const capacityLine = focus20
    ? `With current stock (${ctx.capacity.inventory.cementBags} cement bags, ${ctx.capacity.inventory.policheLoads} poliche loads), max 20cm production is about ${focus20.max_blocks.toLocaleString()} blocks (~${focus20.max_pallets} pallets). Bottleneck: ${focus20.limiting_factor}. Expected waste ~${focus20.expected_waste_pct}%.`
    : "Capacity could not be computed for 20cm blocks.";

  const summary = [
    `Role briefing for ${ctx.role}.`,
    capacityLine,
    `Learned waste rate (20cm / global): ${(waste * 100).toFixed(1)}% from ${ctx.intelligence.sample_batches} completed batches. Active batches: ${ctx.activeBatchCount}. Open orders: ${ctx.openOrderCount}.`,
    financeLine,
    `Alerts:\n${alertLines}`,
  ].join("\n\n");

  const confidence = Math.min(
    0.95,
    0.45 +
      (ctx.intelligence.sample_batches >= 5 ? 0.25 : ctx.intelligence.sample_batches >= 2 ? 0.15 : 0) +
      (ctx.capacity.confidence * 0.2) +
      (Object.keys(gaps).length === 0 ? 0.1 : 0)
  );

  return {
    role: ctx.role,
    summary,
    confidence_level: Number(confidence.toFixed(2)),
    data_gaps: gaps,
    generated_at: new Date().toISOString(),
  };
}

async function llmBriefing(ctx: BriefingContext, template: GeneratedBriefing): Promise<GeneratedBriefing> {
  try {
    const result = await llmChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are Hybrid AI assistant for Hybrid Block and Plastic Recycling Factory, briefing on the Block Factory business (cement + poliche -> blocks -> curing/drying -> sales). Write a concise 2-3 paragraph executive briefing in clear business English that INTERPRETS the numbers, not just lists them — say what a figure means for the business (e.g. a batch is under target, cash flow is negative, a material is running out) and why it matters, not just restate the raw value. NEVER invent numbers or mention Plastic Recycling concepts (recycled pellets, plastic waste intake, sorting) — only use figures from the JSON context, which is Block Factory only. If any figure is negative (e.g. cash flow, profit, variance), state it explicitly as negative — e.g. 'cash flow is -1,200 Birr (a shortfall)' — never round a negative number to zero or omit its sign. Currency is Birr. End with 1-2 recommended actions.",
        },
        {
          role: "user",
          content: JSON.stringify({
            role: ctx.role,
            capacity: ctx.capacity,
            intelligence: {
              sample_batches: ctx.intelligence.sample_batches,
              global: ctx.intelligence.metrics.global,
              by_block_size: ctx.intelligence.metrics.by_block_size,
            },
            finance: ctx.finance,
            alerts: ctx.alerts,
            openOrderCount: ctx.openOrderCount,
            activeBatchCount: ctx.activeBatchCount,
            template_summary: template.summary,
          }),
        },
      ],
      max_tokens: 700,
      temperature: 0.3,
    });

    const text = result.message.content?.trim();
    if (!text) return template;
    return { ...template, summary: text };
  } catch {
    return template;
  }
}

export async function generateBriefing(
  ctx: BriefingContext,
  options?: { useLlm?: boolean }
): Promise<GeneratedBriefing> {
  const template = templateBriefing(ctx);
  if (options?.useLlm && isLlmConfigured()) {
    return llmBriefing(ctx, template);
  }
  return template;
}

export const BRIEFING_ROLES: AiRole[] = ["ceo", "finance", "production", "warehouse", "sales"];

export type RecyclingBriefingContext = {
  role: AiRole;
  summary: RecyclingIntelligenceSummary;
  finance?: {
    revenue?: number;
    collections?: number;
    outstanding?: number;
    cashFlow?: number;
    periodLabel?: string;
  };
  outstandingRecyclingCredit?: number;
  overdueCount?: number;
  alerts: Array<Pick<AiAlert, "title" | "message" | "severity" | "alert_type">>;
  openOrderCount: number;
};

function templateBriefingRecycling(ctx: RecyclingBriefingContext): GeneratedBriefing {
  const { summary } = ctx;
  const gaps: Record<string, string> = {};

  if (summary.today_output_kg === 0 && summary.week_output_kg === 0) {
    gaps.production_history = "No recycling production logged recently.";
  }
  if (summary.raw_material_stock.length === 0) {
    gaps.raw_material_catalog = "No raw material inventory items configured.";
  }
  if (summary.finished_goods_stock.length === 0) {
    gaps.finished_goods_catalog = "No finished goods inventory items configured.";
  }

  const alertLines =
    ctx.alerts.length === 0
      ? "No open AI alerts."
      : ctx.alerts
          .slice(0, 5)
          .map((a) => `• [${a.severity}] ${a.title}: ${a.message}`)
          .join("\n");

  const financeLine = ctx.finance
    ? `Finance (${ctx.finance.periodLabel ?? "period"}): revenue ${Math.round(ctx.finance.revenue ?? 0)} Birr, collections ${Math.round(ctx.finance.collections ?? 0)} Birr, outstanding ${Math.round(ctx.finance.outstanding ?? 0)} Birr, cash flow ${Math.round(ctx.finance.cashFlow ?? 0)} Birr.`
    : "Finance metrics were not included in this briefing cycle.";

  const rawLine = summary.raw_material_stock.length
    ? summary.raw_material_stock
        .map((r) => `${r.name}: ${r.quantity_kg.toFixed(0)} ${r.unit}${r.low_stock ? " (LOW)" : ""}`)
        .join(", ")
    : "No raw material stock on record.";

  const finishedLine = summary.finished_goods_stock.length
    ? summary.finished_goods_stock
        .map((r) => `${r.name}: ${r.quantity_kg.toFixed(0)} ${r.unit}${r.low_stock ? " (LOW)" : ""}`)
        .join(", ")
    : "No finished pellet stock on record.";

  const summaryText = [
    `Plastic Recycling role briefing for ${ctx.role}.`,
    // RecyclingIntelligenceSummary rates are already on a 0-100 scale.
    `Production: today ${summary.today_output_kg.toFixed(0)} kg, this week ${summary.week_output_kg.toFixed(0)} kg, this month ${summary.month_output_kg.toFixed(0)} kg. Week yield ${summary.week_yield_rate.toFixed(1)}%, week waste ${summary.week_waste_rate.toFixed(1)}%.`,
    `Raw material stock: ${rawLine}`,
    `Finished pellet stock: ${finishedLine}`,
    ctx.outstandingRecyclingCredit !== undefined
      ? `Open orders: ${ctx.openOrderCount}. Outstanding recycling credit: ${ctx.outstandingRecyclingCredit.toFixed(0)} Birr across ${ctx.overdueCount ?? 0} overdue invoice(s).`
      : `Open orders: ${ctx.openOrderCount}. Credit/receivables data not included in this briefing cycle.`,
    financeLine,
    `Alerts:\n${alertLines}`,
  ].join("\n\n");

  const confidence = Math.min(
    0.95,
    0.5 +
      (summary.today_output_kg > 0 || summary.week_output_kg > 0 ? 0.25 : 0) +
      (summary.raw_material_stock.length > 0 && summary.finished_goods_stock.length > 0 ? 0.15 : 0) +
      (Object.keys(gaps).length === 0 ? 0.1 : 0)
  );

  return {
    role: ctx.role,
    summary: summaryText,
    confidence_level: Number(confidence.toFixed(2)),
    data_gaps: gaps,
    generated_at: new Date().toISOString(),
  };
}

async function llmBriefingRecycling(
  ctx: RecyclingBriefingContext,
  template: GeneratedBriefing
): Promise<GeneratedBriefing> {
  try {
    const result = await llmChatCompletion({
      messages: [
        {
          role: "system",
          content:
            "You are Hybrid AI assistant for Hybrid Block and Plastic Recycling Factory, briefing on the Plastic Recycling business (raw plastic waste -> sorting/cleaning -> production -> recycled pellets -> sales). Write a concise 2-3 paragraph executive briefing in clear business English that INTERPRETS the numbers, not just lists them — say what a figure means for the business (e.g. output is below the weekly average, cash flow is negative, a stock level is critically low) and why it matters, not just restate the raw value. NEVER invent numbers or mention Block Factory concepts (block sizes, cement, poliche, batches) — only use figures from the JSON context, which is Plastic Recycling only. If any figure is negative (e.g. cash flow, profit, variance), state it explicitly as negative — e.g. 'cash flow is -1,200 Birr (a shortfall)' — never round a negative number to zero or omit its sign. Currency is Birr. End with 1-2 recommended actions.",
        },
        {
          role: "user",
          content: JSON.stringify({
            role: ctx.role,
            summary: ctx.summary,
            finance: ctx.finance,
            outstandingRecyclingCredit: ctx.outstandingRecyclingCredit,
            overdueCount: ctx.overdueCount,
            alerts: ctx.alerts,
            openOrderCount: ctx.openOrderCount,
            template_summary: template.summary,
          }),
        },
      ],
      max_tokens: 700,
      temperature: 0.3,
    });

    const text = result.message.content?.trim();
    if (!text) return template;
    return { ...template, summary: text };
  } catch {
    return template;
  }
}

export async function generateRecyclingBriefing(
  ctx: RecyclingBriefingContext,
  options?: { useLlm?: boolean }
): Promise<GeneratedBriefing> {
  const template = templateBriefingRecycling(ctx);
  if (options?.useLlm && isLlmConfigured()) {
    return llmBriefingRecycling(ctx, template);
  }
  return template;
}
