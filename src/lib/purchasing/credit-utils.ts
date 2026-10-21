import type { PurchasePaymentStatus } from "@/types";

export function purchaseCreditAmount(purchase: {
  total_cost: number;
  amount_paid?: number | null;
}): number {
  return Math.max(0, Number(purchase.total_cost) - Number(purchase.amount_paid ?? 0));
}

export function derivePurchasePaymentStatus(
  totalCost: number,
  amountPaid: number
): PurchasePaymentStatus {
  if (amountPaid <= 0) return "unpaid";
  if (amountPaid >= totalCost) return "paid";
  return "partial";
}

export function splitPurchasePayment(totalCost: number, amountPaidInput: number) {
  const amountPaid = Math.min(Math.max(0, Number(amountPaidInput) || 0), totalCost);
  return {
    amountPaid,
    creditAmount: Math.max(0, totalCost - amountPaid),
    paymentStatus: derivePurchasePaymentStatus(totalCost, amountPaid),
  };
}
