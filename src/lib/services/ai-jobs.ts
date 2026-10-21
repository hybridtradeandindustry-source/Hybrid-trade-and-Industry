import { createServiceClient } from "@/lib/supabase/server";
import { evaluateAlertRules, evaluateRecyclingAlertRules } from "@/lib/ai/alert-rules";
import { generateBriefing, generateRecyclingBriefing, BRIEFING_ROLES } from "@/lib/ai/briefing-generator";
import { getProductionIntelligence, refreshProductionIntelligence } from "@/lib/services/production-intelligence";
import { getCurrentCapacity } from "@/lib/services/capacity";
import { refreshAllCreditScores } from "@/lib/services/credit-score";
import { getFinanceDashboardMetrics, getOrdersData } from "@/lib/services";
import { getRecyclingIntelligenceSummary } from "@/lib/services/recycling-intelligence";
import { FACTORY_IDS, type AiRole, type Order, type ViewScope } from "@/types";

type FinanceDashboardResult = {
  metrics: {
    revenue: number;
    collections: number;
    outstandingBalance: number;
    cashFlow: number;
    period: { label: string };
  };
};

/** Finance metrics live under `.metrics` — flattens to the shape briefing-generator expects. */
function mapFinanceCtx(finance: FinanceDashboardResult | null) {
  if (!finance) return undefined;
  const m = finance.metrics;
  return {
    revenue: Number(m.revenue ?? 0),
    collections: Number(m.collections ?? 0),
    outstanding: Number(m.outstandingBalance ?? 0),
    cashFlow: Number(m.cashFlow ?? 0),
    periodLabel: String(m.period?.label ?? "this month"),
  };
}

