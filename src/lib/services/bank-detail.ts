import { createClient } from "@/lib/supabase/server";
import type { Bank, BankAccount } from "@/types";

export type BankAccountSummary = BankAccount & {
  received: number;
  paidOut: number;
  transactionCount: number;
};

export type BankTransaction = {
  id: string;
  date: string;
  kind: "received" | "paid_out";
  amount: number;
  bank_account_id: string;
  account_number: string;
  description: string;
};

export type BankDetail = {
  bank: Bank;
  accounts: BankAccountSummary[];
  totalReceived: number;
  totalPaidOut: number;
  transactionCount: number;
  recentTransactions: BankTransaction[];
};

export async function getBankDetail(bankId: string, orgId: string): Promise<BankDetail> {
  const supabase = await createClient();

  const { data: bankRow, error: bankError } = await supabase
    .from("banks")
    .select("*")
    .eq("id", bankId)
    .eq("organization_id", orgId)
    .single();

  if (bankError || !bankRow) throw new Error("Bank not found");

  const { data: accountRows, error: accountsError } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("organization_id", orgId)
    .eq("bank_id", bankId)
    .order("account_number");

  if (accountsError) throw new Error(accountsError.message);
  const accounts = (accountRows ?? []) as BankAccount[];
  const accountIds = accounts.map((a) => a.id);
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  let received: Array<{ id: string; amount: number; payment_date: string; bank_account_id: string | null; kind?: string | null }> = [];
  let paidOut: Array<{ id: string; amount: number; payment_date: string; bank_account_id: string | null; supplier_id: string }> = [];

  if (accountIds.length > 0) {
    // Only kind:"payment" (or legacy null) rows are real cash collected — refund/store_credit_issue
    // move money the other way, store_credit_apply spends an existing wallet balance, not new cash.
    const [{ data: paymentRows, error: paymentError }, { data: supplierPaymentRows, error: supplierPaymentError }] =
      await Promise.all([
        supabase
          .from("customer_payments")
          .select("id, amount, payment_date, bank_account_id, kind")
          .eq("organization_id", orgId)
          .in("bank_account_id", accountIds),
        supabase
          .from("supplier_payments")
          .select("id, amount, payment_date, bank_account_id, supplier_id")
          .eq("organization_id", orgId)
          .in("bank_account_id", accountIds),
      ]);

    if (paymentError) throw new Error(paymentError.message);
    if (supplierPaymentError) throw new Error(supplierPaymentError.message);

    received = (paymentRows ?? []).filter((p) => !p.kind || p.kind === "payment");
    paidOut = (supplierPaymentRows ?? []) as typeof paidOut;
  }

  const accountSummaries = new Map<string, { received: number; paidOut: number; count: number }>();
  for (const id of accountIds) accountSummaries.set(id, { received: 0, paidOut: 0, count: 0 });

  for (const row of received) {
    if (!row.bank_account_id) continue;
    const summary = accountSummaries.get(row.bank_account_id);
    if (!summary) continue;
    summary.received += Number(row.amount);
    summary.count += 1;
  }
  for (const row of paidOut) {
    if (!row.bank_account_id) continue;
    const summary = accountSummaries.get(row.bank_account_id);
    if (!summary) continue;
    summary.paidOut += Number(row.amount);
    summary.count += 1;
  }

  const accountsSummary: BankAccountSummary[] = accounts.map((account) => {
    const summary = accountSummaries.get(account.id) ?? { received: 0, paidOut: 0, count: 0 };
    return {
      ...account,
      received: summary.received,
      paidOut: summary.paidOut,
      transactionCount: summary.count,
    };
  });

  const recentTransactions: BankTransaction[] = [
    ...received.map((row) => ({
      id: row.id,
      date: row.payment_date,
      kind: "received" as const,
      amount: Number(row.amount),
      bank_account_id: row.bank_account_id ?? "",
      account_number: accountById.get(row.bank_account_id ?? "")?.account_number ?? "—",
      description: "Customer payment",
    })),
    ...paidOut.map((row) => ({
      id: row.id,
      date: row.payment_date,
      kind: "paid_out" as const,
      amount: Number(row.amount),
      bank_account_id: row.bank_account_id ?? "",
      account_number: accountById.get(row.bank_account_id ?? "")?.account_number ?? "—",
      description: "Supplier payment",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  return {
    bank: bankRow as Bank,
    accounts: accountsSummary,
    totalReceived: accountsSummary.reduce((s, a) => s + a.received, 0),
    totalPaidOut: accountsSummary.reduce((s, a) => s + a.paidOut, 0),
    transactionCount: accountsSummary.reduce((s, a) => s + a.transactionCount, 0),
    recentTransactions,
  };
}
