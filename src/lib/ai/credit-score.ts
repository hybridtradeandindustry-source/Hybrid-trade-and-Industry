import type { Customer, CustomerPayment, Order } from "@/types";
import type {
  CreditRiskEvaluation,
  CreditRiskTier,
  CreditScoreFactors,
  CreditScoreResult,
} from "@/types/production-intelligence";

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function tierFromScore(score: number): CreditRiskTier {
  if (score >= 80) return "low";
  if (score >= 60) return "medium";
  if (score >= 40) return "high";
  return "blocked";
}

function limitForTier(tier: CreditRiskTier, avgMonthlySales: number): number {
  const base = Math.max(avgMonthlySales, 0);
  switch (tier) {
    case "low":
      return Math.round(base * 2);
    case "medium":
      return Math.round(base);
    case "high":
      return Math.round(base * 0.5);
    case "blocked":
      return 0;
  }
}

export function computeCustomerCreditScore(input: {
  customer: Customer;
  orders: Order[];
  payments: CustomerPayment[];
}): CreditScoreResult {
  const { customer, orders, payments } = input;
  const now = new Date();
  const createdAt = customer.created_at ?? (orders[0]?.created_at as string | undefined) ?? now.toISOString();
  const accountAgeDays = Math.max(1, daysBetween(String(createdAt).slice(0, 10), now.toISOString().slice(0, 10)));

  const picked = orders.filter((o) => o.status === "picked");
  const open = orders.filter((o) => o.status === "ordered");
  const totalPickedSales = picked.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const balance = Number(customer.balance ?? 0);
  const balanceRatio = balance / Math.max(totalPickedSales, 1);

  const openExposure = open.reduce(
    (s, o) => s + Math.max(0, Number(o.total_amount ?? 0) - Number(o.amount_paid ?? 0)),
    0
  );

  const withDeposit = orders.filter((o) => Number(o.amount_paid ?? 0) > 0).length;
  const pctDeposit = orders.length > 0 ? withDeposit / orders.length : 0;

  const cutoff90 = new Date(now);
  cutoff90.setDate(cutoff90.getDate() - 90);
  const paymentCount90d = payments.filter(
    (p) => new Date(p.payment_date).getTime() >= cutoff90.getTime()
  ).length;

  // Approximate days-to-pay: pick date → next payment for that customer
  const payDays: number[] = [];
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
  );
  for (const order of picked) {
    const pickDate = (order as { picked_at?: string }).picked_at || order.created_at;
    if (!pickDate) continue;
    const nextPay = sortedPayments.find(
      (p) =>
        (!p.order_id || p.order_id === order.id) &&
        new Date(p.payment_date).getTime() >= new Date(pickDate).getTime()
    );
    if (nextPay) {
      payDays.push(daysBetween(String(pickDate).slice(0, 10), nextPay.payment_date.slice(0, 10)));
    }
  }
  const avgDaysToPay =
    payDays.length > 0 ? payDays.reduce((a, b) => a + b, 0) / payDays.length : balance > 0 ? 45 : 7;

  const months = Math.max(accountAgeDays / 30, 1);
  const avgMonthlySales = totalPickedSales / months;

  // Neutral default for new customers (< 3 orders)
  if (orders.length < 3) {
    const score = 70;
    const tier = tierFromScore(score);
    const factors: CreditScoreFactors = {
      balance_to_lifetime_sales_ratio: Number(balanceRatio.toFixed(4)),
      avg_days_to_pay: Number(avgDaysToPay.toFixed(1)),
      payment_count_90d: paymentCount90d,
      open_order_exposure: openExposure,
      pct_orders_with_deposit: Number(pctDeposit.toFixed(3)),
      account_age_days: accountAgeDays,
      total_picked_sales: totalPickedSales,
      avg_monthly_sales: Number(avgMonthlySales.toFixed(2)),
      deductions: {},
      bonuses: { new_customer_neutral: 0 },
    };
    return {
      customer_id: customer.id,
      credit_score: score,
      credit_risk_tier: tier,
      credit_limit: limitForTier(tier, avgMonthlySales),
      credit_score_updated_at: now.toISOString(),
      credit_score_factors: factors,
    };
  }

  let score = 100;
  const deductions: Record<string, number> = {};
  const bonuses: Record<string, number> = {};

  const balancePenalty = clamp(balanceRatio * 40, 0, 40);
  score -= balancePenalty;
  deductions.balance_to_sales = Number(balancePenalty.toFixed(2));

  const slowPayPenalty = clamp(avgDaysToPay / 2, 0, 25);
  score -= slowPayPenalty;
  deductions.avg_days_to_pay = Number(slowPayPenalty.toFixed(2));

  const exposurePenalty = clamp((openExposure / 1000) * 5, 0, 20);
  score -= exposurePenalty;
  deductions.open_order_exposure = Number(exposurePenalty.toFixed(2));

  const paymentBonus = clamp(paymentCount90d * 2, 0, 10);
  score += paymentBonus;
  bonuses.payment_activity = paymentBonus;

  const depositBonus = pctDeposit * 10;
  score += depositBonus;
  bonuses.deposit_rate = Number(depositBonus.toFixed(2));

  score = Math.round(clamp(score, 0, 100));
  const tier = tierFromScore(score);

  return {
    customer_id: customer.id,
    credit_score: score,
    credit_risk_tier: tier,
    credit_limit: limitForTier(tier, avgMonthlySales),
    credit_score_updated_at: now.toISOString(),
    credit_score_factors: {
      balance_to_lifetime_sales_ratio: Number(balanceRatio.toFixed(4)),
      avg_days_to_pay: Number(avgDaysToPay.toFixed(1)),
      payment_count_90d: paymentCount90d,
      open_order_exposure: openExposure,
      pct_orders_with_deposit: Number(pctDeposit.toFixed(3)),
      account_age_days: accountAgeDays,
      total_picked_sales: totalPickedSales,
      avg_monthly_sales: Number(avgMonthlySales.toFixed(2)),
      deductions,
      bonuses,
    },
  };
}

