import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createBank,
  createBankAccount,
  getBankAccountsData,
  getBanksData,
  updateBank,
  updateBankAccount,
} from "@/lib/services";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("sales", "read");
  if ("error" in auth) return auth.error;

  const activeOnly = request.nextUrl.searchParams.get("all") !== "1";
  const banks = await getBanksData(auth.user.organization_id, activeOnly);

  const withAccounts = request.nextUrl.searchParams.get("with_accounts") === "1";
  if (!withAccounts) return jsonOk(banks);

  const accounts = await getBankAccountsData(auth.user.organization_id);
  return jsonOk({ banks, accounts });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "create";

  try {
    if (action === "create") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      if (!body.name?.trim()) return jsonError("Bank name is required");
      return jsonOk(await createBank({ name: body.name, code: body.code }, auth.user));
    }

    if (action === "update") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateBank(id, data, auth.user));
    }

    if (action === "create_account") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      if (!body.bank_id) return jsonError("Select a bank for this account");
      if (!body.account_number?.trim()) return jsonError("Account number is required");
      return jsonOk(
        await createBankAccount(
          { bank_id: body.bank_id, account_number: body.account_number, account_name: body.account_name },
          auth.user
        )
      );
    }

    if (action === "update_account") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      if (!body.id) return jsonError("Account id is required");
      const { id, ...data } = body;
      return jsonOk(await updateBankAccount(id, data, auth.user));
    }

    return jsonError("Unknown action");
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Bank action failed");
  }
}
