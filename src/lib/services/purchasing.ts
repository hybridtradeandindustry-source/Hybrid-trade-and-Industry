import { createClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { generateItemSku, generatePurchaseNumber } from "@/lib/utils";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { purchaseQuantityToStockUnits } from "@/lib/purchasing/cement-quantity";
import { derivePurchasePaymentStatus } from "@/lib/purchasing/credit-utils";
import {
  adjustSupplierBalance,
  fetchSupplierPayments,
  recordSupplierPayment,
  resolveReceivePayment,
} from "@/lib/services/supplier-credit-sync";
import {
  FACTORY_IDS,
  type MaterialPurchase,
  type MaterialPurchaseType,
  type Supplier,
  type SupplierPayment,
  type SupplierType,
  type ViewScope,
} from "@/types";

export type PurchasingData = {
  suppliers: Supplier[];
  purchases: MaterialPurchase[];
  payments: SupplierPayment[];
  totalCreditOwed: number;
};

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function materialSku(type: MaterialPurchaseType): string | null {
  if (type === "cement") return BLOCK_FACTORY_SKUS.cement;
  if (type === "poliche") return BLOCK_FACTORY_SKUS.poliche;
  if (type === "ashwa") return BLOCK_FACTORY_SKUS.ashwa;
  return null;
}

/** Net inventory units this purchase has posted against an item (receipts + edit adjustments). */
async function netStockPostedForPurchase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  purchaseId: string,
  itemId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("quantity")
    .eq("reference_type", "material_purchases")
    .eq("reference_id", purchaseId)
    .eq("item_id", itemId);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
}

export async function fetchPurchasingData(
  orgId: string,
  scope: ViewScope = "block"
): Promise<PurchasingData> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  let purchasesQuery = supabase
    .from("material_purchases")
    .select("*, item:inventory_items(*)")
    .eq("organization_id", orgId)
    .order("purchase_date", { ascending: false });
  if (factoryId) purchasesQuery = purchasesQuery.eq("factory_id", factoryId);

  const [{ data: suppliers }, { data: purchases }, payments] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("organization_id", orgId)
      .order("name"),
    purchasesQuery,
    fetchSupplierPayments(orgId),
  ]);

  const supplierList = (suppliers ?? []) as Supplier[];
  const totalCreditOwed = supplierList.reduce((sum, s) => sum + Number(s.balance ?? 0), 0);

  return {
    suppliers: supplierList,
    purchases: (purchases ?? []) as MaterialPurchase[],
    payments,
    totalCreditOwed,
  };
}

export async function insertSupplier(
  input: {
    name: string;
    contact_phone?: string;
    contact_email?: string;
    address?: string;
    supplier_type?: SupplierType;
  },
  user: ApiUser
): Promise<Supplier> {
  const name = input.name.trim();
  if (!name) throw new Error("Supplier name is required");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: user.organization_id,
      name,
      contact_phone: input.contact_phone?.trim() || null,
      contact_email: input.contact_email?.trim() || null,
      address: input.address?.trim() || null,
      supplier_type: input.supplier_type ?? "credit",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Supplier;
}

export async function fetchSuppliers(orgId: string): Promise<Supplier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", orgId)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as Supplier[];
}

export async function updateSupplierRecord(
  id: string,
  input: {
    name?: string;
    contact_phone?: string;
    contact_email?: string;
    address?: string;
    supplier_type?: SupplierType;
    is_active?: boolean;
  },
  user: ApiUser
): Promise<Supplier> {
  const supabase = await createClient();

  const update: Record<string, unknown> = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Supplier name is required");
    update.name = name;
  }
  if (input.contact_phone !== undefined) update.contact_phone = input.contact_phone.trim() || null;
  if (input.contact_email !== undefined) update.contact_email = input.contact_email.trim() || null;
  if (input.address !== undefined) update.address = input.address.trim() || null;
  if (input.supplier_type !== undefined) update.supplier_type = input.supplier_type;
  if (input.is_active !== undefined) update.is_active = input.is_active;

  const { data, error } = await supabase
    .from("suppliers")
    .update(update)
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Supplier;
}