export function evaluateOrderCreditRisk(input: {
  score: CreditScoreResult;
  balance: number;
  orderAmount: number;
}): CreditRiskEvaluation {
  const { score, balance, orderAmount } = input;
  const projected = balance + orderAmount;
  const overLimit = score.credit_limit > 0 && projected > score.credit_limit;

  if (score.credit_risk_tier === "blocked" || (score.credit_risk_tier === "high" && overLimit)) {
    return {
      allowed: false,
      requires_override: true,
      score: score.credit_score,
      tier: score.credit_risk_tier,
      credit_limit: score.credit_limit,
      balance,
      projected_exposure: projected,
      reason: `Credit risk ${score.credit_risk_tier} (score ${score.credit_score}). Projected exposure ${projected.toFixed(0)} Birr exceeds safe limit.`,
    };
  }

  if (overLimit) {
    return {
      allowed: true,
      requires_override: true,
      score: score.credit_score,
      tier: score.credit_risk_tier,
      credit_limit: score.credit_limit,
      balance,
      projected_exposure: projected,
      reason: `Order would exceed credit limit of ${score.credit_limit.toFixed(0)} Birr (score ${score.credit_score}, tier ${score.credit_risk_tier}).`,
    };
  }

  if (score.credit_risk_tier === "high") {
    return {
      allowed: true,
      requires_override: true,
      score: score.credit_score,
      tier: score.credit_risk_tier,
      credit_limit: score.credit_limit,
      balance,
      projected_exposure: projected,
      reason: `High credit risk (score ${score.credit_score}). Manual review recommended.`,
    };
  }

  return {
    allowed: true,
    requires_override: false,
    score: score.credit_score,
    tier: score.credit_risk_tier,
    credit_limit: score.credit_limit,
    balance,
    projected_exposure: projected,
    reason: `Credit OK (score ${score.credit_score}, tier ${score.credit_risk_tier}).`,
  };
}
