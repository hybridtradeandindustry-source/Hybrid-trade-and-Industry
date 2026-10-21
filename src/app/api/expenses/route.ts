import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import type { FinancePeriod } from "@/lib/finance/periods";
import {
  cancelOperatingExpense,
  createOperatingExpense,
  deleteOperatingExpense,
  fetchExpensesData,
  postOperatingExpense,
  updateOperatingExpense,
} from "@/lib/services/expenses";
import { FACTORY_IDS, type PaymentMethod, type ViewScope } from "@/types";

function scopeFactoryId(scope: ViewScope): string {
  return scope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("finance", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "block") as ViewScope;
  const period = (request.nextUrl.searchParams.get("period") ?? "this_month") as FinancePeriod;
  const monthYear = request.nextUrl.searchParams.get("monthYear") ?? undefined;
  const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
  const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
  try {
    const data = await fetchExpensesData(scope, auth.user.organization_id, period, {
      monthYear,
      dateFrom,
      dateTo,
    });
    return jsonOk(data);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Failed to load expenses");
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "create";

  try {
    if (action === "create") {
      const auth = await requireApiUser("finance", "manage");
      if ("error" in auth) {
        const fallback = await requireApiUser("finance", "sync");
        if ("error" in fallback) return fallback.error;
        const result = await createOperatingExpense(
          {
            factory_id: body.factory_id ?? scopeFactoryId((body.scope ?? "block") as ViewScope),
            category_id: body.category_id,
            vendor_name: body.vendor_name,
            description: body.description,
            amount: Number(body.amount),
            expense_date: body.expense_date,
            payment_method: body.payment_method as PaymentMethod,
            bank_account_id: body.bank_account_id,
            reference: body.reference,
            notes: body.notes,
            post_immediately: body.post_immediately === true,
          },
          fallback.user
        );
        return jsonOk(result);
      }
      const result = await createOperatingExpense(
        {
          factory_id: body.factory_id ?? scopeFactoryId((body.scope ?? "block") as ViewScope),
          category_id: body.category_id,
          vendor_name: body.vendor_name,
          description: body.description,
          amount: Number(body.amount),
          expense_date: body.expense_date,
          payment_method: body.payment_method as PaymentMethod,
          bank_account_id: body.bank_account_id,
          reference: body.reference,
          notes: body.notes,
          post_immediately: body.post_immediately === true,
        },
        auth.user
      );
      return jsonOk(result);
    }

    if (action === "update") {
      const auth = await requireApiUser("finance", "manage");
      if ("error" in auth) {
        const fallback = await requireApiUser("finance", "sync");
        if ("error" in fallback) return fallback.error;
        if (!body.id) return jsonError("Expense id is required");
        return jsonOk(
          await updateOperatingExpense(body.id, body, fallback.user)
        );
      }
      if (!body.id) return jsonError("Expense id is required");
      return jsonOk(await updateOperatingExpense(body.id, body, auth.user));
    }

    if (action === "post") {
      const auth = await requireApiUser("finance", "manage");
      if ("error" in auth) {
        const fallback = await requireApiUser("finance", "sync");
        if ("error" in fallback) return fallback.error;
        if (!body.id) return jsonError("Expense id is required");
        return jsonOk(await postOperatingExpense(body.id, fallback.user));
      }
      if (!body.id) return jsonError("Expense id is required");
      return jsonOk(await postOperatingExpense(body.id, auth.user));
    }

    if (action === "cancel") {
      const auth = await requireApiUser("finance", "manage");
      if ("error" in auth) {
        const fallback = await requireApiUser("finance", "sync");
        if ("error" in fallback) return fallback.error;
        if (!body.id) return jsonError("Expense id is required");
        return jsonOk(await cancelOperatingExpense(body.id, fallback.user));
      }
      if (!body.id) return jsonError("Expense id is required");
      return jsonOk(await cancelOperatingExpense(body.id, auth.user));
    }

    if (action === "delete") {
      const auth = await requireApiUser("finance", "manage");
      if ("error" in auth) {
        const fallback = await requireApiUser("finance", "sync");
        if ("error" in fallback) return fallback.error;
        if (!body.id) return jsonError("Expense id is required");
        await deleteOperatingExpense(body.id, fallback.user);
        return jsonOk({ deleted: true });
      }
      if (!body.id) return jsonError("Expense id is required");
      await deleteOperatingExpense(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    return jsonError(`Unknown action: ${action}`);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Expense action failed");
  }
}