export async function insertMaterialPurchase(
  input: {
    factory_id?: string;
    supplier_id?: string;
    supplier_name: string;
    material_type: MaterialPurchaseType;
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
    /** Name for a brand-new catalog item, used when material_type is "other" and no existing item_id is selected. */
    new_item_name?: string;
  },
  user: ApiUser
): Promise<MaterialPurchase> {
  if (input.quantity <= 0) throw new Error("Quantity must be greater than zero");
  if (input.unit_price < 0) throw new Error("Unit price cannot be negative");

  const factoryId = input.factory_id ?? FACTORY_IDS.block;

  const supabase = await createClient();
  let itemId = input.item_id ?? null;

  if (!itemId) {
    const sku = materialSku(input.material_type);
    if (sku) {
      const { data: item } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("factory_id", factoryId)
        .eq("sku", sku)
        .eq("is_active", true)
        .maybeSingle();
      itemId = item?.id ?? null;
    }
  }

  if (!itemId && input.new_item_name?.trim()) {
    const name = input.new_item_name.trim();
    const { data: newItem, error: newItemError } = await supabase
      .from("inventory_items")
      .insert({
        organization_id: user.organization_id,
        factory_id: factoryId,
        name,
        sku: generateItemSku(name),
        category: "raw_material",
        unit: input.unit,
        quantity: 0,
        reserved_quantity: 0,
        low_stock_threshold: 0,
        reorder_quantity: 0,
        unit_cost: input.unit_price,
        is_active: true,
      })
      .select("id")
      .single();

    if (newItemError) throw new Error(newItemError.message);
    itemId = newItem.id;
  }

  if (!itemId) throw new Error("Select an inventory item for this purchase");

  const totalCost = input.quantity * input.unit_price;

  const { data, error } = await supabase
    .from("material_purchases")
    .insert({
      organization_id: user.organization_id,
      factory_id: factoryId,
      purchase_number: generatePurchaseNumber(),
      supplier_id: input.supplier_id ?? null,
      supplier_name: input.supplier_name.trim(),
      material_type: input.material_type,
      item_id: itemId,
      quantity: input.quantity,
      unit: input.unit,
      unit_price: input.unit_price,
      total_cost: totalCost,
      vehicle_plate: input.vehicle_plate?.trim() || null,
      delivery_notes: input.delivery_notes?.trim() || null,
      purchase_date: input.purchase_date ?? new Date().toISOString().slice(0, 10),
      payment_method: "credit",
      payment_status: "unpaid",
      amount_paid: 0,
      status: "ordered",
      created_by: user.id,
    })
    .select("*, item:inventory_items(*)")
    .single();

  if (error) throw new Error(error.message);
  const purchase = data as MaterialPurchase;

  if (input.receive_now) {
    return receiveMaterialPurchase(purchase.id, user, {
      amount_paid: input.amount_paid,
      pay_method: input.pay_method,
      bank_account_id: input.bank_account_id,
    });
  }

  return purchase;
}

/** Recycling raw-material purchases go through gross-weight receive -> sort -> net-weight finalize. */
function requiresSortingWorkflow(purchase: { factory_id: string; item?: { category?: string | null } | null }): boolean {
  return purchase.factory_id === FACTORY_IDS.recycling && purchase.item?.category === "raw_material";
}

