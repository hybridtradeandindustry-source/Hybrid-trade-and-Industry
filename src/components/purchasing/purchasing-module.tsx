"use client";

import { useMemo, useState } from "react";
import { CreditCard, PackageCheck, Pencil, Scale, Truck, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/ui/data-table";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { BankSelect } from "@/components/finance/bank-select";
import { PageHeader } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePurchasing, useInventory, useProductionSettings } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { purchaseCreditAmount, splitPurchasePayment } from "@/lib/purchasing/credit-utils";
import { BLOCK_FACTORY_SKUS } from "@/lib/block-factory/inventory-sync";
import { CEMENT_KG_PER_BAG } from "@/lib/block-factory/yields";
import {
  FACTORY_IDS,
  type MaterialPurchase,
  type MaterialPurchaseType,
  type PaymentMethod,
  type Supplier,
  type SupplierPayment,
  type SupplierType,
} from "@/types";

const MATERIAL_TYPES: Array<{ value: MaterialPurchaseType; label: string }> = [
  { value: "cement", label: "Cement" },
  { value: "poliche", label: "Poliche" },
  { value: "ashwa", label: "Ashwa" },
  { value: "spare_parts", label: "Spare Parts" },
  { value: "other", label: "Other" },
];

const NEW_SUPPLIER_ID = "__new_supplier__";
const NEW_ITEM_ID = "__new_item__";

/** Types the server resolves to one specific item by SKU — these get no item picker. */
const FIXED_SKU_TYPES: Partial<Record<MaterialPurchaseType, string>> = {
  cement: BLOCK_FACTORY_SKUS.cement,
  poliche: BLOCK_FACTORY_SKUS.poliche,
  ashwa: BLOCK_FACTORY_SKUS.ashwa,
};

const isSparePartItem = (sku: string) => sku.startsWith("BLK-SP-");

const emptyPurchaseNewSupplier = () => ({
  name: "",
  contact_phone: "",
  contact_email: "",
  address: "",
  supplier_type: "credit" as SupplierType,
});

function purchaseStatusVariant(status: string) {
  if (status === "received") return "secondary" as const;
  if (status === "cancelled") return "outline" as const;
  return "default" as const;
}

function paymentStatusVariant(status?: string) {
  if (status === "paid") return "secondary" as const;
  if (status === "partial") return "default" as const;
  return "outline" as const;
}

function sortingStatusVariant(status?: string) {
  if (status === "sorted") return "secondary" as const;
  if (status === "pending_sorting") return "default" as const;
  return "outline" as const;
}

function requiresSortingWorkflow(purchase: MaterialPurchase): boolean {
  return purchase.factory_id === FACTORY_IDS.recycling && purchase.item?.category === "raw_material";
}

