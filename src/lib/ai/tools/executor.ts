import type { ApiUser } from "@/lib/api/auth-helpers";
import { userHasPermission } from "@/lib/api/auth-helpers";
import { TOOL_DATA_DESCRIPTIONS, TOOL_PERMISSIONS, type AiToolName } from "@/lib/ai/tools/index";
import { getCurrentCapacity } from "@/lib/services/capacity";
import { getProductionIntelligence } from "@/lib/services/production-intelligence";
import { getCustomerCreditScore } from "@/lib/services/credit-score";
import { getFinanceDashboardMetrics, getInventoryData, getOrdersData, getProductionData } from "@/lib/services";
import { getRecyclingIntelligenceSummary } from "@/lib/services/recycling-intelligence";
import { createClient } from "@/lib/supabase/server";
import { FACTORY_IDS, orderCreditAmount, type Order, type ProductionCount, type ViewScope } from "@/types";
import { needsReorder } from "@/lib/inventory/inventory-utils";

const MAX_RESULT_CHARS = 4000;

function truncateJson(value: unknown): string {
  const text = JSON.stringify(value);
  if (text.length <= MAX_RESULT_CHARS) return text;
  return text.slice(0, MAX_RESULT_CHARS - 20) + '…[truncated]"';
}

function canRunTool(user: ApiUser, tool: AiToolName): boolean {
  const checks = TOOL_PERMISSIONS[tool];
  if (!checks) return false;
  if (userHasPermission(user, "*", "*")) return true;
  return checks.some(([resource, action]) => userHasPermission(user, resource, action));
}

/**
 * Plain-language summary of what this user's role can and cannot ask the AI
 * about, based on the exact same per-tool permission checks used at call time.
 * Injected into the system prompt so the model can proactively decline
 * out-of-scope questions instead of always burning a tool round to find out.
 */
export function describeAiDataAccess(user: ApiUser): { allowed: string[]; denied: string[] } {
  const allowed: string[] = [];
  const denied: string[] = [];
  for (const tool of Object.keys(TOOL_PERMISSIONS) as AiToolName[]) {
    const description = TOOL_DATA_DESCRIPTIONS[tool];
    if (canRunTool(user, tool)) allowed.push(description);
    else denied.push(description);
  }
  return { allowed: [...new Set(allowed)], denied: [...new Set(denied)] };
}

