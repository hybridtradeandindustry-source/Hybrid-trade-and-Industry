import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  computeCustomerCreditScore,
  evaluateOrderCreditRisk,
} from "@/lib/ai/credit-score";
import { FACTORY_IDS, type Customer, type CustomerPayment, type Order, type ViewScope } from "@/types";
import type { CreditRiskEvaluation, CreditScoreResult } from "@/types/production-intelligence";

/**
 * Filter this customer's orders/payments down to one factory and recompute
 * a factory-scoped balance from those orders alone (customers.balance is a
 * single shared ledger and can't be split by factory — same approach as the
 * Finance and Credit pages). Payments not tied to any order can't be
 * attributed to a factory, so they're excluded from the scoped view.
 */
function scopeToFactory(
  customer: Customer,
  orders: Order[],
  payments: CustomerPayment[],
  factoryId: string
): { customer: Customer; orders: Order[]; payments: CustomerPayment[] } {
  const scopedOrders = orders.filter((o) => o.factory_id === factoryId);
  const scopedOrderIds = new Set(scopedOrders.map((o) => o.id));
  const scopedPayments = payments.filter((p) => !!p.order_id && scopedOrderIds.has(p.order_id));

  const paymentsByOrder = new Map<string, number>();
  for (const p of scopedPayments) {
    paymentsByOrder.set(p.order_id as string, (paymentsByOrder.get(p.order_id as string) ?? 0) + p.amount);
  }
  // The deposit at order creation is recorded in BOTH orders.amount_paid AND
  // as a customer_payments row tied to that order_id — paymentsByOrder
  // already includes it, so use that sum instead of adding amount_paid on
  // top (which would double-count the same money). Only fall back to
  // amount_paid when no payment row exists (e.g. it was edited directly).
  const scopedBalance = scopedOrders
    .filter((o) => o.status === "picked")
    .reduce((s, o) => {
      const paid = paymentsByOrder.get(o.id) ?? Number(o.amount_paid ?? 0);
      return s + Math.max(0, Number(o.total_amount) - paid);
    }, 0);

  return {
    customer: { ...customer, balance: scopedBalance },
    orders: scopedOrders,
    payments: scopedPayments,
  };
}

export interface AllCustomerCreditScores {
  overall: CreditScoreResult;
  block: CreditScoreResult;
  recycling: CreditScoreResult;
}

export async function computeAndPersistAllCustomerCreditScores(
  customerId: string,
  orgId: string
): Promise<AllCustomerCreditScores> {
  const supabase = await createClient();

  const [{ data: customer, error: cErr }, { data: orders, error: oErr }, { data: payments, error: pErr }] =
    await Promise.all([
      supabase.from("customers").select("*").eq("id", customerId).eq("organization_id", orgId).single(),
      supabase.from("orders").select("*").eq("customer_id", customerId).eq("organization_id", orgId),
      supabase
        .from("customer_payments")
        .select("*")
        .eq("customer_id", customerId)
        .eq("organization_id", orgId),
    ]);

  if (cErr || !customer) throw new Error(cErr?.message || "Customer not found");
  if (oErr) throw new Error(oErr.message);
  if (pErr) throw new Error(pErr.message);

  const allOrders = (orders ?? []) as Order[];
  const allPayments = (payments ?? []) as CustomerPayment[];
  const customerRow = customer as Customer;

  const overall = computeCustomerCreditScore({
    customer: customerRow,
    orders: allOrders,
    payments: allPayments,
  });

  const blockScoped = scopeToFactory(customerRow, allOrders, allPayments, FACTORY_IDS.block);
  const block = computeCustomerCreditScore(blockScoped);

  const recyclingScoped = scopeToFactory(customerRow, allOrders, allPayments, FACTORY_IDS.recycling);
  const recycling = computeCustomerCreditScore(recyclingScoped);

  const service = await createServiceClient();
  await service
    .from("customers")
    .update({
      credit_score: overall.credit_score,
      credit_limit: overall.credit_limit,
      credit_risk_tier: overall.credit_risk_tier,
      credit_score_updated_at: overall.credit_score_updated_at,
      credit_score_factors: overall.credit_score_factors,
      credit_score_block: block.credit_score,
      credit_limit_block: block.credit_limit,
      credit_risk_tier_block: block.credit_risk_tier,
      credit_score_block_updated_at: block.credit_score_updated_at,
      credit_score_recycling: recycling.credit_score,
      credit_limit_recycling: recycling.credit_limit,
      credit_risk_tier_recycling: recycling.credit_risk_tier,
      credit_score_recycling_updated_at: recycling.credit_score_updated_at,
    })
    .eq("id", customerId)
    .eq("organization_id", orgId);

  return { overall, block, recycling };
}

