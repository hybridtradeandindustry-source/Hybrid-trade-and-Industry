import { createClient } from "@/lib/supabase/server";
import type { DashboardMetrics, ViewScope } from "@/types";
import { FACTORY_IDS } from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

export async function fetchDashboardMetrics(scope: ViewScope): Promise<DashboardMetrics> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  let ordersQuery = supabase
    .from("orders")
    .select("total_amount, status, factory_id, withholding_applied, withholding_amount");
  if (factoryId) ordersQuery = ordersQuery.eq("factory_id", factoryId);
  const { data: orders } = await ordersQuery;

  let countsQuery = supabase.from("production_counts").select("good_count, processed_output, factory_id, production_date");
  if (factoryId) countsQuery = countsQuery.eq("factory_id", factoryId);
  const { data: counts } = await countsQuery;

  let alertsQuery = supabase
    .from("ai_alerts")
    .select("*", { count: "exact", head: true })
    .eq("is_resolved", false);
  if (factoryId) alertsQuery = alertsQuery.eq("factory_id", factoryId);
  const { count: openRiskAlerts } = await alertsQuery;

  const orderList = orders ?? [];
  const countList = counts ?? [];

  const revenue = orderList.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const production = countList.reduce(
    (s, c) => s + Number(c.good_count ?? c.processed_output ?? 0),
    0
  );
  const activeOrders = orderList.filter((o) =>
    ["ordered", "picked", "pending", "confirmed", "in_production"].includes(String(o.status))
  ).length;
  const withholdingCollected = orderList
    .filter((o) => o.withholding_applied)
    .reduce((s, o) => s + Number(o.withholding_amount ?? 0), 0);

  return {
    revenue,
    production,
    withholdingCollected,
    activeOrders,
    openRiskAlerts: openRiskAlerts ?? 0,
  };
}

export async function fetchProductionTrend(days = 30) {
  const supabase = await createClient();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const { data } = await supabase
    .from("production_counts")
    .select("production_date, good_count, processed_output")
    .gte("production_date", from.toISOString().slice(0, 10));

  const byDay = new Map<string, number>();
  for (const row of data ?? []) {
    const day = String(row.production_date).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(row.good_count ?? row.processed_output ?? 0));
  }

  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { date: key, output: byDay.get(key) ?? 0 };
  });
}

export async function fetchRevenueTrend(days = 30) {
  const supabase = await createClient();
  const from = new Date();
  from.setDate(from.getDate() - days);
  const { data } = await supabase
    .from("orders")
    .select("created_at, total_amount")
    .gte("created_at", from.toISOString());

  const byDay = new Map<string, number>();
  for (const row of data ?? []) {
    const day = String(row.created_at).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(row.total_amount ?? 0));
  }

  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    return { date: key, revenue: byDay.get(key) ?? 0 };
  });
}

export async function fetchFactoryComparisonMetrics() {
  const supabase = await createClient();
  const { data: orders } = await supabase.from("orders").select("factory_id, total_amount");
  const { data: counts } = await supabase
    .from("production_counts")
    .select("factory_id, good_count, processed_output, damaged_count, waste_rejected");

  const blockOrders = (orders ?? []).filter((o) => o.factory_id === FACTORY_IDS.block);
  const recOrders = (orders ?? []).filter((o) => o.factory_id === FACTORY_IDS.recycling);
  const blockCounts = (counts ?? []).filter((c) => c.factory_id === FACTORY_IDS.block);
  const recCounts = (counts ?? []).filter((c) => c.factory_id === FACTORY_IDS.recycling);

  const blockOutput = blockCounts.reduce((s, c) => s + Number(c.good_count ?? 0), 0);
  const recOutput = recCounts.reduce((s, c) => s + Number(c.processed_output ?? 0), 0);
  const blockDamaged = blockCounts.reduce((s, c) => s + Number(c.damaged_count ?? 0), 0);
  const recWaste = recCounts.reduce((s, c) => s + Number(c.waste_rejected ?? 0), 0);

  return {
    block: {
      revenue: blockOrders.reduce((s, o) => s + Number(o.total_amount), 0),
      production: blockOutput,
      damageRate: blockOutput > 0 ? (blockDamaged / (blockOutput + blockDamaged)) * 100 : 0,
    },
    recycling: {
      revenue: recOrders.reduce((s, o) => s + Number(o.total_amount), 0),
      production: recOutput,
      damageRate: recOutput > 0 ? (recWaste / (recOutput + recWaste)) * 100 : 0,
    },
  };
}
