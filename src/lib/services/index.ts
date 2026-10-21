import { APP_CONFIG, requireSupabase } from "@/lib/config";
import {
  fetchDashboardMetrics,
  fetchFactoryComparisonMetrics,
  fetchProductionTrend,
  fetchRevenueTrend,
} from "@/lib/services/dashboard-metrics";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import type {
  BlockCheckpoint,
  InventoryItem,
  OrderStatus,
  ViewScope,
} from "@/types";
import { FACTORY_IDS } from "@/types";

export async function getDashboardData(scope: ViewScope) {
  requireSupabase();
  void import("@/lib/services/notifications").then((m) => {
    void m.syncAiAlertsToNotifications(APP_CONFIG.orgId);
    void m.syncMissingDataNotifications(APP_CONFIG.orgId);
  });

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from("orders")
    .select("*, customers(name)")
    .order("created_at", { ascending: false })
    .limit(5);

  const { data: alerts } = await supabase
    .from("ai_alerts")
    .select("*")
    .eq("is_resolved", false)
    .limit(5);

  const { count: pendingCount } = await supabase
    .from("reconciliation_records")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const [metrics, productionTrend, revenueTrend, factoryComparison] = await Promise.all([
    fetchDashboardMetrics(scope),
    fetchProductionTrend(),
    fetchRevenueTrend(),
    fetchFactoryComparisonMetrics(),
  ]);

  return {
    metrics,
    productionTrend,
    revenueTrend,
    factoryComparison,
    recentOrders: orders ?? [],
    aiAlerts: alerts ?? [],
    pendingApprovals: pendingCount ?? 0,
  };
}

