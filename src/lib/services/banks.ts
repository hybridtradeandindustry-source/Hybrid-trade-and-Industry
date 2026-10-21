import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import type { Bank, BankAccount } from "@/types";

function mapBank(row: Record<string, unknown>): Bank {
  return row as unknown as Bank;
}

function mapBankAccount(row: Record<string, unknown>): BankAccount {
  const { banks, ...rest } = row as Record<string, unknown> & { banks?: unknown };
  return {
    ...(rest as unknown as BankAccount),
    bank: (banks as Bank | null) ?? null,
  };
}

export async function fetchBanks(orgId: string): Promise<Bank[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("banks")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBank);
}

export async function insertBank(
  input: { name: string; code?: string },
  user: ApiUser
): Promise<Bank> {
  const name = input.name.trim();
  if (!name) throw new Error("Bank name is required");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("banks")
    .insert({
      organization_id: user.organization_id,
      name,
      code: input.code?.trim() || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapBank(data as Record<string, unknown>);
}

export async function updateBankRecord(
  id: string,
  input: { name?: string; code?: string; is_active?: boolean },
  user: ApiUser
): Promise<Bank> {
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Bank name is required");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("banks")
    .update({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.code !== undefined ? { code: input.code.trim() || null } : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return mapBank(data as Record<string, unknown>);
}

/** Every account across every bank — the level payments actually get attributed to. */
export async function fetchBankAccounts(orgId: string, bankId?: string): Promise<BankAccount[]> {
  const supabase = await createClient();
  let query = supabase
    .from("bank_accounts")
    .select("*, banks(*)")
    .eq("organization_id", orgId)
    .order("account_number");
  if (bankId) query = query.eq("bank_id", bankId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapBankAccount);
}

export async function insertBankAccount(
  input: { bank_id: string; account_number: string; account_name?: string },
  user: ApiUser
): Promise<BankAccount> {
  const accountNumber = input.account_number.trim();
  if (!accountNumber) throw new Error("Account number is required");
  if (!input.bank_id) throw new Error("Select a bank for this account");

  const supabase = await createClient();
  const { data: bank, error: bankError } = await supabase
    .from("banks")
    .select("id")
    .eq("id", input.bank_id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (bankError) throw new Error(bankError.message);
  if (!bank) throw new Error("Bank not found");

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      organization_id: user.organization_id,
      bank_id: input.bank_id,
      account_number: accountNumber,
      account_name: input.account_name?.trim() || null,
    })
    .select("*, banks(*)")
    .single();

  if (error) throw new Error(error.message);
  return mapBankAccount(data as Record<string, unknown>);
}

export async function updateBankAccountRecord(
  id: string,
  input: { account_number?: string; account_name?: string; is_active?: boolean },
  user: ApiUser
): Promise<BankAccount> {
  if (input.account_number !== undefined && !input.account_number.trim()) {
    throw new Error("Account number is required");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .update({
      ...(input.account_number !== undefined
        ? { account_number: input.account_number.trim() }
        : {}),
      ...(input.account_name !== undefined
        ? { account_name: input.account_name.trim() || null }
        : {}),
      ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*, banks(*)")
    .single();

  if (error) throw new Error(error.message);
  return mapBankAccount(data as Record<string, unknown>);
}

/**
 * The single source of truth for "bank payments must name a specific account" — every payment
 * entry point in the app (orders, customer payments, purchasing/supplier payments) must call
 * this rather than reimplementing the check, so the rule can't silently go missing on one path.
 */
export function assertBankAccountRequired(
  paymentMethod: string,
  bankAccountId?: string | null,
  message = "Select the bank account where the payment was received"
): void {
  if (paymentMethod === "bank" && !bankAccountId) {
    throw new Error(message);
  }
}

/**
 * Resolves a bank_account_id to its parent bank_id, validating org ownership — every write
 * path stores both bank_id (for existing bank-level reports/joins) and bank_account_id (for
 * the new account-level breakdown), and this is the only place that mapping is looked up so
 * they can never drift out of sync.
 */
export async function resolveBankAccount(
  bankAccountId: string,
  orgId: string
): Promise<{ bank_account_id: string; bank_id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bank_accounts")
    .select("id, bank_id")
    .eq("id", bankAccountId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Bank account not found");
  return { bank_account_id: data.id, bank_id: data.bank_id };
}
