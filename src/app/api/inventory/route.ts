import { NextRequest } from "next/server";
import { requireApiUser, requireCatalogApproval, requireCatalogManage } from "@/lib/api/auth-helpers";
import { jsonError, jsonOk } from "@/lib/api/response";
import { exportInventoryCsv } from "@/lib/inventory/inventory-utils";
import {
  bulkStockCounts,
  createInventoryMovement,
  createStockCount,
  deleteInventoryItemRecord,
  getInventoryData,
  reserveInventoryStock,
  reviewStockCountRecord,
  transferInventoryStock,
  updateInventoryItemRecord,
  createInventoryItemRecord,
} from "@/lib/services";
import {
  createCustomFieldDefRecord,
  createInventoryCategoryRecord,
  createInventoryItemTypeRecord,
  createInventoryUnitRecord,
  createSkuRuleRecord,
  createUnitConversionRecord,
  deactivateCustomFieldDefRecord,
  deactivateInventoryCategoryRecord,
  deactivateInventoryItemTypeRecord,
  deactivateInventoryUnitRecord,
  deactivateSkuRuleRecord,
  deleteUnitConversionRecord,
  reactivateInventoryCategoryRecord,
  reactivateInventoryItemTypeRecord,
  reactivateInventoryUnitRecord,
  updateCustomFieldDefRecord,
  updateInventoryCategoryRecord,
  updateInventoryItemTypeRecord,
  updateInventoryUnitRecord,
  updateSkuRuleRecord,
} from "@/lib/services/inventory-catalog";
import {
  assignItemBarcode,
  copyItemTypeTemplate,
  createPurchaseRequisitionFromReorder,
  exportCatalogCsv,
  generateNextSku,
  interFactoryTransfer,
  processStockCountWithRules,
  quarantineStock,
  releaseQuarantine,
  reviewCatalogChange,
  submitCatalogChangeRequest,
  syncSageInventoryItem,
} from "@/lib/services/inventory-enterprise";
import type { ViewScope } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser("inventory", "read");
  if ("error" in auth) return auth.error;

  const scope = (request.nextUrl.searchParams.get("scope") ?? "combined") as ViewScope;
  const itemId = request.nextUrl.searchParams.get("itemId") ?? undefined;
  const format = request.nextUrl.searchParams.get("format");
  const includeInactiveCatalog =
    request.nextUrl.searchParams.get("includeInactiveCatalog") === "1";

  const data = await getInventoryData(scope, itemId, { includeInactiveCatalog });

  if (format === "csv") {
    const csv = exportInventoryCsv(
      data.items as Parameters<typeof exportInventoryCsv>[0],
      data.config as Parameters<typeof exportInventoryCsv>[1]
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="inventory-${scope}-${Date.now()}.csv"`,
      },
    });
  }

  if (format === "catalog") {
    const csv = await exportCatalogCsv(auth.user);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="catalog-${Date.now()}.csv"`,
      },
    });
  }

  return jsonOk(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const action = body.action ?? (body.type === "movement" ? "movement" : "stock_count");

  try {
    if (action === "create_item") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createInventoryItemRecord(body, auth.user));
    }

    if (action === "update_item") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateInventoryItemRecord(id, data, auth.user));
    }

    if (action === "delete_item") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      await deleteInventoryItemRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }

    if (action === "review_stock_count") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await reviewStockCountRecord(body.id, body.status, auth.user));
    }

    if (action === "transfer") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await transferInventoryStock(body, auth.user));
    }

    if (action === "reserve") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      const reserveAction = body.reserve_action ?? body.operation;
      if (reserveAction !== "reserve" && reserveAction !== "release") {
        return jsonError("reserve_action must be 'reserve' or 'release'");
      }
      return jsonOk(
        await reserveInventoryStock(
          { item_id: body.item_id, quantity: body.quantity, action: reserveAction },
          auth.user
        )
      );
    }

    if (action === "bulk_count") {
      const auth = await requireApiUser("inventory", "count");
      if ("error" in auth) return auth.error;
      return jsonOk(await bulkStockCounts(body.counts, auth.user));
    }

    if (action === "create_item_type") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await createInventoryItemTypeRecord(body, auth.user));
    }
    if (action === "update_item_type") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateInventoryItemTypeRecord(id, data, auth.user));
    }
    if (action === "delete_item_type") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      await deactivateInventoryItemTypeRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }
    if (action === "reactivate_item_type") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await reactivateInventoryItemTypeRecord(body.id, auth.user));
    }
    if (action === "create_category") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await createInventoryCategoryRecord(body, auth.user));
    }
    if (action === "update_category") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateInventoryCategoryRecord(id, data, auth.user));
    }
    if (action === "delete_category") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      await deactivateInventoryCategoryRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }
    if (action === "reactivate_category") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await reactivateInventoryCategoryRecord(body.id, auth.user));
    }
    if (action === "create_unit") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await createInventoryUnitRecord(body, auth.user));
    }
    if (action === "update_unit") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateInventoryUnitRecord(id, data, auth.user));
    }
    if (action === "delete_unit") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      await deactivateInventoryUnitRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }
    if (action === "reactivate_unit") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await reactivateInventoryUnitRecord(body.id, auth.user));
    }

    if (action === "create_sku_rule") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await createSkuRuleRecord(body, auth.user));
    }
    if (action === "update_sku_rule") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateSkuRuleRecord(id, data, auth.user));
    }
    if (action === "delete_sku_rule") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      await deactivateSkuRuleRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }
    if (action === "create_custom_field") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await createCustomFieldDefRecord(body, auth.user));
    }
    if (action === "update_custom_field") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      const { id, ...data } = body;
      return jsonOk(await updateCustomFieldDefRecord(id, data, auth.user));
    }
    if (action === "delete_custom_field") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      await deactivateCustomFieldDefRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }
    if (action === "create_unit_conversion") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await createUnitConversionRecord(body, auth.user));
    }
    if (action === "delete_unit_conversion") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      await deleteUnitConversionRecord(body.id, auth.user);
      return jsonOk({ deleted: true });
    }
    if (action === "submit_catalog_change") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      const req = await submitCatalogChangeRequest(body, auth.user);
      void import("@/lib/services/notifications").then((m) =>
        m.notifyCatalogChangeSubmitted(req.id, req.entity_type, auth.user)
      );
      return jsonOk(req);
    }

    if (action === "generate_sku") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      const sku = await generateNextSku(body.factory_id, body.item_type_id, body.category_id, auth.user);
      return jsonOk({ sku });
    }

    if (action === "create_requisition") {
      const auth = await requireApiUser("inventory", "requisition");
      if ("error" in auth) return auth.error;
      return jsonOk(await createPurchaseRequisitionFromReorder(body.factory_id, auth.user));
    }

    if (action === "review_catalog_change") {
      const auth = await requireCatalogApproval();
      if ("error" in auth) return auth.error;
      const req = await reviewCatalogChange(body.id, body.status, auth.user, body.notes);
      if (req.requested_by) {
        void import("@/lib/services/notifications").then((m) =>
          m.notifyCatalogChangeReviewed(req.id, body.status, req.requested_by!, auth.user)
        );
      }
      return jsonOk(req);
    }

    if (action === "copy_type_template") {
      const auth = await requireCatalogManage();
      if ("error" in auth) return auth.error;
      return jsonOk(await copyItemTypeTemplate(body.source_type_id, body.new_name, auth.user));
    }

    if (action === "quarantine") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await quarantineStock(body, auth.user));
    }

    if (action === "release_quarantine") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await releaseQuarantine(body.id, auth.user));
    }

    if (action === "inter_factory_transfer") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await interFactoryTransfer(body, auth.user));
    }

    if (action === "assign_barcode") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk({ barcode: await assignItemBarcode(body.item_id, auth.user) });
    }

    if (action === "sync_sage_item") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await syncSageInventoryItem(body.item_id, auth.user));
    }

    if (action === "blind_count") {
      const auth = await requireApiUser("inventory", "count");
      if ("error" in auth) return auth.error;
      return jsonOk(await processStockCountWithRules(body, auth.user));
    }

    if (action === "movement") {
      const auth = await requireApiUser("inventory", "manage");
      if ("error" in auth) return auth.error;
      return jsonOk(await createInventoryMovement(body, auth.user));
    }

    const auth = await requireApiUser("inventory", "count");
    if ("error" in auth) return auth.error;
    return jsonOk(await createStockCount(body, auth.user));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "Inventory action failed");
  }
}