export async function getFinanceData(scope: ViewScope, status?: string) {
  

  const supabase = await createClient();
  let query = supabase.from("reconciliation_records").select("*");
  if (status && status !== "all") query = query.eq("status", status);
  if (scope === "block") query = query.eq("factory_id", "22222222-2222-2222-2222-222222222221");
  if (scope === "recycling") query = query.eq("factory_id", "22222222-2222-2222-2222-222222222222");
  const { data: reconciliation } = await query.order("created_at", { ascending: false });
  const { data: syncLogs } = await supabase
    .from("sage_sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1);
  let txQuery = supabase.from("sage_transactions").select("*");
  if (scope === "block") txQuery = txQuery.eq("factory_id", "22222222-2222-2222-2222-222222222221");
  if (scope === "recycling") txQuery = txQuery.eq("factory_id", "22222222-2222-2222-2222-222222222222");
  const { data: transactions } = await txQuery
    .order("transaction_date", { ascending: false })
    .limit(50);

  return {
    reconciliation: reconciliation ?? [],
    syncLog: syncLogs?.[0] ?? null,
    transactions: transactions ?? [],
  };
}

export async function getFinanceDashboardMetrics(
  scope: ViewScope,
  period: import("@/lib/finance/periods").FinancePeriod = "this_month",
  options?: { dateFrom?: string; dateTo?: string; monthYear?: string }
) {
  const { resolveFinanceDateRange } = await import("@/lib/finance/periods");
  const { from, to, label } = resolveFinanceDateRange(period, options);

  

  const supabase = await createClient();
  const factoryId =
    scope === "block"
      ? FACTORY_IDS.block
      : scope === "recycling"
        ? FACTORY_IDS.recycling
        : null;

  let ordersQuery = supabase.from("orders").select("*, customers(name, customer_type)");
  if (factoryId) ordersQuery = ordersQuery.eq("factory_id", factoryId);
  const { data: orders } = await ordersQuery;

  const { data: customers } = await supabase.from("customers").select("*");
  const { data: payments } = await supabase.from("customer_payments").select("*");
  const { data: supplierPaymentRows } = await supabase
    .from("supplier_payments")
    .select("amount, payment_date, purchase:material_purchases(factory_id)");

  let txQuery = supabase.from("sage_transactions").select("*");
  if (factoryId) txQuery = txQuery.eq("factory_id", factoryId);
  const { data: transactions } = await txQuery;

  let reconQuery = supabase.from("reconciliation_records").select("*");
  if (factoryId) reconQuery = reconQuery.eq("factory_id", factoryId);
  const { data: reconciliation } = await reconQuery;

  const { computeFinanceDashboard } = await import("@/lib/services/finance-dashboard");
  const supplierPayments = (supplierPaymentRows ?? []).map((row) => ({
    amount: Number(row.amount),
    payment_date: row.payment_date as string,
    purchase_factory_id:
      (row.purchase as { factory_id?: string | null } | null)?.factory_id ?? null,
  }));
  return computeFinanceDashboard({
    orders: (orders ?? []) as import("@/types").Order[],
    payments: (payments ?? []) as import("@/types").CustomerPayment[],
    supplierPayments,
    customers: (customers ?? []) as import("@/types").Customer[],
    transactions: (transactions ?? []) as import("@/types").SageTransaction[],
    reconciliation: (reconciliation ?? []) as import("@/types").ReconciliationRecord[],
    scope,
    dateFrom: from,
    dateTo: to,
    periodLabel: label,
  });
}

export async function triggerFinanceSync(user: ApiUser) {
  

  const service = await createServiceClient();
  const { data: log } = await service
    .from("sage_sync_logs")
    .insert({
      organization_id: user.organization_id,
      status: "running",
      records_processed: 0,
    })
    .select()
    .single();

  await service
    .from("sage_sync_logs")
    .update({
      status: "success",
      records_processed: 12,
      completed_at: new Date().toISOString(),
    })
    .eq("id", log!.id);

  return log;
}

export async function verifyReconciliation(
  id: string,
  status: "approved" | "matched",
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data } = await supabase
    .from("reconciliation_records")
    .update({
      status,
      verified_by: user.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  return data;
}

export async function getProductionData(scope: ViewScope, organizationId?: string) {
  

  if (!organizationId) throw new Error("Organization not found");

  const { fetchProductionData } = await import("@/lib/services/production");
  const { computeProductionStats } = await import("@/lib/production/stats");
  const { todayIsoDate } = await import("@/lib/production/filters");
  const result = await fetchProductionData(scope, organizationId);
  const today = todayIsoDate();
  return {
    ...result,
    stats: computeProductionStats(result.counts, scope, {
      dateFrom: today,
      dateTo: today,
      batches: result.batches,
    }),
  };
}

export async function createProductionCount(
  input: {
    factory_id: string;
    checkpoint?: BlockCheckpoint;
    good_count?: number;
    damaged_count?: number;
    material_received?: number;
    processed_output?: number;
    waste_rejected?: number;
    photo_url?: string;
    batch_id?: string;
  },
  user: ApiUser
) {
  

  const { insertProductionCount } = await import("@/lib/services/production");
  return insertProductionCount(input, user);
}

export async function getInventoryData(
  scope: ViewScope,
  itemId?: string,
  options?: { includeInactiveCatalog?: boolean }
) {
  const { filterCatalogConfigForFactory } = await import("@/lib/inventory/inventory-config");
  const { computeInventoryMetrics, needsReorder } = await import("@/lib/inventory/inventory-utils");
  const catalogFilterOptions = { includeInactive: options?.includeInactiveCatalog ?? false };

  const supabase = await createClient();
  const scopedFactoryId =
    scope === "block"
      ? FACTORY_IDS.block
      : scope === "recycling"
        ? FACTORY_IDS.recycling
        : null;

  let itemsQuery = supabase.from("inventory_items").select("*").eq("is_active", true);
  let movementsQuery = supabase
    .from("inventory_movements")
    .select("*, inventory_items(*)")
    .order("created_at", { ascending: false })
    .limit(scopedFactoryId ? 5000 : 500);
  let stockCountsQuery = supabase
    .from("stock_counts")
    .select("*, inventory_items(*)")
    .order("created_at", { ascending: false });

  if (scopedFactoryId) {
    itemsQuery = itemsQuery.eq("factory_id", scopedFactoryId);
    movementsQuery = movementsQuery.eq("factory_id", scopedFactoryId);
    stockCountsQuery = stockCountsQuery.eq("factory_id", scopedFactoryId);
  }
  if (itemId) {
    movementsQuery = movementsQuery.eq("item_id", itemId);
  }

  const { data: items } = await itemsQuery;
  const { data: stockCounts } = await stockCountsQuery;
  const { data: movements } = await movementsQuery;

  const [
    { data: itemTypes },
    { data: categories },
    { data: units },
    { data: locations },
    { data: locationStock },
    { data: lots },
    { data: boms },
    { data: bomLines },
    { data: schedules },
    { data: varianceRules },
    { data: requisitions },
    { data: reqLines },
    { data: sageMappings },
    { data: unitConversions },
    { data: customFieldDefs },
    { data: skuRules },
    { data: catalogChangeRequests },
    { data: quarantineHolds },
    { data: interFactoryTransfers },
  ] = await Promise.all([
    supabase.from("inventory_item_types").select("*"),
    supabase.from("inventory_categories").select("*"),
    supabase.from("inventory_units").select("*"),
    supabase.from("inventory_locations").select("*"),
    supabase.from("inventory_location_stock").select("*"),
    supabase.from("inventory_lots").select("*"),
    supabase.from("inventory_bom").select("*"),
    supabase.from("inventory_bom_lines").select("*"),
    supabase.from("inventory_cycle_count_schedules").select("*"),
    supabase.from("inventory_variance_rules").select("*"),
    supabase.from("purchase_requisitions").select("*"),
    supabase.from("purchase_requisition_lines").select("*"),
    supabase.from("sage_inventory_mappings").select("*"),
    supabase.from("inventory_unit_conversions").select("*"),
    supabase.from("inventory_custom_field_definitions").select("*"),
    supabase.from("inventory_sku_rules").select("*"),
    supabase.from("inventory_catalog_change_requests").select("*"),
    supabase.from("inventory_quarantine_holds").select("*").is("released_at", null),
    supabase.from("inventory_inter_factory_transfers").select("*"),
  ]);

  const itemList = items ?? [];
  const { computeInventoryIntelligence } = await import("@/lib/inventory/inventory-advanced");
  const fullConfig = {
    itemTypes: itemTypes ?? [],
    categories: categories ?? [],
    units: units ?? [],
    unitConversions: unitConversions ?? [],
    customFieldDefs: (customFieldDefs ?? []).filter((d) => d.is_active !== false),
    skuRules: (skuRules ?? []).filter((r) => r.is_active !== false),
    catalogChangeRequests: catalogChangeRequests ?? [],
  };
  const scopedConfig = filterCatalogConfigForFactory(fullConfig, scopedFactoryId, catalogFilterOptions);
  const inventoryConfig = {
    itemTypes: scopedConfig.itemTypes,
    categories: scopedConfig.categories,
    units: scopedConfig.units,
  };
  const pendingCounts = (stockCounts ?? []).filter(
    (sc) => sc.status === "pending_review"
  ).length;

  void import("@/lib/services/notifications").then((m) =>
    m.runLowStockNotificationCheck(APP_CONFIG.orgId)
  );

  return {
    items: itemList,
    movements: movements ?? [],
    stockCounts: (stockCounts ?? []).map((sc) => {
      const row = sc as Record<string, unknown> & { item?: import("@/types").InventoryItem };
      const nested = row.inventory_items as import("@/types").InventoryItem | null | undefined;
      return { ...sc, item: row.item ?? nested ?? undefined };
    }),
    metrics: computeInventoryMetrics(itemList, inventoryConfig, { pendingCounts }),
    lowStock: itemList.filter((i) => needsReorder(i)),
    reorderAlerts: itemList.filter((i) => needsReorder(i)),
    config: scopedConfig,
    enterprise: {
      locations: locations ?? [],
      locationStock: locationStock ?? [],
      lots: lots ?? [],
      boms: (boms ?? []).map((b) => ({ ...b, lines: (bomLines ?? []).filter((l) => l.bom_id === b.id) })),
      quarantineHolds: quarantineHolds ?? [],
      cycleCountSchedules: schedules ?? [],
      varianceRules: varianceRules ?? [],
      requisitions: (requisitions ?? []).map((r) => ({
        ...r,
        lines: (reqLines ?? []).filter((l) => l.requisition_id === r.id),
      })),
      sageMappings: sageMappings ?? [],
      interFactoryTransfers: interFactoryTransfers ?? [],
      unitConversions: scopedConfig.unitConversions ?? [],
      customFieldDefs: scopedConfig.customFieldDefs ?? [],
      skuRules: scopedConfig.skuRules ?? [],
      catalogChangeRequests: catalogChangeRequests ?? [],
      intelligence: computeInventoryIntelligence(itemList, movements ?? []),
    },
  };
}

export async function createStockCount(
  input: { factory_id: string; item_id: string; counted_quantity: number; notes?: string },
  user: ApiUser
) {
  const { notifyStockCountVariance } = await import("@/lib/services/notifications");

  

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("inventory_items")
    .select("quantity, name")
    .eq("id", input.item_id)
    .single();

  const systemQty = item?.quantity ?? 0;
  const variance = input.counted_quantity - Number(systemQty);

  const { data, error } = await supabase
    .from("stock_counts")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id,
      item_id: input.item_id,
      system_quantity: systemQty,
      counted_quantity: input.counted_quantity,
      notes: input.notes,
      counted_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  await notifyStockCountVariance(
    {
      stockCountId: data.id,
      itemId: input.item_id,
      itemName: (item?.name as string) ?? "Item",
      systemQty: Number(systemQty),
      countedQty: input.counted_quantity,
      variance,
    },
    user
  );

  return data;
}

export async function createInventoryMovement(
  input: {
    factory_id: string;
    item_id: string;
    quantity: number;
    movement_type: string;
    notes?: string;
  },
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id,
      item_id: input.item_id,
      quantity: input.quantity,
      movement_type: input.movement_type,
      notes: input.notes,
      created_by: user.id,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

type InventoryItemInput = {
  factory_id: string;
  name: string;
  sku: string;
  item_type_id?: string | null;
  category_id?: string | null;
  category?: "raw_material" | "work_in_process" | "finished_goods";
  unit: string;
  quantity?: number;
  reserved_quantity?: number;
  low_stock_threshold?: number;
  reorder_quantity?: number;
  max_stock_level?: number | null;
  unit_cost?: number;
  supplier?: string | null;
  location?: string | null;
};

export async function createInventoryItemRecord(
  input: InventoryItemInput,
  user: ApiUser
) {
  

  const { insertInventoryItem } = await import("@/lib/services/inventory");
  return insertInventoryItem(input, user);
}

export async function updateInventoryItemRecord(
  id: string,
  input: Partial<InventoryItemInput> & { is_active?: boolean },
  user: ApiUser
) {
  

  const { updateInventoryItemRecord: updateItem } = await import("@/lib/services/inventory");
  return updateItem(id, input, user);
}

export async function deleteInventoryItemRecord(id: string, user: ApiUser) {
  

  const { deactivateInventoryItem } = await import("@/lib/services/inventory");
  return deactivateInventoryItem(id, user);
}

export async function reviewStockCountRecord(
  id: string,
  status: "approved" | "rejected",
  user: ApiUser
) {
  

  const { reviewStockCountRecord: reviewCount } = await import("@/lib/services/inventory");
  return reviewCount(id, status, user);
}

export async function getOrdersData(scope: ViewScope, organizationId?: string) {
  

  if (!organizationId) throw new Error("Organization not found");
  const { fetchOrdersData } = await import("@/lib/services/orders");
  return fetchOrdersData(scope, organizationId);
}

export async function updateOrder(id: string, status: OrderStatus, user: ApiUser) {


  const { transitionOrderStatus } = await import("@/lib/services/orders");
  return transitionOrderStatus(id, status, user);
}

export async function updateRecyclingOrderStage(
  id: string,
  stage: import("@/types").RecyclingOrderStage,
  user: ApiUser
) {
  const { updateRecyclingOrderStage: updateStage } = await import("@/lib/services/orders");
  return updateStage(id, stage, user);
}

type OrderLineInput = {
  item_id: string;
  description: string;
  quantity: number;
  unit_price: number;
};

export async function createOrder(
  input: {
    factory_id: string;
    customer_id?: string;
    walking_customer?: {
      name: string;
      phone?: string;
      tin?: string;
      convert_to_regular?: boolean;
    };
    total_amount?: number;
    delivery_date?: string;
    payment_method?: "cash" | "bank";
    bank_account_id?: string;
    amount_paid?: number;
    discount_percent?: number;
    requires_invoice?: boolean;
    pending_pickup?: boolean;
    prepaid_advance?: boolean;
    withholding_applied?: boolean;
    vat_applied?: boolean;
    store_credit_applied?: number;
    lines?: OrderLineInput[];
  },
  user: ApiUser
) {
  let customerId = input.customer_id;

  if (input.walking_customer) {
    if (!input.walking_customer.name?.trim()) {
      throw new Error("Buyer name is required for walking customers");
    }

     else {
      const { insertCustomer, convertWalkingToRegular } = await import(
        "@/lib/services/customers"
      );
      const customer = await insertCustomer(
        {
          name: input.walking_customer.name.trim(),
          phone: input.walking_customer.phone,
          tin: input.walking_customer.tin,
          customer_type: "walking",
        },
        user
      );
      customerId = customer.id;
      if (input.walking_customer.convert_to_regular) {
        await convertWalkingToRegular(customerId, user);
      }
    }
  }

  if (!customerId) {
    throw new Error("A customer must be selected or buyer details provided");
  }

  

  const lines =
    input.lines ??
    (input.total_amount
      ? []
      : []);

  if (lines.length === 0 && input.total_amount) {
    throw new Error("Orders must include inventory line items when using Supabase");
  }

  const { insertOrder } = await import("@/lib/services/orders");
  return insertOrder(
    {
      factory_id: input.factory_id,
      customer_id: customerId,
      delivery_date: input.delivery_date,
      payment_method: input.payment_method,
      bank_account_id: input.bank_account_id,
      amount_paid: input.amount_paid,
      discount_percent: input.discount_percent,
      requires_invoice: input.requires_invoice,
      pending_pickup: input.pending_pickup,
      prepaid_advance: input.prepaid_advance,
      withholding_applied: input.withholding_applied,
      vat_applied: input.vat_applied,
      store_credit_applied: input.store_credit_applied,
      lines,
    },
    user
  );
}

export async function updateOrderRecord(
  id: string,
  input: {
    customer_id?: string;
    factory_id?: string;
    delivery_date?: string;
    payment_method?: "cash" | "bank";
    amount_paid?: number;
    discount_percent?: number;
    requires_invoice?: boolean;
    walking_customer?: {
      name: string;
      phone?: string;
      tin?: string;
      convert_to_regular?: boolean;
    };
    lines?: OrderLineInput[];
  },
  user: ApiUser
) {
  

  if (input.walking_customer) {
    const { updateCustomerRecord, convertWalkingToRegular } = await import(
      "@/lib/services/customers"
    );
    const { data: order } = await (async () => {
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      return supabase
        .from("orders")
        .select("customer_id")
        .eq("id", id)
        .eq("organization_id", user.organization_id)
        .single();
    })();

    if (order?.customer_id) {
      await updateCustomerRecord(
        order.customer_id,
        {
          name: input.walking_customer.name.trim(),
          phone: input.walking_customer.phone,
          tin: input.walking_customer.tin,
        },
        user
      );
      if (input.walking_customer.convert_to_regular) {
        await convertWalkingToRegular(order.customer_id, user);
      }
    }
  }

  const { updateOrderRecord: updateOrderInDb } = await import("@/lib/services/orders");
  const { walking_customer: _walking, ...orderInput } = input;
  return updateOrderInDb(id, orderInput, user);
}

export async function cancelOrder(id: string, user: ApiUser) {
  const { cancelOrderRecord } = await import("@/lib/services/orders");
  return cancelOrderRecord(id, user);
}

export async function recordOrderPickup(
  orderId: string,
  pickups: Array<{ order_item_id: string; quantity: number }>,
  user: ApiUser
) {
  const { recordOrderPickupAction } = await import("@/lib/services/orders");
  return recordOrderPickupAction(orderId, pickups, user);
}

export async function cancelOrderWithSettlement(
  id: string,
  settlement: { refundAmount: number; creditAmount: number; balancePaymentAmount: number },
  user: ApiUser
) {
  const { cancelOrderWithSettlement: cancelWithSettlementInDb } = await import(
    "@/lib/services/orders"
  );
  return cancelWithSettlementInDb(id, settlement, user);
}

export async function confirmDelivery(
  input: {
    order_id: string;
    photo_url?: string;
    signature_url?: string;
    gps_latitude?: number;
    gps_longitude?: number;
  },
  user: ApiUser
) {
  

  const { recordOrderDelivery } = await import("@/lib/services/orders");
  return recordOrderDelivery(input, user);
}

export async function getCustomersData(orgId: string) {
  

  const { fetchCustomersData } = await import("@/lib/services/customers");
  return fetchCustomersData(orgId);
}

export async function createCustomer(
  input: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    tin?: string;
    customer_type?: "regular" | "walking";
    balance?: number;
  },
  user: ApiUser
) {
  

  const { insertCustomer } = await import("@/lib/services/customers");
  return insertCustomer(input, user);
}

export async function updateCustomer(
  id: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    tin?: string;
    customer_type?: "regular" | "walking";
    balance?: number;
  },
  user: ApiUser
) {
  

  const { updateCustomerRecord } = await import("@/lib/services/customers");
  return updateCustomerRecord(id, input, user);
}

export async function convertCustomerToRegular(id: string, user: ApiUser) {
  

  const { convertWalkingToRegular } = await import("@/lib/services/customers");
  return convertWalkingToRegular(id, user);
}

export async function recordCustomerPayment(
  input: {
    customer_id: string;
    amount: number;
    payment_method: "cash" | "bank";
    bank_account_id?: string;
    payment_date?: string;
    reference?: string;
    notes?: string;
    order_id?: string;
    affects_balance?: boolean;
  },
  user: ApiUser
) {


  const { recordCustomerPayment: recordPayment } = await import(
    "@/lib/services/customer-order-sync"
  );
  return recordPayment(input, user);
}

export async function getCustomerPayments(customerId: string, orgId: string) {
  

  const { fetchCustomerPayments } = await import("@/lib/services/customer-order-sync");
  return fetchCustomerPayments(customerId, orgId);
}

export async function getBanksData(orgId: string, activeOnly = true) {
  

  const { fetchBanks } = await import("@/lib/services/banks");
  const banks = await fetchBanks(orgId);
  return activeOnly ? banks.filter((b) => b.is_active) : banks;
}

export async function createBank(
  input: { name: string; code?: string },
  user: ApiUser
) {


  const { insertBank } = await import("@/lib/services/banks");
  return insertBank(input, user);
}

export async function updateBank(
  id: string,
  input: { name?: string; code?: string; is_active?: boolean },
  user: ApiUser
) {


  const { updateBankRecord } = await import("@/lib/services/banks");
  return updateBankRecord(id, input, user);
}

export async function getBankAccountsData(orgId: string, bankId?: string) {
  const { fetchBankAccounts } = await import("@/lib/services/banks");
  return fetchBankAccounts(orgId, bankId);
}

export async function createBankAccount(
  input: { bank_id: string; account_number: string; account_name?: string },
  user: ApiUser
) {
  const { insertBankAccount } = await import("@/lib/services/banks");
  return insertBankAccount(input, user);
}

export async function updateBankAccount(
  id: string,
  input: { account_number?: string; account_name?: string; is_active?: boolean },
  user: ApiUser
) {
  const { updateBankAccountRecord } = await import("@/lib/services/banks");
  return updateBankAccountRecord(id, input, user);
}

export async function getPurchasingData(orgId: string, scope?: ViewScope) {


  const { fetchPurchasingData } = await import("@/lib/services/purchasing");
  return fetchPurchasingData(orgId, scope);
}

export async function createSupplier(
  input: {
    name: string;
    contact_phone?: string;
    contact_email?: string;
    address?: string;
    supplier_type?: import("@/types").SupplierType;
  },
  user: ApiUser
) {


  const { insertSupplier } = await import("@/lib/services/purchasing");
  return insertSupplier(input, user);
}

export async function getSuppliersData(orgId: string) {
  const { fetchSuppliers } = await import("@/lib/services/purchasing");
  return fetchSuppliers(orgId);
}

export async function updateSupplier(
  id: string,
  input: {
    name?: string;
    contact_phone?: string;
    contact_email?: string;
    address?: string;
    supplier_type?: import("@/types").SupplierType;
    is_active?: boolean;
  },
  user: ApiUser
) {
  const { updateSupplierRecord } = await import("@/lib/services/purchasing");
  return updateSupplierRecord(id, input, user);
}

export async function getSupplierDetailData(id: string, orgId: string) {
  const { getSupplierDetail } = await import("@/lib/services/supplier-detail");
  return getSupplierDetail(id, orgId);
}

export async function createMaterialPurchase(
  input: {
    factory_id?: string;
    supplier_id?: string;
    supplier_name: string;
    material_type: import("@/types").MaterialPurchaseType;
    item_id?: string;
    quantity: number;
    unit: string;
    unit_price: number;
    vehicle_plate?: string;
    delivery_notes?: string;
    purchase_date?: string;
    receive_now?: boolean;
    amount_paid?: number;
    pay_method?: "cash" | "bank";
    bank_account_id?: string;
    new_item_name?: string;
  },
  user: ApiUser
) {


  const { insertMaterialPurchase } = await import("@/lib/services/purchasing");
  return insertMaterialPurchase(input, user);
}

export async function updateMaterialPurchase(
  purchaseId: string,
  input: {
    supplier_id?: string | null;
    supplier_name?: string;
    material_type?: import("@/types").MaterialPurchaseType;
    item_id?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    purchase_date?: string;
    vehicle_plate?: string;
    delivery_notes?: string;
  },
  user: ApiUser
) {
  const { updateMaterialPurchase: updatePurchase } = await import("@/lib/services/purchasing");
  return updatePurchase(purchaseId, input, user);
}

export async function receiveMaterialPurchase(
  purchaseId: string,
  user: ApiUser,
  input?: {
    amount_paid?: number;
    pay_method?: "cash" | "bank";
    bank_account_id?: string;
  }
) {


  const { receiveMaterialPurchase: receivePurchase } = await import("@/lib/services/purchasing");
  return receivePurchase(purchaseId, user, input);
}

export async function finalizeMaterialPurchaseSorting(
  purchaseId: string,
  netRecyclableWeight: number,
  user: ApiUser
) {


  const { finalizeMaterialPurchaseSorting: finalizeSorting } = await import(
    "@/lib/services/purchasing"
  );
  return finalizeSorting(purchaseId, netRecyclableWeight, user);
}

export async function updatePurchaseInitialWeight(
  purchaseId: string,
  initialReceivedWeight: number,
  user: ApiUser
) {


  const { updatePurchaseInitialWeight: updateInitialWeight } = await import(
    "@/lib/services/purchasing"
  );
  return updateInitialWeight(purchaseId, initialReceivedWeight, user);
}

export async function cancelMaterialPurchase(
  purchaseId: string,
  user: ApiUser,
  reason?: string
) {
  const { cancelMaterialPurchase: cancelPurchase } = await import("@/lib/services/purchasing");
  return cancelPurchase(purchaseId, user, reason);
}

export async function paySupplierCredit(
  input: {
    supplier_id: string;
    amount: number;
    payment_method: "cash" | "bank";
    bank_account_id?: string;
    payment_date?: string;
    reference?: string;
    notes?: string;
    purchase_id?: string;
  },
  user: ApiUser
) {


  const { paySupplierCredit: payCredit } = await import("@/lib/services/purchasing");
  return payCredit(input, user);
}

export async function deactivateCustomer(id: string, user: ApiUser) {
  

  const { deactivateCustomerRecord } = await import("@/lib/services/customers");
  await deactivateCustomerRecord(id, user);
  return { deleted: true };
}

export async function getHrData(
  scope: ViewScope,
  orgId?: string,
  options?: { attendanceMonth?: number; attendanceYear?: number }
) {
  const { fetchHrData } = await import("@/lib/services/hr");
  return fetchHrData(scope, orgId ?? APP_CONFIG.orgId, options);
}

export async function createDepartment(
  input: {
    factory_id?: string;
    code: string;
    name: string;
    description?: string;
    manager_employee_id?: string;
  },
  user: ApiUser
) {
  
  const { insertDepartment } = await import("@/lib/services/hr");
  return insertDepartment(input, user);
}

export async function updateDepartment(
  id: string,
  input: Record<string, unknown>,
  user: ApiUser
) {
  
  const { updateDepartmentRecord } = await import("@/lib/services/hr");
  return updateDepartmentRecord(id, input as Parameters<typeof updateDepartmentRecord>[1], user);
}

export async function deactivateDepartment(id: string, user: ApiUser) {
  
  const { updateDepartmentRecord } = await import("@/lib/services/hr");
  return updateDepartmentRecord(id, { is_active: false }, user);
}

export async function reactivateDepartment(id: string, user: ApiUser) {
  
  const { updateDepartmentRecord } = await import("@/lib/services/hr");
  return updateDepartmentRecord(id, { is_active: true }, user);
}

export async function createPosition(
  input: {
    factory_id?: string;
    department_id?: string;
    title: string;
    grade?: string;
    description?: string;
    headcount_limit?: number;
  },
  user: ApiUser
) {
  
  const { insertPosition } = await import("@/lib/services/hr");
  return insertPosition(input, user);
}

export async function updatePosition(
  id: string,
  input: Record<string, unknown>,
  user: ApiUser
) {
  
  const { updatePositionRecord } = await import("@/lib/services/hr");
  return updatePositionRecord(id, input as Parameters<typeof updatePositionRecord>[1], user);
}

export async function deactivatePosition(id: string, user: ApiUser) {
  
  const { updatePositionRecord } = await import("@/lib/services/hr");
  return updatePositionRecord(id, { is_active: false }, user);
}

export async function reactivatePosition(id: string, user: ApiUser) {
  
  const { updatePositionRecord } = await import("@/lib/services/hr");
  return updatePositionRecord(id, { is_active: true }, user);
}

export async function createEmployee(
  input: Record<string, unknown>,
  user: ApiUser
) {
  
  const { insertEmployee } = await import("@/lib/services/hr");
  return insertEmployee(input as Parameters<typeof insertEmployee>[0], user);
}

export async function updateEmployee(
  id: string,
  input: Record<string, unknown>,
  user: ApiUser
) {
  
  const { updateEmployeeRecord } = await import("@/lib/services/hr");
  return updateEmployeeRecord(id, input as Parameters<typeof updateEmployeeRecord>[1], user);
}

export async function deactivateEmployee(id: string, user: ApiUser) {
  
  const { deactivateEmployeeRecord } = await import("@/lib/services/hr");
  await deactivateEmployeeRecord(id, user);
  return { deleted: true };
}

export async function reactivateEmployee(id: string, user: ApiUser) {
  
  const { updateEmployeeRecord } = await import("@/lib/services/hr");
  return updateEmployeeRecord(id, { is_active: true }, user);
}

export async function createLeaveRequest(
  input: {
    employee_id: string;
    leave_type: string;
    start_date: string;
    end_date: string;
    reason?: string;
  },
  user: ApiUser
) {
  
  const { insertLeaveRequest } = await import("@/lib/services/hr");
  return insertLeaveRequest(input, user);
}

export async function recordAttendance(
  input: { employee_id: string; action: "clock_in" | "clock_out" },
  user: ApiUser
) {
  
  const { recordAttendanceAction } = await import("@/lib/services/hr");
  return recordAttendanceAction(input, user);
}

export async function approveLeave(
  id: string,
  status: "approved" | "rejected",
  user: ApiUser,
  rejectionReason?: string
) {
  const { approveLeaveRequest } = await import("@/lib/services/hr");
  return approveLeaveRequest(id, status, user, rejectionReason);
}

export async function markAttendance(
  input: {
    employee_id: string;
    shift_date: string;
    status: "present" | "absent" | "late" | "leave" | "half_day";
    notes?: string;
  },
  user: ApiUser
) {
  const { markAttendanceStatus } = await import("@/lib/services/hr");
  return markAttendanceStatus(input, user);
}

export async function getAiData(role: string, scope: ViewScope) {
  void import("@/lib/services/notifications").then((m) => {
    void m.syncAiAlertsToNotifications(APP_CONFIG.orgId);
    void m.syncMissingDataNotifications(APP_CONFIG.orgId);
  });

  const factoryId =
    scope === "block" ? FACTORY_IDS.block : scope === "recycling" ? FACTORY_IDS.recycling : null;

  const supabase = await createClient();
  let briefingQuery = supabase.from("ai_briefings").select("*").eq("role", role);
  if (factoryId) briefingQuery = briefingQuery.or(`factory_id.is.null,factory_id.eq.${factoryId}`);
  const { data: briefing } = await briefingQuery
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let alertsQuery = supabase.from("ai_alerts").select("*").eq("is_resolved", false);
  if (factoryId) alertsQuery = alertsQuery.or(`factory_id.is.null,factory_id.eq.${factoryId}`);
  const { data: alerts } = await alertsQuery;

  return {
    briefing: briefing ?? {
      role,
      summary: "Connect production and finance data to generate role-specific briefings.",
      confidence_level: 0,
      highlights: [],
      generated_at: new Date().toISOString(),
    },
    alerts: alerts ?? [],
    missingData: [],
  };
}

export async function aiChat(role: string, message: string, user: ApiUser, scope?: ViewScope) {
  const { runGroundedChat } = await import("@/lib/ai/chat-orchestrator");
  return runGroundedChat({ role, message, user, scope });
}

export async function getNotifications(
  user: ApiUser,
  filters?: { type?: string; unreadOnly?: boolean }
) {
  const { listNotifications } = await import("@/lib/services/notifications");
  return listNotifications(user, filters);
}

export async function markNotificationsRead(user: ApiUser) {
  const { markAllNotificationsRead } = await import("@/lib/services/notifications");
  return markAllNotificationsRead(user);
}

export async function markNotificationRead(id: string, user: ApiUser) {
  const { markNotificationRead } = await import("@/lib/services/notifications");
  await markNotificationRead(id, user);
  return getNotifications(user);
}

export async function deleteNotification(id: string, user: ApiUser) {
  const { deleteNotificationRecord } = await import("@/lib/services/notifications");
  await deleteNotificationRecord(id, user);
}

export async function createNotificationRecord(
  input: {
    user_id: string;
    type: import("@/types").NotificationType;
    title: string;
    message: string;
    entity_type?: string | null;
    entity_id?: string | null;
  },
  actor: ApiUser
) {
  const { createNotification } = await import("@/lib/services/notifications");
  return createNotification({
    organizationId: actor.organization_id,
    userId: input.user_id,
    type: input.type,
    title: input.title,
    message: input.message,
    entityType: input.entity_type,
    entityId: input.entity_id,
    actorUserId: actor.id,
  });
}

export async function getAuditLogs(options?: {
  search?: string;
  action?: string;
  limit?: number;
  cursor?: string | null;
}) {
  const { queryAuditLogsPage } = await import("@/lib/services/audit");
  if (options?.cursor !== undefined || options?.limit !== undefined || options?.action) {
    return queryAuditLogsPage(options);
  }
  const { queryAuditLogs } = await import("@/lib/services/audit");
  return queryAuditLogs({ search: options?.search, limit: options?.limit ?? 500 });
}

export async function getDocuments(tag?: string) {
  

  const supabase = await createClient();
  let query = supabase.from("documents").select("*");
  if (tag && tag !== "all") query = query.eq("tag", tag);
  const { data } = await query.order("created_at", { ascending: false });
  return data ?? [];
}

export async function uploadDocument(
  input: {
    name: string;
    file_url: string;
    tag: string;
    entity_type?: string;
    entity_id?: string;
    is_restricted?: boolean;
  },
  user: ApiUser
) {
  

  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .insert({
      organization_id: user.organization_id,
      name: input.name,
      file_url: input.file_url,
      tag: input.tag,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      is_restricted: input.is_restricted ?? false,
      uploaded_by: user.id,
    })
    .select()
    .single();
  return data;
}

export async function getReportsData() {
  

  const supabase = await createClient();
  const { data: templates } = await supabase.from("report_templates").select("*");
  const { data: schedules } = await supabase.from("report_schedules").select("*");
  return {
    templates: (templates ?? []).map((row) => ({
      id: row.id as string,
      slug: (row.slug as string) ?? row.id,
      name: row.name as string,
      category: (row.module as string) ?? "General",
      module: (row.module as string) ?? "executive",
      description: (row.description as string) ?? "",
      defaultFormat: ((row.config as { defaultFormat?: string })?.defaultFormat ?? "PDF") as
        | "PDF"
        | "Excel",
      format: ((row.config as { defaultFormat?: string })?.defaultFormat ?? "PDF") as
        | "PDF"
        | "Excel",
    })),
    schedules: schedules ?? [],
  };
}

export async function processSageSyncPayload(payload: {
  accounts?: unknown[];
  transactions?: Array<{
    sage_id?: string;
    transaction_date?: string;
    description?: string;
    amount?: number;
    transaction_type?: string;
    factory_id?: string | null;
  }>;
  invoices?: unknown[];
  budgets?: unknown[];
}) {
  

  const service = await createServiceClient();
  const orgId = "11111111-1111-1111-1111-111111111111";

  const { data: log } = await service
    .from("sage_sync_logs")
    .insert({ organization_id: orgId, status: "running", records_processed: 0 })
    .select()
    .single();

  const transactions = payload.transactions as Array<Record<string, unknown>> | undefined;
  if (transactions?.length) {
    await service.from("sage_transactions").upsert(
      transactions.map((tx) => ({
        organization_id: orgId,
        sage_id: tx.sage_id,
        transaction_date: tx.transaction_date,
        description: tx.description,
        amount: tx.amount,
        transaction_type: tx.transaction_type,
        factory_id: tx.factory_id,
        synced_at: new Date().toISOString(),
      })),
      { onConflict: "organization_id,sage_id" }
    );
  }

  await service
    .from("sage_sync_logs")
    .update({
      status: "success",
      records_processed: transactions?.length ?? 0,
      completed_at: new Date().toISOString(),
    })
    .eq("id", log!.id);

  return log;
}

export async function processOfflineSubmission(
  type: string,
  payload: Record<string, unknown>,
  user: ApiUser
) {
  switch (type) {
    case "production_count":
      return createProductionCount(payload as Parameters<typeof createProductionCount>[0], user);
    case "stock_count":
      return createStockCount(payload as Parameters<typeof createStockCount>[0], user);
    case "inventory_movement":
      return createInventoryMovement(payload as Parameters<typeof createInventoryMovement>[0], user);
    case "delivery":
      return confirmDelivery(payload as Parameters<typeof confirmDelivery>[0], user);
    default:
      throw new Error(`Unknown submission type: ${type}`);
  }
}

export async function getAdminRoles() {
  const { getAdminRolesList } = await import("@/lib/services/admin-rbac");
  return getAdminRolesList();
}

export async function transferInventoryStock(
  input: { from_item_id: string; to_item_id: string; quantity: number; notes?: string },
  user: ApiUser
) {
  const supabase = await createClient();
  const [{ data: from }, { data: to }] = await Promise.all([
    supabase.from("inventory_items").select("*").eq("id", input.from_item_id).single(),
    supabase.from("inventory_items").select("*").eq("id", input.to_item_id).single(),
  ]);
  if (!from || !to) throw new Error("Source or destination item not found");
  if (Number(from.quantity) < input.quantity) throw new Error("Insufficient stock to transfer");

  await createInventoryMovement(
    {
      factory_id: from.factory_id as string,
      item_id: from.id as string,
      quantity: -input.quantity,
      movement_type: "transfer",
      notes: `Transfer out → ${to.sku}: ${input.notes ?? ""}`,
    },
    user
  );
  return createInventoryMovement(
    {
      factory_id: to.factory_id as string,
      item_id: to.id as string,
      quantity: input.quantity,
      movement_type: "transfer",
      notes: `Transfer in ← ${from.sku}: ${input.notes ?? ""}`,
    },
    user
  );
}

export async function reserveInventoryStock(
  input: { item_id: string; quantity: number; action: "reserve" | "release" },
  user: ApiUser
) {
  const supabase = await createClient();
  const { data: item, error: fetchError } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("id", input.item_id)
    .single();
  if (fetchError || !item) throw new Error("Item not found");

  const currentReserved = Number(item.reserved_quantity ?? 0);
  const available = Number(item.quantity) - currentReserved;
  let nextReserved = currentReserved;
  if (input.action === "reserve") {
    if (available < input.quantity) throw new Error("Insufficient available stock to reserve");
    nextReserved += input.quantity;
  } else {
    nextReserved = Math.max(0, currentReserved - input.quantity);
  }

  const { data, error } = await supabase
    .from("inventory_items")
    .update({ reserved_quantity: nextReserved })
    .eq("id", input.item_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function bulkStockCounts(
  counts: { item_id: string; counted_quantity: number; notes?: string }[],
  user: ApiUser
) {
  const supabase = await createClient();
  const results = [];
  for (const count of counts) {
    const { data: item } = await supabase
      .from("inventory_items")
      .select("factory_id")
      .eq("id", count.item_id)
      .single();
    if (!item) throw new Error(`Item ${count.item_id} not found`);
    results.push(
      await createStockCount(
        {
          factory_id: item.factory_id as string,
          item_id: count.item_id,
          counted_quantity: count.counted_quantity,
          notes: count.notes,
        },
        user
      )
    );
  }
  return results;
}

export async function toggleReportSchedule(id: string, active: boolean, user: ApiUser) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_schedules")
    .update({ active })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { logAuditFromUser } = await import("@/lib/services/audit");
  await logAuditFromUser(user, "report_schedules", id, "UPDATE", null, { active }).catch(() => undefined);
  return data;
}

export async function resolveAiAlert(id: string, user: ApiUser) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_alerts")
    .update({ is_resolved: true })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const { logAuditFromUser } = await import("@/lib/services/audit");
  await logAuditFromUser(user, "ai_alerts", id, "UPDATE", null, { is_resolved: true }).catch(() => undefined);
  return data;
}

export async function updateDocumentRecord(
  id: string,
  input: Partial<{
    name: string;
    tag: string;
    file_url: string;
    entity_type: string;
    entity_id: string;
    is_restricted: boolean;
  }>,
  user: ApiUser
) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .update(input)
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteDocumentRecord(id: string, user: ApiUser) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);
  if (error) throw new Error(error.message);
  return true;
}