export async function refreshAllCreditScores(orgId: string): Promise<{
  processed: number;
  results: CreditScoreResult[];
}> {
  const supabase = await createClient();
  const { data: customers, error } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_active", true);

  if (error) throw new Error(error.message);

  const results: CreditScoreResult[] = [];
  for (const row of customers ?? []) {
    try {
      const all = await computeAndPersistAllCustomerCreditScores(row.id, orgId);
      results.push(all.overall);
    } catch (err) {
      console.warn("[ai] credit score failed for", row.id, err);
    }
  }

  return { processed: results.length, results };
}

function pickScope(all: AllCustomerCreditScores, scope?: ViewScope): CreditScoreResult {
  if (scope === "block") return all.block;
  if (scope === "recycling") return all.recycling;
  return all.overall;
}

export async function getCustomerCreditScore(
  customerId: string,
  orgId: string,
  options?: { refresh?: boolean; scope?: ViewScope }
): Promise<CreditScoreResult | null> {
  if (options?.refresh) {
    const all = await computeAndPersistAllCustomerCreditScores(customerId, orgId);
    return pickScope(all, options.scope);
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select(
      "id, balance, credit_score, credit_limit, credit_risk_tier, credit_score_updated_at, credit_score_factors, credit_score_block, credit_limit_block, credit_risk_tier_block, credit_score_block_updated_at, credit_score_recycling, credit_limit_recycling, credit_risk_tier_recycling, credit_score_recycling_updated_at"
    )
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!data) return null;

  const prefix = options?.scope === "block" ? "_block" : options?.scope === "recycling" ? "_recycling" : "";
  const score = data[`credit_score${prefix}` as keyof typeof data];
  const tier = data[`credit_risk_tier${prefix}` as keyof typeof data];
  const limit = data[`credit_limit${prefix}` as keyof typeof data];
  const updatedAt = data[`credit_score${prefix}_updated_at` as keyof typeof data];

  if (score == null) {
    const all = await computeAndPersistAllCustomerCreditScores(customerId, orgId);
    return pickScope(all, options?.scope);
  }

  return {
    customer_id: data.id,
    credit_score: Number(score),
    credit_risk_tier: tier as CreditScoreResult["credit_risk_tier"],
    credit_limit: Number(limit ?? 0),
    credit_score_updated_at: (updatedAt as string | null) ?? new Date().toISOString(),
    credit_score_factors: (options?.scope
      ? {}
      : (data.credit_score_factors ?? {})) as CreditScoreResult["credit_score_factors"],
  };
}

export async function evaluateCustomerOrderCreditRisk(
  customerId: string,
  orgId: string,
  orderAmount: number,
  scope?: ViewScope
): Promise<CreditRiskEvaluation> {
  const score = await getCustomerCreditScore(customerId, orgId, { scope });
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("balance")
    .eq("id", customerId)
    .single();

  if (!score) {
    return {
      allowed: true,
      requires_override: false,
      score: 70,
      tier: "medium",
      credit_limit: 0,
      balance: Number(customer?.balance ?? 0),
      projected_exposure: Number(customer?.balance ?? 0) + orderAmount,
      reason: "Credit score unavailable — allowing with caution.",
    };
  }

  return evaluateOrderCreditRisk({
    score,
    balance: Number(customer?.balance ?? 0),
    orderAmount,
  });
}
