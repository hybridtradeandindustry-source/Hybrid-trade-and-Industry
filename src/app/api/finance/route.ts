import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createReconciliationRecord,
  createSageTransactionRecord,
  deleteReconciliationRecord,
  deleteSageTransactionRecord,
  updateReconciliationRecord,
  updateSageTransactionRecord,
} from "@/lib/services/finance";
import { getFinanceData, getFinanceDashboardMetrics, triggerFinanceSync, verifyReconciliation } from "@/lib/services";
import type { FinancePeriod } from "@/lib/finance/periods";
import type { ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("finance", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const view = request.nextUrl.searchParams.get("view") ?? "reconciliation";
  const status = request.nextUrl.searchParams.get("status") ?? "all";

  if (view === "dashboard") {
    const period = (request.nextUrl.searchParams.get("period") ?? "this_month") as FinancePeriod;
    const monthYear = request.nextUrl.searchParams.get("monthYear") ?? undefined;
    const dateFrom = request.nextUrl.searchParams.get("dateFrom") ?? undefined;
    const dateTo = request.nextUrl.searchParams.get("dateTo") ?? undefined;
    const data = await getFinanceDashboardMetrics(scope, period, { monthYear, dateFrom, dateTo });
    return jsonOk(data);
  }

  const data = await getFinanceData(scope, status);
  return jsonOk(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "sync";

  try {
    if (action === "verify") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      const result = await verifyReconciliation(body.id, body.status, auth.user);
      return jsonOk(result);
    }

    if (action === "create_reconciliation") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      if (!body.operational_record_id?.trim()) {
        return jsonError("Record ID is required");
      }
      if (body.operational_amount == null || Number.isNaN(Number(body.operational_amount))) {
        return jsonError("Operational amount is required");
      }
      const payload = {
        factory_id: body.factory_id,
        operational_record_type: body.operational_record_type,
        operational_record_id: String(body.operational_record_id),
        operational_amount: Number(body.operational_amount),
        sage_amount:
          body.sage_amount != null && body.sage_amount !== ""
            ? Number(body.sage_amount)
            : null,
        status: body.status,
      };
      const result = await createReconciliationRecord(payload, auth.user);
      if (result.status === "pending" || result.status === "variance") {
        await import("@/lib/services/notifications").then((m) =>
          m.notifyReconciliationPending(
            result.id,
            `${result.operational_record_type} variance ${result.variance ?? 0}`,
            auth.user
          )
        );
      }
      return jsonOk(result);
    }

    if (action === "update_reconciliation") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      const payload = {
        ...data,
        operational_amount: data.operational_amount != null ? Number(data.operational_amount) : undefined,
        sage_amount:
          data.sage_amount != null && data.sage_amount !== "" ? Number(data.sage_amount) : data.sage_amount === "" ? null : undefined,
      };
      const result = await updateReconciliationRecord(id, payload, auth.user);
      return jsonOk(result);
    }

    if (action === "delete_reconciliation") {
      const auth = await requireApiUser("finance", "verify");
      if ("error" in auth) return auth.error;
      await deleteReconciliationRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    if (action === "create_transaction") {
      const auth = await requireApiUser("finance", "sync");
      if ("error" in auth) return auth.error;
      const payload = {
        factory_id: body.factory_id,
        description: body.description,
        amount: Number(body.amount),
        transaction_type: body.transaction_type,
        transaction_date: body.transaction_date,
        sage_id: body.sage_id,
      };
      const result = await createSageTransactionRecord(payload, auth.user);
      return jsonOk(result);
    }

    if (action === "update_transaction") {
      const auth = await requireApiUser("finance", "sync");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      const payload = {
        ...data,
        amount: data.amount != null ? Number(data.amount) : undefined,
      };
      const result = await updateSageTransactionRecord(id, payload, auth.user);
      return jsonOk(result);
    }

    if (action === "delete_transaction") {
      const auth = await requireApiUser("finance", "sync");
      if ("error" in auth) return auth.error;
      await deleteSageTransactionRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    const auth = await requireApiUser("finance", "sync");
    if ("error" in auth) return auth.error;
    const syncLog = await triggerFinanceSync(auth.user);
    return jsonOk(syncLog);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Finance action failed");
  }
}
