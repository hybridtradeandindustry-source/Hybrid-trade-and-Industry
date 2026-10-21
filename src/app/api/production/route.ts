import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import {
  createProductionBatch,
  deleteProductionBatchRecord,
  insertProductionCount,
  updateProductionBatchStatus,
  updateProductionCountRecord,
  deleteProductionCountRecord,
} from "@/lib/services/production";
import { createProductionCount, getProductionData } from "@/lib/services";
import {
  deleteDailyLog,
  listDailyLogsForBatch,
  upsertDailyLog,
} from "@/lib/services/production-daily-log";
import type { ViewScope } from "@/types";
import type { ProductionFilterState } from "@/lib/production/filters";
import { generateProductionReport } from "@/lib/production/export-report";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("production", "read");
  if ("error" in auth) return auth.error;

  const dailyLogsBatchId = request.nextUrl.searchParams.get("daily_logs_batch_id");
  if (dailyLogsBatchId) {
    const logs = await listDailyLogsForBatch(dailyLogsBatchId, auth.user.organization_id);
    return jsonOk({ logs });
  }

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const data = await getProductionData(scope, auth.user.organization_id);
  return jsonOk(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? "create_count";

  try {
    if (action === "create_batch") {
      const auth = await requireApiUser("production", "create");
      if ("error" in auth) return auth.error;
      const factoryId = body.factory_id;
      if (!factoryId) return jsonError("Factory is required");
      const result = await createProductionBatch(factoryId, auth.user, {
        block_size_cm: body.block_size_cm != null ? Number(body.block_size_cm) : undefined,
        planned_quantity: body.planned_quantity != null ? Number(body.planned_quantity) : undefined,
        operator_id: body.operator_id ?? auth.user.id,
        expected_waste_rate: body.expected_waste_rate != null ? Number(body.expected_waste_rate) : undefined,
        name: body.name,
      });
      return jsonOk(result);
    }

    if (action === "update_batch") {
      const auth = await requireApiUser("production", "verify");
      if ("error" in auth) return auth.error;
      const result = await updateProductionBatchStatus(body.id, body.status, auth.user);
      return jsonOk(result);
    }

    if (action === "delete_batch") {
      const auth = await requireApiUser("production", "verify");
      if ("error" in auth) return auth.error;
      await deleteProductionBatchRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    if (action === "update_count") {
      const auth = await requireApiUser("production", "verify");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      const payload = {
        ...data,
        good_count: data.good_count != null ? Number(data.good_count) : undefined,
        damaged_count: data.damaged_count != null ? Number(data.damaged_count) : undefined,
        material_received: data.material_received != null ? Number(data.material_received) : undefined,
        processed_output: data.processed_output != null ? Number(data.processed_output) : undefined,
        waste_rejected: data.waste_rejected != null ? Number(data.waste_rejected) : undefined,
      };
      const result = await updateProductionCountRecord(id, payload, auth.user);
      return jsonOk(result);
    }

    if (action === "delete_count") {
      const auth = await requireApiUser("production", "verify");
      if ("error" in auth) return auth.error;
      await deleteProductionCountRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    if (action === "create_daily_log") {
      const auth = await requireApiUser("production", "create");
      if ("error" in auth) return auth.error;
      if (!body.batch_id || !body.factory_id) {
        return jsonError("Batch and factory are required");
      }
      if (body.target_plates == null && body.actual_plates == null) {
        return jsonError("Provide a target or an actual count");
      }
      const log = await upsertDailyLog(
        {
          batch_id: body.batch_id,
          factory_id: body.factory_id,
          log_date: body.log_date,
          target_plates: body.target_plates != null ? Number(body.target_plates) : null,
          actual_plates: body.actual_plates != null ? Number(body.actual_plates) : null,
          shortfall_reason: body.shortfall_reason,
          cement_bags_used: body.cement_bags_used != null ? Number(body.cement_bags_used) : null,
          poliche_loads_used:
            body.poliche_loads_used != null ? Number(body.poliche_loads_used) : null,
        },
        auth.user
      );
      return jsonOk(log);
    }

    if (action === "delete_daily_log") {
      const auth = await requireApiUser("production", "verify");
      if ("error" in auth) return auth.error;
      await deleteDailyLog(body.id, auth.user.organization_id);
      return jsonOk({ deleted: true });
    }

    if (action === "export_report") {
      const auth = await requireApiUser("production", "read");
      if ("error" in auth) return auth.error;
      const scope = (body.scope ?? "combined") as ViewScope;
      const format = body.format === "Excel" ? "Excel" : "PDF";
      const filters: ProductionFilterState = {
        period: body.period ?? "weekly",
        dateFrom: body.dateFrom ?? new Date().toISOString().slice(0, 10),
        dateTo: body.dateTo ?? new Date().toISOString().slice(0, 10),
        batchStatus: body.batchStatus ?? "all",
        countType: body.countType ?? "all",
      };
      const data = await getProductionData(scope, auth.user.organization_id);
      const result = await generateProductionReport({
        batches: (data.batches ?? []) as import("@/types").ProductionBatch[],
        counts: (data.counts ?? []) as import("@/types").ProductionCount[],
        filters,
        scope,
        format,
      });
      return jsonOk(result);
    }

    const auth = await requireApiUser("production", "create");
    if ("error" in auth) return auth.error;

    const payload = {
      factory_id: body.factory_id,
      batch_id: body.batch_id,
      checkpoint: body.checkpoint,
      good_count: body.good_count != null ? Number(body.good_count) : undefined,
      damaged_count: body.damaged_count != null ? Number(body.damaged_count) : undefined,
      material_received: body.material_received != null ? Number(body.material_received) : undefined,
      processed_output: body.processed_output != null ? Number(body.processed_output) : undefined,
      waste_rejected: body.waste_rejected != null ? Number(body.waste_rejected) : undefined,
      photo_url: body.photo_url,
    };

    if (!payload.factory_id) return jsonError("Factory is required");

    const count = await insertProductionCount(payload, auth.user);
    return jsonOk(count);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Production action failed");
  }
}