export async function runAlertEvaluation(orgId: string, factoryId = FACTORY_IDS.block) {
  const service = await createServiceClient();

  const [intelligence, capacity, batchesRes, countsRes, ordersRes, customersRes] = await Promise.all([
    getProductionIntelligence(orgId, factoryId, { live: true }),
    getCurrentCapacity(orgId, factoryId, { live: true, persist: true }),
    service
      .from("production_batches")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .neq("status", "completed"),
    service
      .from("production_counts")
      .select("*")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .order("created_at", { ascending: false })
      .limit(500),
    service.from("orders").select("*").eq("organization_id", orgId).eq("status", "ordered"),
    service
      .from("customers")
      .select("id, name, balance, credit_score, credit_risk_tier, credit_limit, credit_score_factors, organization_id, customer_type, is_active")
      .eq("organization_id", orgId),
  ]);

  const fired = evaluateAlertRules({
    intelligence,
    capacity,
    batches: batchesRes.data ?? [],
    counts: countsRes.data ?? [],
    orders: ordersRes.data ?? [],
    customers: customersRes.data ?? [],
    cementBags: capacity.inventory.cementBags,
    policheLoads: capacity.inventory.policheLoads,
  });

  let inserted = 0;
  for (const alert of fired) {
    // Skip duplicate unresolved alerts with same type+title
    const { data: existing } = await service
      .from("ai_alerts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("alert_type", alert.alert_type)
      .eq("title", alert.title)
      .eq("is_resolved", false)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await service.from("ai_alerts").insert({
      organization_id: orgId,
      role: alert.role,
      factory_id: factoryId,
      alert_type: alert.alert_type,
      title: alert.title,
      message: alert.message,
      severity: alert.severity === "critical" ? "high" : alert.severity,
      entity_type: alert.entity_type ?? null,
      entity_id: alert.entity_id ?? null,
      is_resolved: false,
    });
    if (!error) inserted += 1;
  }

  return { evaluated: fired.length, inserted, alerts: fired };
}

export async function generateBriefings(
  orgId: string,
  factoryId = FACTORY_IDS.block,
  options?: { useLlm?: boolean; scope?: ViewScope }
) {
  const service = await createServiceClient();
  const scope = options?.scope ?? "block";

  const [intelligence, capacity, finance, alertsRes, ordersRes, batchesRes] = await Promise.all([
    getProductionIntelligence(orgId, factoryId),
    getCurrentCapacity(orgId, factoryId),
    getFinanceDashboardMetrics(scope, "this_month").catch(() => null),
    service
      .from("ai_alerts")
      .select("title, message, severity, alert_type")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .eq("is_resolved", false)
      .limit(20),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .eq("status", "ordered"),
    service
      .from("production_batches")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .neq("status", "completed"),
  ]);

  const financeCtx = mapFinanceCtx(finance as FinanceDashboardResult | null);

  const roles: AiRole[] = ["ceo", "finance", "production", "warehouse", "sales"];
  const generated = [];

  for (const role of roles) {
    // Map factory_manager briefing request to production role content with ceo-style breadth for ceo
    // Finance figures (revenue/collections/outstanding/cash flow) must never
    // reach roles without finance:read (production, warehouse, sales) — only
    // ceo and finance see them here, mirroring the same gate the live AI
    // chat tools enforce (src/lib/ai/tools/index.ts TOOL_PERMISSIONS).
    const briefing = await generateBriefing(
      {
        role,
        intelligence,
        capacity,
        finance: role === "ceo" || role === "finance" ? financeCtx : undefined,
        alerts: (alertsRes.data ?? []) as Array<{
          title: string;
          message: string;
          severity: string;
          alert_type: string;
        }>,
        openOrderCount: ordersRes.count ?? 0,
        activeBatchCount: batchesRes.count ?? 0,
      },
      { useLlm: options?.useLlm }
    );

    const { data, error } = await service
      .from("ai_briefings")
      .insert({
        organization_id: orgId,
        role: briefing.role,
        factory_id: factoryId,
        summary: briefing.summary,
        confidence_level: briefing.confidence_level,
        data_gaps: briefing.data_gaps,
        generated_at: briefing.generated_at,
      })
      .select()
      .single();

    if (!error && data) generated.push(data);
  }

  void BRIEFING_ROLES;
  return { generated: generated.length, briefings: generated };
}

/** Plastic Recycling has no batches/checkpoints/BOM capacity — its alert
 * rules run against live production_counts + inventory + credit data
 * instead (see evaluateRecyclingAlertRules). */
export async function runRecyclingAlertEvaluation(orgId: string) {
  const service = await createServiceClient();
  const factoryId = FACTORY_IDS.recycling;

  const { fetchCreditDashboard } = await import("@/lib/services/credit-dashboard");
  const [summary, credit, orders] = await Promise.all([
    getRecyclingIntelligenceSummary(orgId),
    fetchCreditDashboard(orgId, "recycling"),
    getOrdersData("recycling", orgId),
  ]);

  const fired = evaluateRecyclingAlertRules({
    summary,
    credit,
    orders: (orders ?? []) as Order[],
  });

  let inserted = 0;
  for (const alert of fired) {
    const { data: existing } = await service
      .from("ai_alerts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("alert_type", alert.alert_type)
      .eq("title", alert.title)
      .eq("is_resolved", false)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await service.from("ai_alerts").insert({
      organization_id: orgId,
      role: alert.role,
      factory_id: factoryId,
      alert_type: alert.alert_type,
      title: alert.title,
      message: alert.message,
      severity: alert.severity === "critical" ? "high" : alert.severity,
      entity_type: alert.entity_type ?? null,
      entity_id: alert.entity_id ?? null,
      is_resolved: false,
    });
    if (!error) inserted += 1;
  }

  return { evaluated: fired.length, inserted, alerts: fired };
}

export async function generateRecyclingBriefings(
  orgId: string,
  options?: { useLlm?: boolean }
) {
  const service = await createServiceClient();
  const factoryId = FACTORY_IDS.recycling;

  const { fetchCreditDashboard } = await import("@/lib/services/credit-dashboard");
  const [summary, finance, credit, orders, alertsRes] = await Promise.all([
    getRecyclingIntelligenceSummary(orgId),
    getFinanceDashboardMetrics("recycling", "this_month").catch(() => null),
    fetchCreditDashboard(orgId, "recycling"),
    getOrdersData("recycling", orgId),
    service
      .from("ai_alerts")
      .select("title, message, severity, alert_type")
      .eq("organization_id", orgId)
      .eq("factory_id", factoryId)
      .eq("is_resolved", false)
      .limit(20),
  ]);

  const financeCtx = mapFinanceCtx(finance as FinanceDashboardResult | null);

  const openOrderCount = ((orders ?? []) as Order[]).filter((o) => o.status === "ordered").length;

  const roles: AiRole[] = ["ceo", "finance", "production", "warehouse", "sales"];
  const generated = [];

  for (const role of roles) {
    // Same finance gate as the Block Factory briefing loop above — only
    // ceo/finance roles get real revenue/collections/cash-flow figures.
    // Credit/receivables data mirrors get_customer_credit's tool permission
    // (ai:credit_score / sales:read / finance:read) — production and
    // warehouse hold neither, so they don't get it either.
    const canSeeCredit = role === "ceo" || role === "finance" || role === "sales";
    const briefing = await generateRecyclingBriefing(
      {
        role,
        summary,
        finance: role === "ceo" || role === "finance" ? financeCtx : undefined,
        outstandingRecyclingCredit: canSeeCredit ? credit.totalOutstandingCredit : undefined,
        overdueCount: canSeeCredit ? credit.overdueCount : undefined,
        alerts: (alertsRes.data ?? []) as Array<{
          title: string;
          message: string;
          severity: string;
          alert_type: string;
        }>,
        openOrderCount,
      },
      { useLlm: options?.useLlm }
    );

    const { data, error } = await service
      .from("ai_briefings")
      .insert({
        organization_id: orgId,
        role: briefing.role,
        factory_id: factoryId,
        summary: briefing.summary,
        confidence_level: briefing.confidence_level,
        data_gaps: briefing.data_gaps,
        generated_at: briefing.generated_at,
      })
      .select()
      .single();

    if (!error && data) generated.push(data);
  }

  return { generated: generated.length, briefings: generated };
}

export async function refreshAllAiIntelligence(
  orgId: string,
  options?: { useLlmBriefings?: boolean }
) {
  const started = Date.now();
  const factoryId = FACTORY_IDS.block;

  const intelligence = await refreshProductionIntelligence(orgId, factoryId);
  const capacity = await getCurrentCapacity(orgId, factoryId, { live: true, persist: true });
  const credit = await refreshAllCreditScores(orgId);
  const alerts = await runAlertEvaluation(orgId, factoryId);
  const briefings = await generateBriefings(orgId, factoryId, {
    useLlm: options?.useLlmBriefings ?? false,
  });

  const recyclingAlerts = await runRecyclingAlertEvaluation(orgId);
  const recyclingBriefings = await generateRecyclingBriefings(orgId, {
    useLlm: options?.useLlmBriefings ?? false,
  });

  return {
    duration_ms: Date.now() - started,
    intelligence: {
      sample_batches: intelligence.sample_batches,
      computed_at: intelligence.computed_at,
    },
    capacity: {
      limiting_factor: capacity.limiting_factor,
      confidence: capacity.confidence,
      computed_at: capacity.computed_at,
    },
    credit_scores: credit.processed,
    alerts: { evaluated: alerts.evaluated, inserted: alerts.inserted },
    briefings: briefings.generated,
    recycling: {
      alerts: { evaluated: recyclingAlerts.evaluated, inserted: recyclingAlerts.inserted },
      briefings: recyclingBriefings.generated,
    },
  };
}