export function PurchasingModule() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const isRecyclingScope = viewScope === "recycling";
  const canManage = hasPermission("inventory", "manage");
  const { data, isLoading, mutate } = usePurchasing();
  const { data: inventoryData } = useInventory();
  const { data: productionSettings } = useProductionSettings();
  const cementKgPerBag = productionSettings?.cement_kg_per_bag ?? CEMENT_KG_PER_BAG;

  const suppliers = (data?.suppliers ?? []) as Supplier[];
  const purchases = (data?.purchases ?? []) as MaterialPurchase[];
  const payments = (data?.payments ?? []) as SupplierPayment[];
  const totalCreditOwed = Number(data?.totalCreditOwed ?? 0);

  const scopedItems = useMemo(
    () =>
      (
        (inventoryData?.items ?? []) as Array<{
          id: string;
          name: string;
          sku: string;
          unit: string;
          factory_id: string;
          category?: string | null;
        }>
      ).filter((i) => i.factory_id === (isRecyclingScope ? FACTORY_IDS.recycling : FACTORY_IDS.block)),
    [inventoryData?.items, isRecyclingScope]
  );

  // You buy raw materials and supplies from a supplier — never your own finished blocks or
  // half-cured work in process. Those belong to production, not purchasing.
  const purchasableItems = useMemo(
    () =>
      scopedItems.filter(
        (i) => i.category !== "finished_goods" && i.category !== "work_in_process"
      ),
    [scopedItems]
  );

  // A named material type only appears when there's a real inventory item behind it —
  // otherwise it's a dead end at save time. Cement, poliche and ashwa each bind to one
  // fixed SKU; spare parts needs at least one BLK-SP-* item to point at.
  //
  // "Other" is the deliberate exception: it always stays, because it's the way to buy
  // something the catalog doesn't cover yet and add it to inventory in the same step.
  const availableMaterialTypes = useMemo(() => {
    const hasSku = (sku: string) => purchasableItems.some((i) => i.sku === sku);

    return MATERIAL_TYPES.filter((type) => {
      if (
        isRecyclingScope &&
        (type.value === "cement" || type.value === "poliche" || type.value === "ashwa")
      ) {
        return false;
      }

      const fixedSku = FIXED_SKU_TYPES[type.value];
      if (fixedSku) return hasSku(fixedSku);

      if (type.value === "spare_parts") {
        return purchasableItems.some((i) => isRecyclingScope || isSparePartItem(i.sku));
      }

      return true;
    });
  }, [isRecyclingScope, purchasableItems]);

  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<MaterialPurchase | null>(null);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sortingDialogOpen, setSortingDialogOpen] = useState(false);
  const [receivingPurchase, setReceivingPurchase] = useState<MaterialPurchase | null>(null);
  const [sortingPurchase, setSortingPurchase] = useState<MaterialPurchase | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingPurchase, setCancellingPurchase] = useState<MaterialPurchase | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: "",
    supplier_name: "",
    material_type: "cement" as MaterialPurchaseType,
    item_id: "",
    new_item_name: "",
    quantity: "",
    unit: "bag",
    unit_price: "",
    purchase_date: new Date().toISOString().slice(0, 10),
    vehicle_plate: "",
    delivery_notes: "",
    receive_now: true,
    amount_paid: "",
    pay_method: "cash" as PaymentMethod,
    bank_account_id: "",
  });
  const [receiveForm, setReceiveForm] = useState({
    amount_paid: "",
    pay_method: "cash" as PaymentMethod,
    bank_account_id: "",
  });
  const [sortingForm, setSortingForm] = useState({ net_recyclable_weight: "" });
  const [paymentForm, setPaymentForm] = useState({
    supplier_id: "",
    amount: "",
    payment_method: "cash" as PaymentMethod,
    bank_account_id: "",
    reference: "",
    notes: "",
  });
  const [purchaseNewSupplier, setPurchaseNewSupplier] = useState(emptyPurchaseNewSupplier);

  const pendingPurchases = purchases.filter((p) => p.status === "ordered");
  const receivedPurchases = purchases.filter((p) => p.status === "received");
  const creditPurchases = receivedPurchases.filter((p) => purchaseCreditAmount(p) > 0);

  const defaultItemForType = (type: MaterialPurchaseType) => {
    const fixedSku = FIXED_SKU_TYPES[type];
    return fixedSku ? purchasableItems.find((i) => i.sku === fixedSku) ?? null : null;
  };

  /** What the item picker may offer for a type — never finished goods or work in process. */
  const itemsForMaterialType = (type: MaterialPurchaseType) => {
    if (editingPurchase) return purchasableItems;
    if (type === "spare_parts") {
      return purchasableItems.filter((i) => isRecyclingScope || isSparePartItem(i.sku));
    }
    const fixedSkus = Object.values(FIXED_SKU_TYPES);
    return purchasableItems.filter(
      (i) => !fixedSkus.includes(i.sku) && (isRecyclingScope || !isSparePartItem(i.sku))
    );
  };

  const openPurchaseDialog = () => {
    const preferred: MaterialPurchaseType = isRecyclingScope ? "other" : "cement";
    const initialType: MaterialPurchaseType =
      availableMaterialTypes.find((t) => t.value === preferred)?.value ??
      availableMaterialTypes[0]?.value ??
      "other";
    const defaultItem = defaultItemForType(initialType);
    const supplier = suppliers[0];
    const useNewSupplier = !supplier;
    setEditingPurchase(null);
    setPurchaseForm({
      supplier_id: useNewSupplier ? NEW_SUPPLIER_ID : supplier.id,
      supplier_name: useNewSupplier ? "" : supplier.name,
      material_type: initialType,
      item_id: defaultItem?.id ?? "",
      new_item_name: "",
      quantity: "",
      unit: defaultItem?.unit ?? (isRecyclingScope ? "" : "bag"),
      unit_price: "",
      purchase_date: new Date().toISOString().slice(0, 10),
      vehicle_plate: "",
      delivery_notes: "",
      receive_now: true,
      amount_paid: "",
      pay_method: "cash",
      bank_account_id: "",
    });
    setPurchaseNewSupplier(emptyPurchaseNewSupplier());
    setPurchaseDialogOpen(true);
  };

  const openEditPurchaseDialog = (purchase: MaterialPurchase) => {
    setEditingPurchase(purchase);
    setPurchaseForm({
      supplier_id: purchase.supplier_id ?? "",
      supplier_name: purchase.supplier_name,
      material_type: purchase.material_type,
      item_id: purchase.item_id ?? "",
      new_item_name: "",
      quantity: String(purchase.quantity),
      unit: purchase.unit,
      unit_price: String(purchase.unit_price),
      purchase_date: purchase.purchase_date?.slice(0, 10) ?? "",
      vehicle_plate: purchase.vehicle_plate ?? "",
      delivery_notes: purchase.delivery_notes ?? "",
      receive_now: false,
      amount_paid: "",
      pay_method: "cash",
      bank_account_id: "",
    });
    setPurchaseNewSupplier(emptyPurchaseNewSupplier());
    setPurchaseDialogOpen(true);
  };

  const openReceiveDialog = (purchase: MaterialPurchase) => {
    setReceivingPurchase(purchase);
    setReceiveForm({
      amount_paid: "",
      pay_method: "cash",
      bank_account_id: "",
    });
    setReceiveDialogOpen(true);
  };

  const openSortingDialog = (purchase: MaterialPurchase) => {
    setSortingPurchase(purchase);
    setSortingForm({
      net_recyclable_weight:
        purchase.sorting_status === "sorted" && purchase.net_recyclable_weight != null
          ? String(purchase.net_recyclable_weight)
          : "",
    });
    setSortingDialogOpen(true);
  };

  const openCancelDialog = (purchase: MaterialPurchase) => {
    setCancellingPurchase(purchase);
    setCancelReason("");
    setCancelDialogOpen(true);
  };

  const openPaymentDialog = (supplier?: Supplier) => {
    setPaymentForm({
      supplier_id: supplier?.id ?? suppliers[0]?.id ?? "",
      amount: "",
      payment_method: "cash",
      bank_account_id: "",
      reference: "",
      notes: "",
    });
    setPaymentDialogOpen(true);
  };

  const handleMaterialTypeChange = (type: MaterialPurchaseType) => {
    const defaultItem = defaultItemForType(type);
    setPurchaseForm((f) => ({
      ...f,
      material_type: type,
      item_id: defaultItem?.id ?? (f.item_id === NEW_ITEM_ID ? "" : f.item_id),
      new_item_name: "",
      unit: defaultItem?.unit ?? f.unit,
    }));
  };

  const purchaseFormSelectedItem = scopedItems.find((i) => i.id === purchaseForm.item_id);
  const purchaseNeedsSorting =
    isRecyclingScope && purchaseFormSelectedItem?.category === "raw_material" && purchaseForm.receive_now;

  const purchasePreviewTotal =
    (Number(purchaseForm.quantity) || 0) * (Number(purchaseForm.unit_price) || 0);
  const purchasePaymentSplit = splitPurchasePayment(
    purchasePreviewTotal,
    Number(purchaseForm.amount_paid) || 0
  );

  // A received purchase can still be re-pointed at another item or supplier — the edit
  // reverses the old postings and re-posts them. What stays locked is what the sorting
  // workflow owns: the item on any sorting purchase, and quantity once sorting is final.
  // An older purchase may name a type that's no longer offered (its item was removed since).
  // Keep its own value in the list so opening it for edit doesn't blank the field.
  const materialTypeOptions = useMemo(() => {
    if (!editingPurchase) return availableMaterialTypes;
    if (availableMaterialTypes.some((t) => t.value === editingPurchase.material_type)) {
      return availableMaterialTypes;
    }
    const own = MATERIAL_TYPES.find((t) => t.value === editingPurchase.material_type);
    return own ? [...availableMaterialTypes, own] : availableMaterialTypes;
  }, [availableMaterialTypes, editingPurchase]);

  const editIsReceived = editingPurchase?.status === "received";
  const editUsesSorting =
    !!editingPurchase?.sorting_status && editingPurchase.sorting_status !== "not_applicable";
  const editLocksItem = !!editIsReceived && editUsesSorting;
  const editLocksQuantity = editingPurchase?.sorting_status === "sorted";

  const receivePreviewTotal = receivingPurchase ? Number(receivingPurchase.total_cost) : 0;
  const receivePaymentSplit = splitPurchasePayment(
    receivePreviewTotal,
    Number(receiveForm.amount_paid) || 0
  );

  const submitPurchase = async () => {
    const qty = Number(purchaseForm.quantity);
    const unitPrice = Number(purchaseForm.unit_price);

    let supplierId = purchaseForm.supplier_id;
    let supplierName = purchaseForm.supplier_name;

    if (supplierId === NEW_SUPPLIER_ID) {
      if (!purchaseNewSupplier.name.trim()) {
        toast.error("Enter the new supplier name");
        return;
      }
      try {
        const created = (await mutate.mutateAsync({
          action: "create_supplier",
          name: purchaseNewSupplier.name.trim(),
          contact_phone: purchaseNewSupplier.contact_phone.trim() || undefined,
          contact_email: purchaseNewSupplier.contact_email.trim() || undefined,
          address: purchaseNewSupplier.address.trim() || undefined,
          supplier_type: purchaseNewSupplier.supplier_type,
        })) as Supplier;
        supplierId = created.id;
        supplierName = created.name;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to create supplier");
        return;
      }
    } else if (!supplierName.trim()) {
      toast.error("Select a supplier");
      return;
    }

    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (unitPrice < 0 || Number.isNaN(unitPrice)) {
      toast.error("Enter a valid unit price");
      return;
    }
    if (purchaseForm.item_id === NEW_ITEM_ID) {
      if (!purchaseForm.new_item_name.trim()) {
        toast.error("Enter a name for the new item");
        return;
      }
    } else if (!purchaseForm.item_id && !FIXED_SKU_TYPES[purchaseForm.material_type]) {
      // Types with a fixed SKU are resolved server-side and have no picker.
      toast.error("Select an inventory item");
      return;
    }
    if (
      purchaseForm.receive_now &&
      purchasePaymentSplit.amountPaid > 0 &&
      purchaseForm.pay_method === "bank" &&
      !purchaseForm.bank_account_id
    ) {
      toast.error("Select the bank used for payment");
      return;
    }
    mutate.mutate(
      {
        action: "create_purchase",
        supplier_id: supplierId || undefined,
        supplier_name: supplierName,
        material_type: purchaseForm.material_type,
        item_id: purchaseForm.item_id && purchaseForm.item_id !== NEW_ITEM_ID ? purchaseForm.item_id : undefined,
        new_item_name:
          purchaseForm.item_id === NEW_ITEM_ID ? purchaseForm.new_item_name.trim() : undefined,
        quantity: qty,
        unit: purchaseForm.unit,
        unit_price: unitPrice,
        purchase_date: purchaseForm.purchase_date || undefined,
        vehicle_plate: purchaseForm.vehicle_plate.trim() || undefined,
        delivery_notes: purchaseForm.delivery_notes.trim() || undefined,
        receive_now: purchaseForm.receive_now,
        amount_paid: purchaseForm.receive_now ? purchasePaymentSplit.amountPaid : undefined,
        pay_method: purchaseForm.receive_now ? purchaseForm.pay_method : undefined,
        bank_account_id: purchaseForm.receive_now ? purchaseForm.bank_account_id || undefined : undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            purchaseNeedsSorting
              ? "Purchase recorded — pending sorting before stock is available"
              : purchaseForm.receive_now
                ? "Purchase recorded — stock updated"
                : "Purchase order created"
          );
          setPurchaseDialogOpen(false);
          setPurchaseNewSupplier(emptyPurchaseNewSupplier());
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to create purchase"),
      }
    );
  };

  const submitEditPurchase = () => {
    if (!editingPurchase) return;
    const qty = Number(purchaseForm.quantity);
    const unitPrice = Number(purchaseForm.unit_price);

    if (!qty || qty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (unitPrice < 0 || Number.isNaN(unitPrice)) {
      toast.error("Enter a valid unit price");
      return;
    }
    if (!purchaseForm.item_id || purchaseForm.item_id === NEW_ITEM_ID) {
      toast.error("Select an inventory item");
      return;
    }
    if (!purchaseForm.supplier_name.trim()) {
      toast.error("Select a supplier");
      return;
    }
    const alreadyPaid = Number(editingPurchase.amount_paid ?? 0);
    if (editIsReceived && qty * unitPrice < alreadyPaid) {
      toast.error(
        `New total is below the ${formatCurrency(alreadyPaid)} already paid — record a supplier refund first`
      );
      return;
    }

    mutate.mutate(
      {
        action: "update_purchase",
        id: editingPurchase.id,
        supplier_id: purchaseForm.supplier_id || undefined,
        supplier_name: purchaseForm.supplier_name,
        material_type: purchaseForm.material_type,
        item_id: purchaseForm.item_id,
        quantity: qty,
        unit: purchaseForm.unit,
        unit_price: unitPrice,
        purchase_date: purchaseForm.purchase_date || undefined,
        vehicle_plate: purchaseForm.vehicle_plate.trim(),
        delivery_notes: purchaseForm.delivery_notes.trim(),
      },
      {
        onSuccess: () => {
          toast.success(
            editIsReceived
              ? `${editingPurchase.purchase_number} updated — stock and supplier credit adjusted`
              : `${editingPurchase.purchase_number} updated`
          );
          setPurchaseDialogOpen(false);
          setEditingPurchase(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update purchase"),
      }
    );
  };

  const receivingNeedsSorting = receivingPurchase ? requiresSortingWorkflow(receivingPurchase) : false;

  const submitReceive = () => {
    if (!receivingPurchase) return;
    if (
      receivePaymentSplit.amountPaid > 0 &&
      receiveForm.pay_method === "bank" &&
      !receiveForm.bank_account_id
    ) {
      toast.error("Select the bank used for payment");
      return;
    }
    mutate.mutate(
      {
        action: "receive_purchase",
        id: receivingPurchase.id,
        amount_paid: receivePaymentSplit.amountPaid,
        pay_method: receiveForm.pay_method,
        bank_account_id: receiveForm.bank_account_id || undefined,
      },
      {
        onSuccess: () => {
          toast.success(
            receivingNeedsSorting
              ? `${receivingPurchase.purchase_number} received — pending sorting before stock is available`
              : `${receivingPurchase.purchase_number} received — stock updated`
          );
          setReceiveDialogOpen(false);
          setReceivingPurchase(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Receive failed"),
      }
    );
  };

  const sortingWaste =
    sortingPurchase?.initial_received_weight != null
      ? Math.max(0, Number(sortingPurchase.initial_received_weight) - (Number(sortingForm.net_recyclable_weight) || 0))
      : 0;

  const submitSorting = () => {
    if (!sortingPurchase) return;
    const netWeight = Number(sortingForm.net_recyclable_weight);
    if (Number.isNaN(netWeight) || netWeight < 0) {
      toast.error("Enter a valid net recyclable weight");
      return;
    }
    const initialWeight = Number(sortingPurchase.initial_received_weight ?? 0);
    if (netWeight > initialWeight) {
      toast.error("Net recyclable weight cannot exceed the initial received weight");
      return;
    }

    mutate.mutate(
      {
        action: "finalize_sorting",
        id: sortingPurchase.id,
        net_recyclable_weight: netWeight,
      },
      {
        onSuccess: () => {
          toast.success(`${sortingPurchase.purchase_number} sorting finalized — stock updated`);
          setSortingDialogOpen(false);
          setSortingPurchase(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Finalize sorting failed"),
      }
    );
  };

  const submitCancel = () => {
    if (!cancellingPurchase) return;
    mutate.mutate(
      {
        action: "cancel_purchase",
        id: cancellingPurchase.id,
        reason: cancelReason.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`${cancellingPurchase.purchase_number} cancelled — inventory and supplier balances reversed`);
          setCancelDialogOpen(false);
          setCancellingPurchase(null);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Cancel failed"),
      }
    );
  };

  const submitPayment = () => {
    const amount = Number(paymentForm.amount);
    if (!paymentForm.supplier_id) {
      toast.error("Select a supplier");
      return;
    }
    if (!amount || amount <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (paymentForm.payment_method === "bank" && !paymentForm.bank_account_id) {
      toast.error("Select the bank used for payment");
      return;
    }

    mutate.mutate(
      {
        action: "record_payment",
        supplier_id: paymentForm.supplier_id,
        amount,
        payment_method: paymentForm.payment_method,
        bank_account_id: paymentForm.bank_account_id || undefined,
        reference: paymentForm.reference.trim() || undefined,
        notes: paymentForm.notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Supplier payment recorded");
          setPaymentDialogOpen(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Payment failed"),
      }
    );
  };

  const purchaseColumns = [
    {
      id: "number",
      header: "PO #",
      cell: (row: MaterialPurchase) => (
        <span className="font-mono text-sm">{row.purchase_number}</span>
      ),
    },
    {
      id: "date",
      header: "Date",
      cell: (row: MaterialPurchase) => formatDate(row.purchase_date),
    },
    {
      id: "supplier",
      header: "Supplier",
      cell: (row: MaterialPurchase) => row.supplier_name,
    },
    {
      id: "material",
      header: "Material",
      cell: (row: MaterialPurchase) => (
        <div>
          <p className="capitalize">{row.material_type.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">{row.item?.name ?? "—"}</p>
        </div>
      ),
    },
    {
      id: "qty",
      header: "Quantity",
      cell: (row: MaterialPurchase) => `${formatNumber(row.quantity)} ${row.unit}`,
    },
    {
      id: "cost",
      header: "Total",
      cell: (row: MaterialPurchase) => formatCurrency(row.total_cost),
    },
    {
      id: "payment",
      header: "Payment",
      cell: (row: MaterialPurchase) =>
        row.status === "received" ? (
          <div className="space-y-1 text-xs">
            <p>Paid: {formatCurrency(row.amount_paid ?? 0)}</p>
            <p className="text-muted-foreground">
              Credit: {formatCurrency(purchaseCreditAmount(row))}
            </p>
            <Badge variant={paymentStatusVariant(row.payment_status)} className="capitalize">
              {row.payment_status ?? "unpaid"}
            </Badge>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Set on receive</span>
        ),
    },
    {
      id: "status",
      header: "Delivery",
      cell: (row: MaterialPurchase) => (
        <Badge variant={purchaseStatusVariant(row.status)} className="capitalize">
          {row.status}
        </Badge>
      ),
    },
    {
      id: "sorting",
      header: "Sorting",
      cell: (row: MaterialPurchase) =>
        row.sorting_status && row.sorting_status !== "not_applicable" ? (
          <div className="space-y-1 text-xs">
            <Badge variant={sortingStatusVariant(row.sorting_status)} className="capitalize">
              {row.sorting_status.replace(/_/g, " ")}
            </Badge>
            {row.initial_received_weight != null && (
              <p className="text-muted-foreground">
                Gross: {formatNumber(row.initial_received_weight)} {row.unit}
              </p>
            )}
            {row.sorting_status === "sorted" && (
              <>
                <p className="text-muted-foreground">
                  Net: {formatNumber(row.net_recyclable_weight ?? 0)} {row.unit}
                </p>
                <p className="font-medium text-destructive">
                  Waste: {formatNumber(row.waste_quantity ?? 0)} {row.unit}
                </p>
              </>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "actions",
      header: "",
      cell: (row: MaterialPurchase) => (
        <div className="flex flex-col gap-1">
          {canManage && row.status === "ordered" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => openReceiveDialog(row)}>
              <PackageCheck className="size-3.5" />
              Receive
            </Button>
          )}
          {canManage && row.status !== "cancelled" && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs"
              onClick={() => openEditPurchaseDialog(row)}
            >
              <Pencil className="size-3.5" />
              Edit
            </Button>
          )}
          {canManage && row.sorting_status === "pending_sorting" && (
            <Button size="sm" variant="outline" className="gap-1" onClick={() => openSortingDialog(row)}>
              <Scale className="size-3.5" />
              Finalize Sorting
            </Button>
          )}
          {canManage && row.sorting_status === "sorted" && (
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => openSortingDialog(row)}>
              <Scale className="size-3.5" />
              Adjust
            </Button>
          )}
          {canManage && row.status !== "cancelled" && row.sorting_status !== "sorted" && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1 text-xs text-destructive hover:text-destructive"
              onClick={() => openCancelDialog(row)}
            >
              <XCircle className="size-3.5" />
              Cancel
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material Purchasing"
        description="Order materials, receive stock, and manage supplier credit (pay now or pay later)."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => openPaymentDialog()} className="gap-1.5">
                <Wallet className="size-4" />
                Pay Supplier
              </Button>
              <Button onClick={openPurchaseDialog} className="gap-1.5">
                <Truck className="size-4" />
                New Purchase
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{suppliers.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Deliveries</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{pendingPurchases.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Payable Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totalCreditOwed)}</p>
            <p className="text-xs text-muted-foreground">{creditPurchases.length} PO(s) with balance</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Received (all time)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{receivedPurchases.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="purchases">
        <TabsList>
          <TabsTrigger value="purchases">Purchase Orders</TabsTrigger>
          <TabsTrigger value="credit">Credit Management</TabsTrigger>
        </TabsList>

        <TabsContent value="purchases" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Purchase Orders</CardTitle>
              <CardDescription>
                Receive deliveries with cash, bank, or credit. Unpaid amounts are added to supplier balance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={purchases}
                getRowKey={(row) => row.id}
                emptyMessage={isLoading ? "Loading..." : "No purchase orders yet"}
                columns={purchaseColumns}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credit" className="mt-4 space-y-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CreditCard className="size-4" />
                Supplier Credit Summary
              </CardTitle>
              <CardDescription>
                Total outstanding: {formatCurrency(totalCreditOwed)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={suppliers.filter((s) => Number(s.balance ?? 0) > 0)}
                getRowKey={(row) => row.id}
                emptyMessage="No outstanding supplier credit"
                columns={[
                  { id: "name", header: "Supplier", cell: (row) => row.name },
                  {
                    id: "balance",
                    header: "Amount Owed",
                    cell: (row) => formatCurrency(row.balance ?? 0),
                  },
                  {
                    id: "type",
                    header: "Vendor Type",
                    cell: (row) => (
                      <Badge variant="outline" className="capitalize">
                        {row.supplier_type ?? "credit"}
                      </Badge>
                    ),
                  },
                  {
                    id: "actions",
                    header: "",
                    cell: (row) =>
                      canManage ? (
                        <Button size="sm" onClick={() => openPaymentDialog(row)}>
                          Record Payment
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Payment History</CardTitle>
              <CardDescription>Cash and bank payments made to suppliers</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                data={payments}
                getRowKey={(row) => row.id}
                emptyMessage={isLoading ? "Loading..." : "No supplier payments recorded yet"}
                columns={[
                  {
                    id: "date",
                    header: "Date",
                    cell: (row) => formatDate(row.payment_date),
                  },
                  {
                    id: "supplier",
                    header: "Supplier",
                    cell: (row) => row.supplier_name ?? "—",
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => formatCurrency(row.amount),
                  },
                  {
                    id: "method",
                    header: "Method",
                    cell: (row) => (
                      <div>
                        <p className="capitalize">{row.payment_method}</p>
                        {row.bank?.name && (
                          <p className="text-xs text-muted-foreground">{row.bank.name}</p>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "reference",
                    header: "Reference",
                    cell: (row) => row.purchase_number ?? row.reference ?? "—",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <EntityFormDialog
        open={purchaseDialogOpen}
        onOpenChange={(open) => {
          setPurchaseDialogOpen(open);
          if (!open) {
            setPurchaseNewSupplier(emptyPurchaseNewSupplier());
            setEditingPurchase(null);
          }
        }}
        title={editingPurchase ? `Edit ${editingPurchase.purchase_number}` : "New Purchase Order"}
        description={
          editingPurchase
            ? editIsReceived
              ? "Stock, item cost and supplier credit are all corrected when you save."
              : "This PO hasn't been received yet, so nothing has been posted — edit freely."
            : "Enter how much you pay now — the rest is calculated as credit automatically."
        }
        submitLabel={
          editingPurchase ? "Save Changes" : purchaseForm.receive_now ? "Record Purchase" : "Create PO"
        }
        isSubmitting={mutate.isPending}
        onSubmit={() => (editingPurchase ? submitEditPurchase() : void submitPurchase())}
      >
        {editingPurchase && editIsReceived && (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">
              This purchase is already received. Saving moves stock and credit to match —
              change the item or supplier and the original postings are reversed and
              re-posted where they belong.
              {editLocksItem &&
                " The item itself is fixed here, because this purchase's stock comes from its sorted weight rather than from this row."}
              {editLocksQuantity &&
                " Quantity is fixed for the same reason — use Adjust to correct the sorted weight."}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label>Supplier</Label>
          <Select
            value={
              purchaseForm.supplier_id === NEW_SUPPLIER_ID
                ? NEW_SUPPLIER_ID
                : purchaseForm.supplier_id || undefined
            }
            onValueChange={(v) => {
              if (v === NEW_SUPPLIER_ID) {
                setPurchaseForm((f) => ({
                  ...f,
                  supplier_id: NEW_SUPPLIER_ID,
                  supplier_name: "",
                }));
                return;
              }
              const supplier = suppliers.find((s) => s.id === v);
              setPurchaseForm((f) => ({
                ...f,
                supplier_id: v,
                supplier_name: supplier?.name ?? f.supplier_name,
              }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {Number(s.balance ?? 0) > 0 ? ` · ${formatCurrency(s.balance ?? 0)} owed` : ""}
                </SelectItem>
              ))}
              {!editingPurchase && (
                <SelectItem value={NEW_SUPPLIER_ID}>Other — add new supplier</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {purchaseForm.supplier_id === NEW_SUPPLIER_ID && (
          <div className="space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4">
            <p className="text-sm font-medium">New supplier details</p>
            <div className="space-y-2">
              <Label>Supplier Name</Label>
              <Input
                value={purchaseNewSupplier.name}
                onChange={(e) =>
                  setPurchaseNewSupplier((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="e.g. BuildMart Supplies"
              />
            </div>
            <div className="space-y-2">
              <Label>Supplier Type</Label>
              <Select
                value={purchaseNewSupplier.supplier_type}
                onValueChange={(v) =>
                  setPurchaseNewSupplier((f) => ({ ...f, supplier_type: v as SupplierType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">Credit vendor (pay later)</SelectItem>
                  <SelectItem value="cash">Cash vendor (pay on delivery)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Phone (optional)</Label>
              <Input
                value={purchaseNewSupplier.contact_phone}
                onChange={(e) =>
                  setPurchaseNewSupplier((f) => ({ ...f, contact_phone: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={purchaseNewSupplier.contact_email}
                onChange={(e) =>
                  setPurchaseNewSupplier((f) => ({ ...f, contact_email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Address (optional)</Label>
              <Textarea
                value={purchaseNewSupplier.address}
                onChange={(e) =>
                  setPurchaseNewSupplier((f) => ({ ...f, address: e.target.value }))
                }
                rows={2}
              />
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label>Material Type</Label>
          <Select
            value={purchaseForm.material_type}
            onValueChange={(v) => handleMaterialTypeChange(v as MaterialPurchaseType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {materialTypeOptions.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Editing always exposes the item, even for cement/poliche where creating resolves
            it from the SKU — re-pointing a mis-keyed purchase needs it visible. */}
        {(editingPurchase ||
          purchaseForm.material_type === "spare_parts" ||
          purchaseForm.material_type === "other") && (
          <div className="space-y-2">
            <Label>Inventory Item</Label>
            <Select
              disabled={editLocksItem}
              value={purchaseForm.item_id}
              onValueChange={(v) => {
                const item = scopedItems.find((i) => i.id === v);
                setPurchaseForm((f) => ({
                  ...f,
                  item_id: v,
                  new_item_name: v === NEW_ITEM_ID ? f.new_item_name : "",
                  unit: item?.unit ?? f.unit,
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select item" />
              </SelectTrigger>
              <SelectContent>
                {!editingPurchase && purchaseForm.material_type === "other" && (
                  <SelectItem value={NEW_ITEM_ID}>+ Add new item</SelectItem>
                )}
                {itemsForMaterialType(purchaseForm.material_type).map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} ({i.sku})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {purchaseForm.item_id === NEW_ITEM_ID && (
              <Input
                placeholder="New item name"
                value={purchaseForm.new_item_name}
                onChange={(e) =>
                  setPurchaseForm((f) => ({ ...f, new_item_name: e.target.value }))
                }
              />
            )}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Quantity</Label>
            <Input
              type="number"
              min={1}
              disabled={editLocksQuantity}
              value={purchaseForm.quantity}
              onChange={(e) => setPurchaseForm((f) => ({ ...f, quantity: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            {purchaseForm.material_type === "cement" ? (
              <Select
                value={purchaseForm.unit}
                onValueChange={(v) => setPurchaseForm((f) => ({ ...f, unit: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bag">Bag</SelectItem>
                  <SelectItem value="kg">Kg</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={purchaseForm.unit}
                onChange={(e) => setPurchaseForm((f) => ({ ...f, unit: e.target.value }))}
              />
            )}
          </div>
        </div>
        {purchaseForm.material_type === "cement" && Number(purchaseForm.quantity) > 0 && (
          <p className="text-xs text-muted-foreground">
            {purchaseForm.unit === "kg"
              ? `= ${formatNumber(Number(purchaseForm.quantity) / cementKgPerBag)} bag(s) (${cementKgPerBag}kg/bag)`
              : `= ${formatNumber(Number(purchaseForm.quantity) * cementKgPerBag)} kg (${cementKgPerBag}kg/bag)`}
          </p>
        )}
        <div className="space-y-2">
          <Label>Unit Price</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={purchaseForm.unit_price}
            onChange={(e) => setPurchaseForm((f) => ({ ...f, unit_price: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Purchase Date</Label>
          <Input
            type="date"
            value={purchaseForm.purchase_date}
            onChange={(e) => setPurchaseForm((f) => ({ ...f, purchase_date: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Vehicle Plate (optional)</Label>
          <Input
            value={purchaseForm.vehicle_plate}
            onChange={(e) => setPurchaseForm((f) => ({ ...f, vehicle_plate: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Delivery Notes</Label>
          <Textarea
            value={purchaseForm.delivery_notes}
            onChange={(e) => setPurchaseForm((f) => ({ ...f, delivery_notes: e.target.value }))}
            rows={2}
          />
        </div>

        {!editingPurchase && (
          <div className="space-y-2">
            <Label>Delivery Status</Label>
            <Select
              value={purchaseForm.receive_now ? "now" : "later"}
              onValueChange={(v) => setPurchaseForm((f) => ({ ...f, receive_now: v === "now" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="now">Material arrived — receive now</SelectItem>
                <SelectItem value="later">Order only — receive later</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {editingPurchase && (
          <Card className="border-border/60 bg-muted/10">
            <CardContent className="space-y-2 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total was</span>
                <span>{formatCurrency(Number(editingPurchase.total_cost))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total after save</span>
                <span className="font-medium">{formatCurrency(purchasePreviewTotal)}</span>
              </div>
              {editIsReceived && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Owed to {purchaseForm.supplier_name || "supplier"} (
                    {formatCurrency(Number(editingPurchase.amount_paid ?? 0))} paid)
                  </span>
                  <span className="font-medium text-destructive">
                    {formatCurrency(
                      Math.max(0, purchasePreviewTotal - Number(editingPurchase.amount_paid ?? 0))
                    )}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {purchaseNeedsSorting && (
          <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
            <p className="text-xs text-muted-foreground">
              Quantity above is the initial (gross) received weight. Stock stays unavailable
              until you record the net recyclable weight with &quot;Finalize Sorting&quot;
              after this purchase is received.
            </p>
          </div>
        )}

        {purchaseForm.receive_now && purchasePreviewTotal > 0 && (
          <>
            <Card className="border-border/60 bg-muted/10">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total purchase</span>
                  <span className="font-medium">{formatCurrency(purchasePreviewTotal)}</span>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="purchase-amount-paid">Amount paying now</Label>
                  <Input
                    id="purchase-amount-paid"
                    type="number"
                    min={0}
                    max={purchasePreviewTotal}
                    step="0.01"
                    value={purchaseForm.amount_paid}
                    onChange={(e) => setPurchaseForm((f) => ({ ...f, amount_paid: e.target.value }))}
                    placeholder="0 for full credit"
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">On credit (auto)</span>
                  <span className="font-medium text-destructive">
                    {formatCurrency(purchasePaymentSplit.creditAmount)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {purchasePaymentSplit.amountPaid > 0 && (
              <>
                <div className="space-y-2">
                  <Label>How are you paying now?</Label>
                  <Select
                    value={purchaseForm.pay_method}
                    onValueChange={(v) =>
                      setPurchaseForm((f) => ({
                        ...f,
                        pay_method: v as PaymentMethod,
                        bank_account_id: v === "bank" ? f.bank_account_id : "",
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {purchaseForm.pay_method === "bank" && (
                  <BankSelect
                    value={purchaseForm.bank_account_id}
                    onChange={(bank_account_id) => setPurchaseForm((f) => ({ ...f, bank_account_id }))}
                    required
                  />
                )}
              </>
            )}
          </>
        )}
      </EntityFormDialog>

      <EntityFormDialog
        open={receiveDialogOpen}
        onOpenChange={(open) => {
          setReceiveDialogOpen(open);
          if (!open) setReceivingPurchase(null);
        }}
        title="Receive Purchase"
        description={
          receivingPurchase
            ? `${receivingPurchase.purchase_number} · ${formatCurrency(receivingPurchase.total_cost)} total`
            : undefined
        }
        submitLabel={receivingNeedsSorting ? "Receive — Pending Sorting" : "Receive & Update Stock"}
        isSubmitting={mutate.isPending}
        onSubmit={submitReceive}
      >
        {receivingNeedsSorting && (
          <div className="rounded-lg border border-border/60 bg-muted/10 p-4">
            <p className="text-xs text-muted-foreground">
              Quantity ({formatNumber(receivingPurchase?.quantity ?? 0)} {receivingPurchase?.unit}) is
              the initial (gross) received weight. Stock stays unavailable until you record the net
              recyclable weight with &quot;Finalize Sorting&quot;.
            </p>
          </div>
        )}
        <Card className="border-border/60 bg-muted/10">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total purchase</span>
              <span className="font-medium">{formatCurrency(receivePreviewTotal)}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="receive-amount-paid">Amount paying now</Label>
              <Input
                id="receive-amount-paid"
                type="number"
                min={0}
                max={receivePreviewTotal}
                step="0.01"
                value={receiveForm.amount_paid}
                onChange={(e) => setReceiveForm((f) => ({ ...f, amount_paid: e.target.value }))}
                placeholder="0 for full credit"
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">On credit (auto)</span>
              <span className="font-medium text-destructive">
                {formatCurrency(receivePaymentSplit.creditAmount)}
              </span>
            </div>
          </CardContent>
        </Card>

        {receivePaymentSplit.amountPaid > 0 && (
          <>
            <div className="space-y-2">
              <Label>How are you paying now?</Label>
              <Select
                value={receiveForm.pay_method}
                onValueChange={(v) =>
                  setReceiveForm((f) => ({
                    ...f,
                    pay_method: v as PaymentMethod,
                    bank_account_id: v === "bank" ? f.bank_account_id : "",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {receiveForm.pay_method === "bank" && (
              <BankSelect
                value={receiveForm.bank_account_id}
                onChange={(bank_account_id) => setReceiveForm((f) => ({ ...f, bank_account_id }))}
                required
              />
            )}
          </>
        )}
      </EntityFormDialog>

      <EntityFormDialog
        open={sortingDialogOpen}
        onOpenChange={(open) => {
          setSortingDialogOpen(open);
          if (!open) setSortingPurchase(null);
        }}
        title={sortingPurchase?.sorting_status === "sorted" ? "Adjust Sorting" : "Finalize Sorting"}
        description={
          sortingPurchase
            ? `${sortingPurchase.purchase_number} · Initial received weight: ${formatNumber(
                sortingPurchase.initial_received_weight ?? 0
              )} ${sortingPurchase.unit}`
            : undefined
        }
        submitLabel={sortingPurchase?.sorting_status === "sorted" ? "Save Correction" : "Finalize Sorting"}
        isSubmitting={mutate.isPending}
        onSubmit={submitSorting}
      >
        <div className="space-y-2">
          <Label htmlFor="sorting-net-weight">
            Net Recyclable Weight ({sortingPurchase?.unit})
          </Label>
          <Input
            id="sorting-net-weight"
            type="number"
            min={0}
            max={sortingPurchase?.initial_received_weight ?? undefined}
            step="0.01"
            value={sortingForm.net_recyclable_weight}
            onChange={(e) => setSortingForm({ net_recyclable_weight: e.target.value })}
            placeholder="Weight remaining after sorting out unrecyclable/contaminated material"
          />
        </div>
        <Card className="border-border/60 bg-muted/10">
          <CardContent className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Initial received weight</span>
              <span className="font-medium">
                {formatNumber(sortingPurchase?.initial_received_weight ?? 0)} {sortingPurchase?.unit}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Waste generated (auto)</span>
              <span className="font-medium text-destructive">
                {formatNumber(sortingWaste)} {sortingPurchase?.unit}
              </span>
            </div>
          </CardContent>
        </Card>
        {sortingPurchase?.sorting_status === "sorted" && (
          <p className="text-xs text-muted-foreground">
            This purchase was already sorted. Saving a new value posts an inventory correction
            for the difference — it does not double-count stock.
          </p>
        )}
      </EntityFormDialog>

      <EntityFormDialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          setCancelDialogOpen(open);
          if (!open) setCancellingPurchase(null);
        }}
        title="Cancel Purchase"
        description={
          cancellingPurchase
            ? `${cancellingPurchase.purchase_number} · ${formatCurrency(cancellingPurchase.total_cost)} total`
            : undefined
        }
        submitLabel="Cancel Purchase"
        isSubmitting={mutate.isPending}
        onSubmit={submitCancel}
      >
        {cancellingPurchase?.status === "received" ? (
          <p className="text-sm text-muted-foreground">
            This purchase was already received. Cancelling reverses the stock it added, its
            contribution to the supplier&apos;s total purchases, and any outstanding credit
            balance. Amounts already paid in cash or bank are not refunded automatically.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            This order hasn&apos;t been received yet, so no inventory or supplier balances need
            to be reversed.
          </p>
        )}
        <div className="space-y-2">
          <Label>Reason (optional)</Label>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={2}
            placeholder="Why is this purchase being cancelled?"
          />
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        title="Pay Supplier"
        description="Record a cash or bank payment to reduce supplier credit balance."
        submitLabel="Record Payment"
        isSubmitting={mutate.isPending}
        onSubmit={submitPayment}
      >
        <div className="space-y-2">
          <Label>Supplier</Label>
          <Select
            value={paymentForm.supplier_id}
            onValueChange={(v) => {
              const supplier = suppliers.find((s) => s.id === v);
              setPaymentForm((f) => ({
                ...f,
                supplier_id: v,
                amount: "",
              }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {formatCurrency(s.balance ?? 0)} owed
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={paymentForm.amount}
            onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
          />
          {(() => {
            const selectedSupplier = suppliers.find((s) => s.id === paymentForm.supplier_id);
            if (selectedSupplier) {
              const currentBalance = selectedSupplier.balance ?? 0;
              const payVal = Number(paymentForm.amount) || 0;
              const remaining = Math.max(0, currentBalance - payVal);
              return (
                <div className="flex justify-between text-xs text-muted-foreground px-1 mt-1">
                  <span>Current balance: {formatCurrency(currentBalance)}</span>
                  <span className="font-semibold text-foreground">Remaining: {formatCurrency(remaining)}</span>
                </div>
              );
            }
            return null;
          })()}
        </div>
        <div className="space-y-2">
          <Label>Payment Method</Label>
          <Select
            value={paymentForm.payment_method}
            onValueChange={(v) =>
              setPaymentForm((f) => ({
                ...f,
                payment_method: v as PaymentMethod,
                bank_account_id: v === "bank" ? f.bank_account_id : "",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="bank">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {paymentForm.payment_method === "bank" && (
          <BankSelect
            value={paymentForm.bank_account_id}
            onChange={(bank_account_id) => setPaymentForm((f) => ({ ...f, bank_account_id }))}
            required
          />
        )}
        <div className="space-y-2">
          <Label>Reference (optional)</Label>
          <Input
            value={paymentForm.reference}
            onChange={(e) => setPaymentForm((f) => ({ ...f, reference: e.target.value }))}
            placeholder="Receipt or transfer ref"
          />
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            value={paymentForm.notes}
            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
          />
        </div>
      </EntityFormDialog>
    </div>
  );
}