export async function executeAiTool(
  toolName: string,
  args: Record<string, unknown>,
  user: ApiUser,
  currentScope: ViewScope = "combined"
): Promise<{ ok: boolean; tool: string; result: unknown }> {
  const name = toolName as AiToolName;
  if (!TOOL_PERMISSIONS[name]) {
    return { ok: false, tool: toolName, result: { error: `Unknown tool: ${toolName}` } };
  }
  if (!canRunTool(user, name)) {
    return {
      ok: false,
      tool: toolName,
      result: {
        error: "permission_denied",
        message: `The current user's role does not have access to ${TOOL_DATA_DESCRIPTIONS[name] ?? "this data"}. Do not attempt another tool call for this — tell the user politely, in one or two sentences, that this is outside their role's access, and suggest they ask someone with the right access (e.g. their manager or the relevant department) if they need it. Do not guess or estimate a value instead.`,
      },
    };
  }

  const orgId = user.organization_id;
  // The current navbar scope always wins — it strictly determines which
  // factory's data every tool call is grounded in. Only when the navbar is
  // "combined" can the model itself pick a specific scope (e.g. to compare
  // one factory), otherwise a model-supplied `scope` argument is ignored so
  // Block and Recycling data can never mix into the wrong conversation.
  const requestedScope = (args.scope as ViewScope) || "combined";
  const effectiveScope: ViewScope = currentScope === "combined" ? requestedScope : currentScope;
  const factoryId = effectiveScope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  try {
    switch (name) {
      case "get_inventory_summary": {
        const data = await getInventoryData(effectiveScope);
        const items = (data.items ?? []) as Array<{
          sku: string;
          name: string;
          quantity: number;
          unit?: string;
          low_stock_threshold?: number;
          reorder_point?: number;
        }>;
        const summary = items.slice(0, 40).map((i) => ({
          sku: i.sku,
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          low_stock: needsReorder(i as never),
        }));
        return {
          ok: true,
          tool: name,
          result: {
            scope: effectiveScope,
            item_count: items.length,
            items: summary,
            metrics: data.metrics ?? null,
          },
        };
      }

      case "get_production_capacity": {
        if (effectiveScope === "recycling") {
          const summary = await getRecyclingIntelligenceSummary(orgId);
          return { ok: true, tool: name, result: summary };
        }
        const capacity = await getCurrentCapacity(orgId, factoryId, { live: true });
        return { ok: true, tool: name, result: capacity };
      }

      case "get_production_intelligence": {
        if (effectiveScope === "recycling") {
          const summary = await getRecyclingIntelligenceSummary(orgId);
          return { ok: true, tool: name, result: summary };
        }
        const intel = await getProductionIntelligence(orgId, factoryId, { live: true });
        return { ok: true, tool: name, result: intel };
      }

      case "predict_waste": {
        if (effectiveScope === "recycling") {
          return {
            ok: false,
            tool: name,
            result: { error: "predict_waste is Block Factory only — Plastic Recycling has no batch/waste-rate model." },
          };
        }
        const { parseBlockSizeCm } = await import("@/lib/block-factory/yields");
        const size = parseBlockSizeCm(args.block_size_cm);
        if (!size) {
          return { ok: false, tool: name, result: { error: "block_size_cm must be one of 10, 15, 20, 24." } };
        }
        const plannedPieces = Number(args.planned_pieces);
        if (!Number.isFinite(plannedPieces) || plannedPieces <= 0) {
          return { ok: false, tool: name, result: { error: "planned_pieces must be a positive number." } };
        }
        const { predictWasteForPlannedQuantity } = await import("@/lib/ai/production-intelligence");
        const intel = await getProductionIntelligence(orgId, FACTORY_IDS.block, { live: true });
        const prediction = predictWasteForPlannedQuantity(intel, size, plannedPieces);
        return { ok: true, tool: name, result: prediction };
      }

      case "get_batch_status": {
        if (effectiveScope === "recycling") {
          const prod = await getProductionData("recycling", orgId);
          const counts = (prod.counts ?? []) as ProductionCount[];
          const includeCompleted = Boolean(args.include_completed);
          const entries = counts
            .filter((c) => c.processed_output != null || c.material_received != null)
            .slice(0, includeCompleted ? 60 : 30)
            .map((c) => ({
              date: c.production_date,
              material_received_kg: c.material_received,
              processed_output_kg: c.processed_output,
              waste_rejected_kg: c.waste_rejected,
            }));
          return {
            ok: true,
            tool: name,
            result: {
              note: "Plastic Recycling has no batch/checkpoint concept — production is continuous. Showing recent daily production entries instead.",
              entry_count: entries.length,
              entries,
            },
          };
        }

        const prod = await getProductionData("block", orgId);
        const batches = (prod.batches ?? []) as Array<{
          id: string;
          batch_number: string;
          status: string;
          block_size_cm?: number | null;
          expected_completion_date?: string | null;
        }>;
        const includeCompleted = Boolean(args.include_completed);
        const today = new Date().toISOString().slice(0, 10);
        // Batches only have two real states now: "in_progress" (active) or "completed"
        // (finished, locked from further logging) — no drying/curing stage exists.
        const scoped = batches.filter((b) => includeCompleted || b.status === "in_progress");

        const { getBatchProductionSummaries } = await import("@/lib/services/production-batch-detail");
        const production = await getBatchProductionSummaries(orgId, factoryId);

        const filtered = scoped.slice(0, 30).map((b) => {
          const summary = production[b.id];
          const produced = summary?.produced ?? 0;
          const sold = summary?.sold ?? 0;
          return {
            id: b.id,
            batch_number: b.batch_number,
            status: b.status,
            block_size_cm: b.block_size_cm,
            produced_pieces: produced,
            sold_pieces: sold,
            available_pieces: Math.max(0, produced - sold),
            expected_completion_date: b.expected_completion_date,
            overdue:
              b.status === "in_progress" &&
              !!b.expected_completion_date &&
              b.expected_completion_date.slice(0, 10) < today,
          };
        });
        return {
          ok: true,
          tool: name,
          result: {
            note: "produced_pieces/sold_pieces/available_pieces come from real daily production logs and order allocations, not an estimate.",
            active_or_listed: filtered.length,
            batches: filtered,
          },
        };
      }

      case "get_finance_summary": {
        const period = (args.period as "this_month") || "this_month";
        const finance = await getFinanceDashboardMetrics(effectiveScope, period);
        return {
          ok: true,
          tool: name,
          result: {
            scope: effectiveScope,
            period: finance.metrics.period,
            revenue: finance.metrics.revenue,
            collections: finance.metrics.collections,
            outstanding: finance.metrics.outstandingBalance,
            cash_flow: finance.metrics.cashFlow,
            receivables: finance.metrics.receivables,
            expenses: finance.metrics.expenses,
            net_profit: finance.metrics.netProfit,
            alerts: finance.alerts?.slice(0, 5) ?? [],
          },
        };
      }

      case "get_customer_credit": {
        const supabase = await createClient();
        const scoreCols =
          effectiveScope === "block"
            ? "credit_score_block, credit_risk_tier_block, credit_limit_block, credit_score_block_updated_at"
            : "credit_score, credit_risk_tier, credit_limit, credit_score_updated_at";

        if (effectiveScope === "recycling") {
          const { fetchCreditDashboard } = await import("@/lib/services/credit-dashboard");
          const credit = await fetchCreditDashboard(orgId, "recycling");
          let rows = credit.customersWithBalance;
          if (args.customer_id) {
            rows = rows.filter((r) => r.customer_id === String(args.customer_id));
          } else if (args.customer_name) {
            const q = String(args.customer_name).toLowerCase();
            rows = rows.filter((r) => r.customer_name.toLowerCase().includes(q));
          }
          rows = rows.slice(0, Number(args.limit ?? 10));

          // Merge in the recycling-specific credit score/tier/limit (persisted
          // separately from the balance data above) for each customer shown.
          // Computes and persists it on the fly if it has never been run —
          // list queries don't get the automatic compute-if-missing fallback
          // that single-customer lookups get, so it has to happen here.
          const scores = await Promise.all(
            rows.map((r) => getCustomerCreditScore(r.customer_id, orgId, { scope: "recycling" }))
          );
          const customers = rows.map((r, i) => ({
            ...r,
            credit_score_recycling: scores[i]?.credit_score ?? null,
            credit_risk_tier_recycling: scores[i]?.credit_risk_tier ?? null,
            credit_limit_recycling: scores[i]?.credit_limit ?? null,
          }));

          if (args.high_risk_only) {
            const filtered = customers.filter((c) =>
              ["high", "blocked"].includes(String(c.credit_risk_tier_recycling ?? ""))
            );
            return {
              ok: true,
              tool: name,
              result: {
                scope: "recycling",
                note: "Scores and balances scoped to Plastic Recycling orders only (customers can also owe/score differently from Block Factory orders, not included here).",
                customers: filtered,
              },
            };
          }

          return {
            ok: true,
            tool: name,
            result: {
              scope: "recycling",
              note: "Scores and balances scoped to Plastic Recycling orders only (customers can also owe/score differently from Block Factory orders, not included here).",
              customers,
              total_outstanding_recycling_credit: credit.totalOutstandingCredit,
              overdue_count: credit.overdueCount,
              overdue_amount: credit.overdueAmount,
            },
          };
        }

        if (args.customer_id) {
          const score = await getCustomerCreditScore(String(args.customer_id), orgId, {
            scope: effectiveScope,
          });
          const { data: customer } = await supabase
            .from("customers")
            .select(`id, name, balance, ${scoreCols}`)
            .eq("id", String(args.customer_id))
            .single();
          return { ok: true, tool: name, result: { scope: effectiveScope, customer, score } };
        }

        let candidateQuery = supabase
          .from("customers")
          .select("id, name, balance")
          .eq("organization_id", orgId)
          .eq("is_active", true)
          .limit(30);

        if (args.customer_name) {
          candidateQuery = candidateQuery.ilike("name", `%${String(args.customer_name)}%`);
        }

        const { data: candidates, error } = await candidateQuery;
        if (error) throw new Error(error.message);

        const scopeForLookup = effectiveScope === "block" ? "block" : undefined;
        // getCustomerCreditScore computes and persists a score on the fly if
        // one has never been run for this customer/scope — list queries
        // don't get that fallback for free, so it happens here per row.
        const scored = await Promise.all(
          (candidates ?? []).map(async (c) => {
            const score = await getCustomerCreditScore(c.id, orgId, { scope: scopeForLookup });
            return {
              id: c.id,
              name: c.name,
              balance: c.balance,
              credit_score: score?.credit_score ?? null,
              credit_risk_tier: score?.credit_risk_tier ?? null,
              credit_limit: score?.credit_limit ?? null,
            };
          })
        );

        const filtered = args.high_risk_only
          ? scored.filter((c) => ["high", "blocked"].includes(c.credit_risk_tier ?? ""))
          : scored;

        const sorted = filtered.sort((a, b) => (a.credit_score ?? 999) - (b.credit_score ?? 999));
        const limited = sorted.slice(0, Number(args.limit ?? 10));

        return { ok: true, tool: name, result: { scope: effectiveScope, customers: limited } };
      }

      case "get_open_orders": {
        const orders = await getOrdersData(effectiveScope, orgId);
        const open = ((orders ?? []) as Order[])
          .filter((o) => o.status === "ordered")
          .slice(0, Number(args.limit ?? 25))
          .map((o) => ({
            id: o.id,
            order_number: o.order_number,
            customer: o.customer?.name ?? o.customer_id,
            total_amount: o.total_amount,
            amount_paid: o.amount_paid,
            // Still-owed amount, correctly excluding whatever's already settled via
            // withholding tax or store credit applied at order time — never compute
            // "total_amount - amount_paid" yourself, it overstates what's owed.
            credit_amount: orderCreditAmount(o),
            withholding_applied: o.withholding_applied ?? false,
            withholding_amount: o.withholding_amount ?? 0,
            store_credit_applied: o.store_credit_applied ?? 0,
            recycling_stage: o.recycling_stage ?? undefined,
            ai_risk_flag: o.ai_risk_flag,
            ai_risk_reason: o.ai_risk_reason,
            created_at: o.created_at,
          }));
        return { ok: true, tool: name, result: { scope: effectiveScope, count: open.length, orders: open } };
      }

      case "get_supplier_credit": {
        const supabase = await createClient();
        const { data: suppliers } = await supabase
          .from("suppliers")
          .select("id, name, balance, contact_phone")
          .eq("organization_id", orgId)
          .order("balance", { ascending: false })
          .limit(Number(args.limit ?? 15));

        const paymentsQuery = supabase
          .from("supplier_payments")
          .select("id, amount, payment_date, supplier_id, purchase:material_purchases(factory_id)")
          .eq("organization_id", orgId)
          .order("payment_date", { ascending: false })
          .limit(30);
        const { data: paymentRows } = await paymentsQuery;

        let payments = (paymentRows ?? []).map((p) => ({
          id: p.id,
          amount: p.amount,
          payment_date: p.payment_date,
          supplier_id: p.supplier_id,
          purchase_factory_id:
            (p.purchase as { factory_id?: string | null } | null)?.factory_id ?? null,
        }));

        if (effectiveScope !== "combined") {
          payments = payments.filter((p) => p.purchase_factory_id === factoryId);
        }
        payments = payments.slice(0, 10);

        return {
          ok: true,
          tool: name,
          result: {
            note:
              effectiveScope !== "combined"
                ? `Recent payments scoped to ${effectiveScope} factory purchases. Supplier account balances remain shared across both factories since suppliers can serve either.`
                : undefined,
            suppliers: suppliers ?? [],
            recent_payments: payments,
          },
        };
      }

      case "get_reorder_alerts": {
        const data = await getInventoryData(effectiveScope);
        const items = (data.items ?? []) as Array<{
          id: string;
          sku: string;
          name: string;
          quantity: number;
          reorder_point?: number;
          low_stock_threshold?: number;
        }>;
        const low = items.filter((i) => needsReorder(i as never)).slice(0, 30);
        return { ok: true, tool: name, result: { scope: effectiveScope, count: low.length, items: low } };
      }

      default:
        return { ok: false, tool: toolName, result: { error: "Unhandled tool" } };
    }
  } catch (err) {
    return {
      ok: false,
      tool: toolName,
      result: { error: err instanceof Error ? err.message : "Tool execution failed" },
    };
  }
}

export function formatToolResultForLlm(payload: { ok: boolean; tool: string; result: unknown }): string {
  return truncateJson(payload);
}