export async function receiveMaterialPurchase(
  purchaseId: string,
  user: ApiUser,
  input?: {
    amount_paid?: number;
    pay_method?: "cash" | "bank";
    bank_account_id?: string;
  }
): Promise<MaterialPurchase> {
  const supabase = await createClient();

  const { data: purchase, error: fetchError } = await supabase
    .from("material_purchases")
    .select("*, item:inventory_items(*)")
    .eq("id", purchaseId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.status === "received") throw new Error("Purchase already received");
  if (purchase.status === "cancelled") throw new Error("Cannot receive a cancelled purchase");

  // Quantity entered on the purchase order IS the gross/initial received weight —
  // no separate input needed. The net recyclable weight is captured later via finalizeMaterialPurchaseSorting.
  const needsSorting = requiresSortingWorkflow(purchase);
  const initialReceivedWeight = needsSorting ? Number(purchase.quantity) : null;

  const totalCost = Number(purchase.total_cost);
  const payment = resolveReceivePayment(totalCost, {
    amount_paid: input?.amount_paid,
    pay_method: input?.pay_method,
  });

  const { assertBankAccountRequired, resolveBankAccount } = await import("@/lib/services/banks");
  let resolvedBank: { bank_account_id: string; bank_id: string } | null = null;
  if (payment.amountPaid > 0) {
    assertBankAccountRequired(payment.payMethod ?? "cash", input?.bank_account_id, "Select the bank account used for this payment");
    if (payment.payMethod === "bank" && input?.bank_account_id) {
      resolvedBank = await resolveBankAccount(input.bank_account_id, user.organization_id);
    }
  }

  // Raw material isn't usable inventory until sorting removes unrecyclable/contaminated
  // content — so the receipt movement (and stock increase) is deferred to finalizeSorting.
  if (!needsSorting) {
    const { getProductionSettings } = await import("@/lib/services/production-settings");
    const cementKgPerBag = Number((await getProductionSettings(user.organization_id)).cement_kg_per_bag);
    const stockQuantity = purchaseQuantityToStockUnits(
      Number(purchase.quantity),
      purchase.unit,
      purchase.material_type,
      purchase.item?.sku,
      cementKgPerBag
    );

    const { error: movementError } = await supabase.from("inventory_movements").insert({
      organization_id: user.organization_id,
      factory_id: purchase.factory_id,
      item_id: purchase.item_id,
      movement_type: "receipt",
      quantity: stockQuantity,
      reference_type: "material_purchases",
      reference_id: purchase.id,
      reason: "purchase_receipt",
      source_module: "purchasing",
      notes: `Purchase ${purchase.purchase_number} received from ${purchase.supplier_name}`,
      created_by: user.id,
    });

    if (movementError) throw new Error(movementError.message);

    if (purchase.item_id) {
      const currentQty = Number(purchase.item?.quantity ?? 0);
      const currentUnitCost = Number(purchase.item?.unit_cost ?? 0);
      const newQty = currentQty + stockQuantity;
      const newUnitCost =
        newQty > 0
          ? (currentQty * currentUnitCost + totalCost) / newQty
          : stockQuantity > 0
            ? totalCost / stockQuantity
            : Number(purchase.unit_price);

      await supabase
        .from("inventory_items")
        .update({ unit_cost: newUnitCost, updated_at: new Date().toISOString() })
        .eq("id", purchase.item_id);

      const { BLOCK_FACTORY_SKUS } = await import("@/lib/block-factory/inventory-sync");
      if (
        purchase.item?.sku === BLOCK_FACTORY_SKUS.cement ||
        purchase.item?.sku === BLOCK_FACTORY_SKUS.poliche
      ) {
        const { recalculateDailyLogWasteCosts } = await import(
          "@/lib/services/production-daily-log"
        );
        await recalculateDailyLogWasteCosts(user.organization_id);
      }
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("material_purchases")
    .update({
      status: "received",
      received_at: new Date().toISOString(),
      received_by: user.id,
      payment_method: payment.paymentMethod,
      amount_paid: payment.amountPaid,
      payment_status: payment.paymentStatus,
      bank_id: resolvedBank?.bank_id ?? null,
      bank_account_id: resolvedBank?.bank_account_id ?? null,
      ...(needsSorting
        ? { initial_received_weight: initialReceivedWeight, sorting_status: "pending_sorting" }
        : {}),
    })
    .eq("id", purchaseId)
    .select("*, item:inventory_items(*)")
    .single();

  if (updateError) throw new Error(updateError.message);

  if (purchase.supplier_id) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("total_purchases, balance")
      .eq("id", purchase.supplier_id)
      .maybeSingle();

    if (supplier) {
      await supabase
        .from("suppliers")
        .update({
          total_purchases: Number(supplier.total_purchases ?? 0) + totalCost,
        })
        .eq("id", purchase.supplier_id);
    }

    if (payment.amountPaid > 0 && payment.payMethod) {
      await recordSupplierPayment(
        {
          supplier_id: purchase.supplier_id,
          purchase_id: purchase.id,
          amount: payment.amountPaid,
          payment_method: payment.payMethod,
          bank_account_id: input?.bank_account_id,
          reference: purchase.purchase_number,
          notes: `Payment on receive — ${purchase.purchase_number}`,
          affects_balance: false,
        },
        user
      );
    }

    if (payment.creditAmount > 0) {
      await adjustSupplierBalance(supabase, purchase.supplier_id, payment.creditAmount);
    }
  }

  return updated as MaterialPurchase;
}

/**
 * Stage 2 of the plastic purchase workflow: records the net recyclable weight
 * after sorting removes unrecyclable/contaminated material, and posts the
 * inventory movement that makes that weight available raw material.
 *
 * Safe to call again on an already-sorted purchase to correct the net weight —
 * it posts an offsetting inventory adjustment for the delta rather than
 * double-counting, so inventory stays accurate. sorting_status/sorted_at reflect
 * the latest finalize; the full before/after history is preserved by the
 * standard audit_logs trigger on material_purchases.
 */
export async function finalizeMaterialPurchaseSorting(
  purchaseId: string,
  netRecyclableWeight: number,
  user: ApiUser
): Promise<MaterialPurchase> {
  if (!(netRecyclableWeight >= 0)) {
    throw new Error("Net recyclable weight cannot be negative");
  }

  const supabase = await createClient();

  const { data: purchase, error: fetchError } = await supabase
    .from("material_purchases")
    .select("*, item:inventory_items(*)")
    .eq("id", purchaseId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.sorting_status === "not_applicable") {
    throw new Error("This purchase does not require sorting");
  }
  if (purchase.status !== "received") {
    throw new Error("Receive this purchase before finalizing sorting");
  }

  const initialWeight = Number(purchase.initial_received_weight);
  if (netRecyclableWeight > initialWeight) {
    throw new Error("Net recyclable weight cannot exceed the initial received weight");
  }

  const isFirstFinalize = purchase.sorting_status === "pending_sorting";
  const previousNet = Number(purchase.net_recyclable_weight ?? 0);
  const delta = isFirstFinalize ? netRecyclableWeight : netRecyclableWeight - previousNet;

  if (delta !== 0) {
    const { error: movementError } = await supabase.from("inventory_movements").insert({
      organization_id: user.organization_id,
      factory_id: purchase.factory_id,
      item_id: purchase.item_id,
      movement_type: isFirstFinalize ? "receipt" : "adjustment",
      quantity: delta,
      reference_type: "material_purchases",
      reference_id: purchase.id,
      reason: isFirstFinalize ? "purchase_sorting_finalized" : "purchase_sorting_correction",
      source_module: "purchasing",
      notes: isFirstFinalize
        ? `Sorting finalized for ${purchase.purchase_number} — net recyclable weight added to stock`
        : `Sorting correction for ${purchase.purchase_number} — net recyclable weight adjusted`,
      created_by: user.id,
    });

    if (movementError) throw new Error(movementError.message);
  }

  const { data: updated, error: updateError } = await supabase
    .from("material_purchases")
    .update({
      net_recyclable_weight: netRecyclableWeight,
      sorting_status: "sorted",
      sorted_at: new Date().toISOString(),
      sorted_by: user.id,
    })
    .eq("id", purchaseId)
    .select("*, item:inventory_items(*)")
    .single();

  if (updateError) throw new Error(updateError.message);
  return updated as MaterialPurchase;
}

/** Lets users correct the stage-1 gross weight before sorting is finalized (no inventory impact yet). */
export async function updatePurchaseInitialWeight(
  purchaseId: string,
  initialReceivedWeight: number,
  user: ApiUser
): Promise<MaterialPurchase> {
  if (!(initialReceivedWeight > 0)) {
    throw new Error("Initial received weight must be greater than zero");
  }

  const supabase = await createClient();

  const { data: purchase, error: fetchError } = await supabase
    .from("material_purchases")
    .select("*")
    .eq("id", purchaseId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.sorting_status !== "pending_sorting") {
    throw new Error("Initial received weight can only be edited before sorting is finalized");
  }

  const { data: updated, error: updateError } = await supabase
    .from("material_purchases")
    .update({ initial_received_weight: initialReceivedWeight })
    .eq("id", purchaseId)
    .select("*, item:inventory_items(*)")
    .single();

  if (updateError) throw new Error(updateError.message);
  return updated as MaterialPurchase;
}

/**
 * Corrects a purchase after it was entered. An unreceived PO is a plain row update —
 * nothing has been posted yet. Once received, quantity and price have already moved
 * stock and supplier credit, so an edit posts the *difference* instead of rewriting
 * history: an inventory adjustment for the quantity delta, a balance adjustment for the
 * cost delta. Re-pointing the purchase at a different item or supplier isn't a delta at
 * all — the postings went somewhere wrong — so those reverse off the old item/supplier in
 * full and re-post against the new one.
 *
 * Two things still can't be edited, because the stock they moved didn't come from this
 * row: quantity once sorting is finalized (stage-2 net weight owns it, via Adjust), and
 * the item on any purchase that goes through sorting at all.
 *
 * Everything receiving touched is restated in step: stock quantity, the item's
 * moving-average unit_cost (and the cement/poliche daily-log waste costs priced off it),
 * the supplier's total_purchases and outstanding balance, and the purchase's own payment
 * method/status. Nothing else in the app stores a purchase figure — finance, reports and
 * the dashboards all read purchases and supplier payments live, so they follow on their
 * own once these rows are right.
 */
export async function updateMaterialPurchase(
  purchaseId: string,
  input: {
    supplier_id?: string | null;
    supplier_name?: string;
    material_type?: MaterialPurchaseType;
    item_id?: string;
    quantity?: number;
    unit?: string;
    unit_price?: number;
    purchase_date?: string;
    vehicle_plate?: string;
    delivery_notes?: string;
  },
  user: ApiUser
): Promise<MaterialPurchase> {
  const supabase = await createClient();

  const { data: purchase, error: fetchError } = await supabase
    .from("material_purchases")
    .select("*, item:inventory_items(*)")
    .eq("id", purchaseId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.status === "cancelled") throw new Error("Cannot edit a cancelled purchase");

  const isReceived = purchase.status === "received";
  const quantity = input.quantity ?? Number(purchase.quantity);
  const unitPrice = input.unit_price ?? Number(purchase.unit_price);

  if (!(quantity > 0)) throw new Error("Quantity must be greater than zero");
  if (unitPrice < 0) throw new Error("Unit price cannot be negative");

  const nextItemId = input.item_id ?? purchase.item_id;
  const nextSupplierId =
    input.supplier_id === undefined ? purchase.supplier_id : input.supplier_id || null;

  const itemChanged = nextItemId !== purchase.item_id;
  const supplierChanged = nextSupplierId !== purchase.supplier_id;
  const usesSortingWorkflow = requiresSortingWorkflow(purchase);

  if (isReceived) {
    if (purchase.sorting_status === "sorted" && quantity !== Number(purchase.quantity)) {
      throw new Error(
        "Quantity is locked once sorting is finalized — correct the sorted weight with Adjust instead"
      );
    }
    // A sorting purchase's stock comes from the stage-2 net weight, not from this row, so
    // moving it to another item can't be expressed as a receipt reversal.
    if (itemChanged && usesSortingWorkflow) {
      throw new Error(
        "The item can't be changed on a purchase that goes through sorting — cancel this purchase and enter a new one instead"
      );
    }
  }

  const previousTotal = Number(purchase.total_cost);
  const totalCost = quantity * unitPrice;
  const amountPaid = Number(purchase.amount_paid ?? 0);

  if (isReceived && totalCost < amountPaid) {
    throw new Error(
      `New total (${totalCost}) is below the ${amountPaid} already paid on this purchase — record a supplier refund before reducing it`
    );
  }

  const valueDelta = totalCost - previousTotal;
  const purchaseUnit = input.unit ?? purchase.unit;
  const nextMaterialType = input.material_type ?? purchase.material_type;
  // Recycling raw material defers its receipt to finalizeMaterialPurchaseSorting, so a
  // received-but-unsorted purchase has posted no stock yet — same rule cancel uses.
  const stockWasPosted = isReceived && !usesSortingWorkflow;

  const isMaterialCostSku = (sku?: string | null) =>
    sku === BLOCK_FACTORY_SKUS.cement || sku === BLOCK_FACTORY_SKUS.poliche;

  /** Re-derives an item's moving average after its stock value moves by `valueChange`. */
  const restateItemCost = async (
    itemId: string,
    quantityBefore: number,
    unitCostBefore: number,
    quantityChange: number,
    valueChange: number
  ) => {
    const nextQuantity = quantityBefore + quantityChange;
    const nextValue = Math.max(0, quantityBefore * unitCostBefore + valueChange);
    // Nothing left on hand means no average to hold — keep the last one so the next
    // receipt averages against a real number instead of zero.
    const nextUnitCost = nextQuantity > 0 ? nextValue / nextQuantity : unitCostBefore;

    await supabase
      .from("inventory_items")
      .update({ unit_cost: nextUnitCost, updated_at: new Date().toISOString() })
      .eq("id", itemId);
  };

  let recalculateMaterialCosts = false;

  if (stockWasPosted && purchase.item_id) {
    const { getProductionSettings } = await import("@/lib/services/production-settings");
    const cementKgPerBag = Number((await getProductionSettings(user.organization_id)).cement_kg_per_bag);
    const previousStockQty = await netStockPostedForPurchase(supabase, purchaseId, purchase.item_id);
    const nextStockQty = purchaseQuantityToStockUnits(
      quantity,
      purchaseUnit,
      nextMaterialType,
      purchase.item?.sku,
      cementKgPerBag
    );
    const stockQuantityDelta = nextStockQty - previousStockQty;
    const stockUnit = purchase.item?.unit ?? purchase.unit;

    // Read before any write: the movements below move item.quantity via trigger.
    const quantityOnHand = Number(purchase.item?.quantity ?? 0);
    const unitCostBefore = Number(purchase.item?.unit_cost ?? 0);

    if (itemChanged) {
      const { data: nextItem } = await supabase
        .from("inventory_items")
        .select("id, name, sku, category, factory_id, is_active, quantity, unit_cost, unit")
        .eq("id", nextItemId as string)
        .eq("organization_id", user.organization_id)
        .maybeSingle();

      if (!nextItem) throw new Error("Selected inventory item not found");
      if (!nextItem.is_active) {
        throw new Error(`${nextItem.name} is deactivated — reactivate it in Inventory first`);
      }
      if (nextItem.factory_id !== purchase.factory_id) {
        throw new Error("Pick an item from the same factory as this purchase");
      }
      // This purchase's stock was posted straight through on receive. An item that would
      // route it via gross/net sorting instead can't inherit that — the two workflows post
      // stock at different stages.
      if (requiresSortingWorkflow({ factory_id: purchase.factory_id, item: nextItem })) {
        throw new Error(
          `${nextItem.name} is sorted raw material — this purchase already posted its stock directly, so cancel it and enter a new one against that item`
        );
      }

      const repostStockQty = purchaseQuantityToStockUnits(
        quantity,
        purchaseUnit,
        nextMaterialType,
        nextItem.sku,
        cementKgPerBag
      );

      if (quantityOnHand < previousStockQty) {
        throw new Error(
          `Only ${quantityOnHand} ${stockUnit} of ${purchase.item?.name ?? "the original item"} left in stock — moving this purchase to another item would take it negative`
        );
      }

      // The receipt landed on the wrong item: take the whole of it back off that one and
      // post it onto the right one, so neither item's stock or average carries a purchase
      // it never received.
      const { error: reverseError } = await supabase.from("inventory_movements").insert({
        organization_id: user.organization_id,
        factory_id: purchase.factory_id,
        item_id: purchase.item_id,
        movement_type: "adjustment",
        quantity: -previousStockQty,
        reference_type: "material_purchases",
        reference_id: purchase.id,
        reason: "purchase_item_moved",
        source_module: "purchasing",
        notes: `Purchase ${purchase.purchase_number} re-pointed to ${nextItem.name} — receipt reversed`,
        created_by: user.id,
      });
      if (reverseError) throw new Error(reverseError.message);

      await restateItemCost(
        purchase.item_id,
        quantityOnHand,
        unitCostBefore,
        -previousStockQty,
        -previousTotal
      );

      const { error: repostError } = await supabase.from("inventory_movements").insert({
        organization_id: user.organization_id,
        factory_id: purchase.factory_id,
        item_id: nextItem.id,
        movement_type: "receipt",
        quantity: repostStockQty,
        reference_type: "material_purchases",
        reference_id: purchase.id,
        reason: "purchase_item_moved",
        source_module: "purchasing",
        notes: `Purchase ${purchase.purchase_number} re-pointed from ${purchase.item?.name ?? "another item"} — receipt posted`,
        created_by: user.id,
      });
      if (repostError) throw new Error(repostError.message);

      await restateItemCost(
        nextItem.id,
        Number(nextItem.quantity ?? 0),
        Number(nextItem.unit_cost ?? 0),
        repostStockQty,
        totalCost
      );

      recalculateMaterialCosts =
        isMaterialCostSku(purchase.item?.sku) || isMaterialCostSku(nextItem.sku);
    } else {
      if (stockQuantityDelta < 0 && quantityOnHand < -stockQuantityDelta) {
        throw new Error(
          `Only ${quantityOnHand} ${stockUnit} of ${purchase.item?.name ?? "this item"} left in stock — cutting this purchase by ${-stockQuantityDelta} would take inventory negative`
        );
      }

      if (stockQuantityDelta !== 0) {
        const { error: movementError } = await supabase.from("inventory_movements").insert({
          organization_id: user.organization_id,
          factory_id: purchase.factory_id,
          item_id: purchase.item_id,
          movement_type: "adjustment",
          quantity: stockQuantityDelta,
          reference_type: "material_purchases",
          reference_id: purchase.id,
          reason: "purchase_edited",
          source_module: "purchasing",
          notes: `Purchase ${purchase.purchase_number} edited — quantity ${purchase.quantity} → ${quantity}`,
          created_by: user.id,
        });

        if (movementError) throw new Error(movementError.message);
      }

      // Receiving folded this purchase into the item's moving-average cost, so an edit has
      // to restate that contribution or every downstream cost — inventory valuation,
      // production COGS, the block dashboard — keeps quoting the superseded price. Correct
      // the stock *value* by the delta and re-derive the average from it, rather than
      // replaying the original weighted-average formula against figures that other
      // receipts and consumption have moved since.
      if (valueDelta !== 0 || stockQuantityDelta !== 0) {
        await restateItemCost(
          purchase.item_id,
          quantityOnHand,
          unitCostBefore,
          stockQuantityDelta,
          valueDelta
        );
        recalculateMaterialCosts = isMaterialCostSku(purchase.item?.sku);
      }
    }
  }

  // Cement and poliche unit costs are what daily-log waste is priced from.
  if (recalculateMaterialCosts) {
    const { recalculateDailyLogWasteCosts } = await import("@/lib/services/production-daily-log");
    await recalculateDailyLogWasteCosts(user.organization_id);
  }

  const update: Record<string, unknown> = {
    quantity,
    unit_price: unitPrice,
    total_cost: totalCost,
  };
  if (input.unit !== undefined) update.unit = input.unit;
  if (input.purchase_date !== undefined) update.purchase_date = input.purchase_date;
  if (input.vehicle_plate !== undefined) update.vehicle_plate = input.vehicle_plate.trim() || null;
  if (input.delivery_notes !== undefined) {
    update.delivery_notes = input.delivery_notes.trim() || null;
  }
  if (input.material_type !== undefined) update.material_type = input.material_type;
  if (input.item_id !== undefined) update.item_id = input.item_id;
  if (input.supplier_id !== undefined) update.supplier_id = nextSupplierId;
  if (input.supplier_name !== undefined) {
    const name = input.supplier_name.trim();
    if (!name) throw new Error("Supplier name is required");
    update.supplier_name = name;
  }
  if (isReceived) {
    update.payment_status = derivePurchasePaymentStatus(totalCost, amountPaid);
    // Receiving stamps payment_method "credit" unless the purchase was settled in full, so
    // a total that moves across what was paid has to restamp it — otherwise a raised total
    // still reads as fully paid in cash. The real tender is on the deposit payment row.
    if (amountPaid > 0 && amountPaid >= totalCost) {
      if (purchase.payment_method && purchase.payment_method !== "credit") {
        update.payment_method = purchase.payment_method;
      } else {
        const { data: deposit } = await supabase
          .from("supplier_payments")
          .select("payment_method")
          .eq("purchase_id", purchase.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        update.payment_method = deposit?.payment_method ?? "cash";
      }
    } else {
      update.payment_method = "credit";
    }
    // On a pending-sorting purchase the quantity IS the stage-1 gross weight, so the two
    // must move together or Finalize Sorting would validate against a stale ceiling.
    if (purchase.sorting_status === "pending_sorting") {
      update.initial_received_weight = quantity;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("material_purchases")
    .update(update)
    .eq("id", purchaseId)
    .select("*, item:inventory_items(*)")
    .single();

  if (updateError) throw new Error(updateError.message);

  if (isReceived) {
    const addToTotalPurchases = async (supplierId: string, delta: number) => {
      if (!delta) return;
      const { data: supplier } = await supabase
        .from("suppliers")
        .select("total_purchases")
        .eq("id", supplierId)
        .maybeSingle();
      if (!supplier) return;

      await supabase
        .from("suppliers")
        .update({
          total_purchases: Math.max(0, Number(supplier.total_purchases ?? 0) + delta),
        })
        .eq("id", supplierId);
    };

    // Only the unpaid slice sits on a supplier's balance, and amount_paid doesn't change
    // during an edit — so credit moves by the change in what's still outstanding.
    const previousCredit = Math.max(0, previousTotal - amountPaid);
    const nextCredit = Math.max(0, totalCost - amountPaid);

    if (supplierChanged) {
      // The credit was booked against the wrong supplier: lift the whole purchase off that
      // one and land it on the new one, rather than netting a delta across two ledgers.
      if (purchase.supplier_id) {
        await addToTotalPurchases(purchase.supplier_id, -previousTotal);
        await adjustSupplierBalance(supabase, purchase.supplier_id, -previousCredit);
      }
      if (nextSupplierId) {
        await addToTotalPurchases(nextSupplierId, totalCost);
        await adjustSupplierBalance(supabase, nextSupplierId, nextCredit);
        // Any deposit taken at receive belongs to the new supplier's statement now.
        await supabase
          .from("supplier_payments")
          .update({ supplier_id: nextSupplierId })
          .eq("purchase_id", purchase.id);
      }
    } else if (purchase.supplier_id && totalCost !== previousTotal) {
      await addToTotalPurchases(purchase.supplier_id, totalCost - previousTotal);
      await adjustSupplierBalance(supabase, purchase.supplier_id, nextCredit - previousCredit);
    }
  }

  return updated as MaterialPurchase;
}

/**
 * Cancels a purchase and reverses every side effect receiving it had posted: the inventory
 * receipt movement (and cement/poliche production cost recalculation), the supplier's
 * total_purchases and outstanding credit balance. Money already paid in cash/bank isn't
 * auto-refunded — that's a real-world refund the business settles outside the system —
 * so only the still-outstanding credit portion is reversed.
 */
export async function cancelMaterialPurchase(
  purchaseId: string,
  user: ApiUser,
  reason?: string
): Promise<MaterialPurchase> {
  const supabase = await createClient();

  const { data: purchase, error: fetchError } = await supabase
    .from("material_purchases")
    .select("*, item:inventory_items(*)")
    .eq("id", purchaseId)
    .eq("organization_id", user.organization_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!purchase) throw new Error("Purchase not found");
  if (purchase.status === "cancelled") throw new Error("Purchase is already cancelled");
  if (purchase.sorting_status === "sorted") {
    throw new Error(
      "Cannot cancel a purchase after sorting has been finalized — the material is already in stock. Adjust inventory manually instead."
    );
  }

  const wasReceived = purchase.status === "received";
  // Recycling raw-material purchases defer the stock receipt to finalizeMaterialPurchaseSorting,
  // so a received-but-not-yet-sorted purchase here never posted an inventory_movements receipt.
  const stockWasPosted = wasReceived && !requiresSortingWorkflow(purchase);

  if (stockWasPosted && purchase.item_id) {
    const stockQuantity = await netStockPostedForPurchase(
      supabase,
      purchase.id,
      purchase.item_id
    );

    const { error: movementError } = await supabase.from("inventory_movements").insert({
      organization_id: user.organization_id,
      factory_id: purchase.factory_id,
      item_id: purchase.item_id,
      movement_type: "adjustment",
      quantity: -stockQuantity,
      reference_type: "material_purchases",
      reference_id: purchase.id,
      reason: "purchase_cancelled",
      source_module: "purchasing",
      notes: `Purchase ${purchase.purchase_number} cancelled — receipt reversed`,
      created_by: user.id,
    });

    if (movementError) throw new Error(movementError.message);

    if (
      purchase.item?.sku === BLOCK_FACTORY_SKUS.cement ||
      purchase.item?.sku === BLOCK_FACTORY_SKUS.poliche
    ) {
      const { recalculateDailyLogWasteCosts } = await import(
        "@/lib/services/production-daily-log"
      );
      await recalculateDailyLogWasteCosts(user.organization_id);
    }
  }

  if (wasReceived && purchase.supplier_id) {
    const { data: supplier } = await supabase
      .from("suppliers")
      .select("total_purchases")
      .eq("id", purchase.supplier_id)
      .maybeSingle();

    if (supplier) {
      await supabase
        .from("suppliers")
        .update({
          total_purchases: Math.max(
            0,
            Number(supplier.total_purchases ?? 0) - Number(purchase.total_cost)
          ),
        })
        .eq("id", purchase.supplier_id);
    }

    const outstandingCredit = Number(purchase.total_cost) - Number(purchase.amount_paid ?? 0);
    if (outstandingCredit > 0) {
      await adjustSupplierBalance(supabase, purchase.supplier_id, -outstandingCredit);
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("material_purchases")
    .update({
      status: "cancelled",
      cancellation_reason: reason?.trim() || null,
    })
    .eq("id", purchaseId)
    .select("*, item:inventory_items(*)")
    .single();

  if (updateError) throw new Error(updateError.message);
  return updated as MaterialPurchase;
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
): Promise<SupplierPayment> {
  return recordSupplierPayment({ ...input, affects_balance: true }, user);
}
