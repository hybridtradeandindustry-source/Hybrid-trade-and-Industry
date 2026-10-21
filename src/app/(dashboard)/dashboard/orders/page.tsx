"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { BankSelect } from "@/components/finance/bank-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { RowActions } from "@/components/crud/row-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useBlockBatchesForOrders,
  useCustomers,
  useFinanceSettings,
  useInventory,
  useOrders,
} from "@/hooks/use-api";
import { getAvailableQuantity } from "@/lib/inventory/inventory-utils";
import {
  BLOCK_SIZE_OPTIONS,
  finishedGoodsSku,
  parseBlockSizeCm,
  type BlockSizeCm,
} from "@/lib/block-factory/yields";
import {
  FACTORY_IDS,
  applyOrderDiscount,
  computeVatAmount,
  computeWithholdingAmount,
  orderLineSubtotal,
  type Customer,
  type InventoryItem,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type ProductionBatch,
  type RecyclingOrderStage,
  orderCreditAmount,
} from "@/types";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import { formatCurrency, formatDate } from "@/lib/utils";
import { ORDER_STATUS_LABELS, RECYCLING_STAGE_LABELS } from "@/types";

function batchLabel(batch: Pick<ProductionBatch, "batch_number" | "name">) {
  return batch.name ? `${batch.batch_number} — ${batch.name}` : batch.batch_number;
}

const RECYCLING_STAGES: RecyclingOrderStage[] = [
  "pending",
  "accepted",
  "in_production",
  "ready",
  "delivered",
  "cancelled",
];

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

type OrderLineFormState = {
  key: string;
  item_id: string;
  /** Block factory only — the specific batch this line is ordered against. */
  batch_id: string;
  /** Block factory only — UI-only cascading helper, not sent to the server directly. */
  block_size_cm: string;
  quantity: string;
  unit_price: string;
};

type CustomerMode = "regular" | "walking";

type WalkingBuyerFormState = {
  name: string;
  phone: string;
  tin: string;
  convert_to_regular: boolean;
};

type OrderFormState = {
  customer_mode: CustomerMode;
  customer_id: string;
  walking_buyer: WalkingBuyerFormState;
  amount_paid: string;
  discount_percent: string;
  payment_method: PaymentMethod;
  bank_account_id: string;
  requires_invoice: boolean;
  pending_pickup: boolean;
  prepaid_advance: boolean;
  vat_applied: boolean;
  withholding_applied: boolean;
  store_credit_applied: string;
  factory_id: string;
  delivery_date: string;
  lines: OrderLineFormState[];
};

const emptyWalkingBuyer = (): WalkingBuyerFormState => ({
  name: "",
  phone: "",
  tin: "",
  convert_to_regular: false,
});

const emptyForm = (factoryId: string, defaultItemId = ""): OrderFormState => ({
  customer_mode: "regular",
  customer_id: "",
  walking_buyer: emptyWalkingBuyer(),
  amount_paid: "",
  discount_percent: "",
  payment_method: "cash",
  bank_account_id: "",
  requires_invoice: false,
  pending_pickup: false,
  prepaid_advance: false,
  vat_applied: false,
  withholding_applied: false,
  store_credit_applied: "",
  factory_id: factoryId,
  delivery_date: "",
  lines: [
    factoryId === FACTORY_IDS.block ? newBlockLine() : newLine(defaultItemId),
  ],
});

function newLine(itemId = "", unitPrice = ""): OrderLineFormState {
  return {
    key: crypto.randomUUID(),
    item_id: itemId,
    batch_id: "",
    block_size_cm: "",
    quantity: "",
    unit_price: unitPrice,
  };
}

function newBlockLine(): OrderLineFormState {
  return {
    key: crypto.randomUUID(),
    item_id: "",
    batch_id: "",
    block_size_cm: "",
    quantity: "",
    unit_price: "",
  };
}

/**
 * A block line resolves its inventory item from the selected batch's size. A miss means
 * the finished goods item is absent or deactivated in Inventory — name it, since the
 * form has no SKU field to point at.
 */
function missingFgSkuMessage(blockSizeCm: string): string {
  const size = parseBlockSizeCm(blockSizeCm);
  return size
    ? `"${finishedGoodsSku(size)}" is missing or deactivated in Block Factory inventory — restore it before selling this size`
    : "no finished goods SKU matches this block size";
}

function orderLineRemaining(line: { quantity: number; quantity_fulfilled?: number }) {
  return Math.max(0, line.quantity - Number(line.quantity_fulfilled ?? 0));
}

export default function OrdersPage() {
  const { hasPermission } = useAuth();
  const { viewScope } = useAppStore();
  const { data, isLoading, mutate } = useOrders();
  const { data: customersData } = useCustomers();
  const { data: inventoryData } = useInventory();
  const { data: blockProductionData } = useBlockBatchesForOrders();
  const { data: financeSettings } = useFinanceSettings();

  const canManage = hasPermission("sales", "manage");
  const blockBatches = ((blockProductionData?.batches ?? []) as ProductionBatch[]).filter(
    (b) => b.factory_id === FACTORY_IDS.block
  );
  const blockBatchProduction = (blockProductionData?.batchProduction ?? {}) as Record<
    string,
    { produced: number; sold: number }
  >;
  const batchAvailable = (batchId: string) => {
    const summary = blockBatchProduction[batchId];
    if (!summary) return 0;
    return Math.max(0, summary.produced - summary.sold);
  };
  // A batch stays sellable as long as pieces remain in it, finished or not —
  // only an empty batch drops off the list.
  const orderableBlockBatches = blockBatches.filter((b) => batchAvailable(b.id) > 0);
  const batchesForSize = (sizeCm: string) =>
    orderableBlockBatches.filter((b) => String(b.block_size_cm) === sizeCm);
  const withholdingRatePercent = financeSettings?.withholding_tax_rate_percent ?? 3;
  const vatRatePercent = financeSettings?.vat_rate_percent ?? 15;
  const orders = (data ?? []) as Order[];
  const customers = (customersData ?? []) as Customer[];
  const activeCustomers = useMemo(
    () => customers.filter((c) => c.is_active),
    [customers]
  );
  const regularCustomers = useMemo(
    () =>
      activeCustomers.filter(
        (c) => (c.customer_type ?? "regular") === "regular"
      ),
    [activeCustomers]
  );

  const orderedOrders = useMemo(
    () => orders.filter((o) => o.status === "ordered"),
    [orders]
  );
  const pickedOrders = useMemo(
    () => orders.filter((o) => o.status === "picked"),
    [orders]
  );

  const isRecyclingScope = viewScope === "recycling";
  const recyclingPendingOrders = useMemo(
    () => orders.filter((o) => !o.recycling_stage || o.recycling_stage === "pending"),
    [orders]
  );
  const recyclingAcceptedOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.recycling_stage === "accepted" ||
          o.recycling_stage === "in_production" ||
          o.recycling_stage === "ready"
      ),
    [orders]
  );
  const recyclingCompletedOrders = useMemo(
    () => orders.filter((o) => o.recycling_stage === "delivered"),
    [orders]
  );
  const inventoryItems = (inventoryData?.items ?? []) as InventoryItem[];

  const finishedGoodsForFactory = (factoryId: string) =>
    inventoryItems.filter(
      (item) =>
        item.factory_id === factoryId &&
        item.is_active &&
        (item.category === "finished_goods" || item.sku.includes("-FG-"))
    );

  const defaultFactoryId =
    viewScope === "recycling" ? FACTORY_IDS.recycling : FACTORY_IDS.block;

  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [settleTarget, setSettleTarget] = useState<Order | null>(null);
  const [settleRefundAmount, setSettleRefundAmount] = useState("");
  const [settleBalancePaymentAmount, setSettleBalancePaymentAmount] = useState("");
  const [pickupTarget, setPickupTarget] = useState<Order | null>(null);
  const [pickupQuantities, setPickupQuantities] = useState<Record<string, string>>({});
  const [form, setForm] = useState<OrderFormState>(() => emptyForm(defaultFactoryId));

  const riskCount = orders.filter((o) => o.ai_risk_flag).length;

  const openCreate = () => {
    const fg = finishedGoodsForFactory(defaultFactoryId);
    const first = fg[0];
    setEditingOrder(null);
    setForm(
      emptyForm(
        defaultFactoryId,
        first?.id ?? ""
      )
    );
    setFormOpen(true);
  };

  const openEdit = (order: Order) => {
    const customer = order.customer ?? customers.find((c) => c.id === order.customer_id);
    const isWalking = (customer?.customer_type ?? "regular") === "walking";

    setEditingOrder(order);
    setForm({
      customer_mode: isWalking ? "walking" : "regular",
      customer_id: isWalking ? "" : order.customer_id,
      walking_buyer: {
        name: customer?.name ?? "",
        phone: customer?.phone ?? "",
        tin: customer?.tin ?? "",
        convert_to_regular: false,
      },
      amount_paid: String(order.amount_paid ?? 0),
      discount_percent:
        order.discount_percent != null && order.discount_percent > 0
          ? String(order.discount_percent)
          : "",
      payment_method: order.payment_method ?? "cash",
      bank_account_id: order.bank_account_id ?? "",
      requires_invoice: order.requires_invoice ?? false,
      pending_pickup: false,
      prepaid_advance: order.prepaid_advance ?? false,
      vat_applied: order.vat_applied ?? false,
      withholding_applied: order.withholding_applied ?? false,
      store_credit_applied: "",
      factory_id: order.factory_id,
      delivery_date: order.delivery_date?.slice(0, 10) ?? "",
      lines:
        order.items && order.items.length > 0
          ? order.items.map((line) => {
              const batch = line.batch_id
                ? blockBatches.find((b) => b.id === line.batch_id)
                : undefined;
              return {
                ...newLine(line.item_id ?? "", String(line.unit_price)),
                batch_id: line.batch_id ?? "",
                block_size_cm: batch?.block_size_cm ? String(batch.block_size_cm) : "",
                quantity: String(line.quantity),
              };
            })
          : [newLine()],
    });
    setFormOpen(true);
  };

  const lineInputs = useMemo(
    () =>
      form.lines.map((line) => ({
        quantity: Number(line.quantity) || 0,
        unit_price: Number(line.unit_price) || 0,
      })),
    [form.lines]
  );

  const computedSubtotal = useMemo(
    () => orderLineSubtotal(lineInputs),
    [lineInputs]
  );

  const discountPercent = useMemo(() => {
    const pct = Number(form.discount_percent);
    if (!form.discount_percent.trim() || Number.isNaN(pct)) return 0;
    return Math.min(100, Math.max(0, pct));
  }, [form.discount_percent]);

  const subtotalAfterDiscount = useMemo(
    () => applyOrderDiscount(computedSubtotal, discountPercent),
    [computedSubtotal, discountPercent]
  );

  const vatAmount = useMemo(() => {
    if (editingOrder) {
      if (!editingOrder.vat_applied) return 0;
      return computeVatAmount(
        subtotalAfterDiscount,
        editingOrder.vat_rate_percent,
        true
      );
    }
    return computeVatAmount(subtotalAfterDiscount, vatRatePercent, form.vat_applied);
  }, [
    editingOrder,
    subtotalAfterDiscount,
    vatRatePercent,
    form.vat_applied,
  ]);

  const computedTotal = useMemo(
    () => subtotalAfterDiscount + vatAmount,
    [subtotalAfterDiscount, vatAmount]
  );

  const discountAmount = useMemo(
    () => computedSubtotal - subtotalAfterDiscount,
    [computedSubtotal, subtotalAfterDiscount]
  );

  // Editing never changes withholding (it's locked in at creation), so use the order's own
  // stored amount rather than recomputing from the current org rate/total — the org rate may
  // have changed since, and recomputing would silently drift the remaining-balance preview.
  const withholdingAmount = useMemo(() => {
    if (editingOrder) return Number(editingOrder.withholding_amount ?? 0);
    return computeWithholdingAmount(computedTotal, withholdingRatePercent, form.withholding_applied);
  }, [editingOrder, computedTotal, withholdingRatePercent, form.withholding_applied]);

  const selectedCustomerCredit = useMemo(() => {
    if (form.customer_mode !== "regular" || !form.customer_id) return null;
    return customers.find((c) => c.id === form.customer_id) ?? null;
  }, [customers, form.customer_id, form.customer_mode]);

  const storeCreditAvailable = selectedCustomerCredit?.store_credit_balance ?? 0;
  const storeCreditAppliedNumber = editingOrder ? 0 : Number(form.store_credit_applied) || 0;

  const creditPreview = useMemo(() => {
    const paid = Number(form.amount_paid) || 0;
    return Math.max(0, computedTotal - paid - withholdingAmount - storeCreditAppliedNumber);
  }, [form.amount_paid, computedTotal, withholdingAmount, storeCreditAppliedNumber]);

  // Credit score/tier/limit follow the factory the order is actually being
  // placed against (form.factory_id), not just the navbar scope — this
  // matters in "combined" scope where either factory can be picked per order.
  const isRecyclingOrder = form.factory_id === FACTORY_IDS.recycling;
  const selectedCustomerFactoryScore = useMemo(() => {
    if (!selectedCustomerCredit) return null;
    return {
      score: isRecyclingOrder
        ? selectedCustomerCredit.credit_score_recycling
        : selectedCustomerCredit.credit_score_block,
      tier: isRecyclingOrder
        ? selectedCustomerCredit.credit_risk_tier_recycling
        : selectedCustomerCredit.credit_risk_tier_block,
      limit: isRecyclingOrder
        ? selectedCustomerCredit.credit_limit_recycling
        : selectedCustomerCredit.credit_limit_block,
    };
  }, [selectedCustomerCredit, isRecyclingOrder]);

  const creditRiskWarning = useMemo(() => {
    if (!selectedCustomerCredit || !selectedCustomerFactoryScore || creditPreview <= 0) return null;
    const { tier, score } = selectedCustomerFactoryScore;
    const limit = Number(selectedCustomerFactoryScore.limit ?? 0);
    // Note: balance is the customer's shared, org-wide balance (not split
    // per factory) — only the score/tier/limit below are factory-scoped.
    const projected = Number(selectedCustomerCredit.balance ?? 0) + creditPreview;
    if (tier === "blocked") {
      return `Blocked credit tier (score ${score ?? "n/a"}). New credit sales require override.`;
    }
    if (tier === "high") {
      return `High credit risk (score ${score ?? "n/a"}). Manual review recommended before extending ${formatCurrency(creditPreview)}.`;
    }
    if (limit > 0 && projected > limit) {
      return `Projected exposure ${formatCurrency(projected)} exceeds credit limit ${formatCurrency(limit)} (score ${score ?? "n/a"}).`;
    }
    return null;
  }, [selectedCustomerCredit, selectedCustomerFactoryScore, creditPreview]);

  const updateLine = (key: string, patch: Partial<OrderLineFormState>) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    }));
  };

  const addLine = () => {
    if (form.factory_id === FACTORY_IDS.block) {
      setForm((f) => ({ ...f, lines: [...f.lines, newBlockLine()] }));
      return;
    }
    const fg = finishedGoodsForFactory(form.factory_id);
    const first = fg[0];
    setForm((f) => ({
      ...f,
      lines: [
        ...f.lines,
        newLine(first?.id ?? ""),
      ],
    }));
  };

  const removeLine = (key: string) => {
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((line) => line.key !== key) : f.lines,
    }));
  };

  const handleSubmit = () => {
    if (!canManage) {
      toast.error("You don't have permission to manage sales");
      return;
    }
    // Block lines carry no visible SKU field — item_id is derived from the batch —
    // so name the field that's actually missing instead of listing them all.
    const lineProblem = (() => {
      for (const [index, line] of form.lines.entries()) {
        const label = `Line ${index + 1}`;
        if (form.factory_id === FACTORY_IDS.block) {
          if (!line.block_size_cm) return `${label}: select a block type`;
          if (!line.batch_id) return `${label}: select a batch`;
          if (!line.item_id) return `${label}: ${missingFgSkuMessage(line.block_size_cm)}`;
        } else if (!line.item_id) {
          return `${label}: select a finished goods SKU`;
        }
        if (!line.quantity || Number(line.quantity) <= 0) return `${label}: enter a quantity`;
        if (!line.unit_price || Number(line.unit_price) < 0) return `${label}: enter a unit price`;
      }
      return null;
    })();

    const overBatchLine = form.prepaid_advance
      ? null
      : form.lines.find(
          (line) => line.batch_id && Number(line.quantity) > batchAvailable(line.batch_id)
        );
    if (overBatchLine) {
      toast.error(
        "A line's quantity exceeds what's left in the selected batch — enable Prepaid (pick up as produced) or reduce the quantity"
      );
      return;
    }

    const customerValid =
      form.customer_mode === "regular"
        ? !!form.customer_id
        : !!form.walking_buyer.name.trim();

    const amountPaid = Number(form.amount_paid) || 0;
    if (amountPaid < 0 || amountPaid > computedTotal) {
      toast.error("Amount paid must be between 0 and the sale total");
      return;
    }

    if (discountPercent < 0 || discountPercent > 100) {
      toast.error("Discount must be between 0 and 100%");
      return;
    }

    if (
      form.payment_method === "bank" &&
      amountPaid > 0 &&
      !form.bank_account_id
    ) {
      toast.error("Select the bank where the payment was received");
      return;
    }

    if (!customerValid) {
      toast.error(
        form.customer_mode === "regular"
          ? "Select a customer"
          : "Enter the walking buyer's name"
      );
      return;
    }

    if (!form.factory_id) {
      toast.error("Select a factory");
      return;
    }

    if (!form.payment_method) {
      toast.error("Select a payment method");
      return;
    }

    if (lineProblem) {
      toast.error(lineProblem);
      return;
    }

    const lineKeys = form.lines.map((line) => `${line.item_id}:${line.batch_id || ""}`);
    if (new Set(lineKeys).size !== lineKeys.length) {
      toast.error("Each SKU/batch combination can only appear once per sale");
      return;
    }

    const storeCreditApplied = editingOrder ? 0 : Number(form.store_credit_applied) || 0;
    if (storeCreditApplied > (selectedCustomerCredit?.store_credit_balance ?? 0)) {
      toast.error("Store credit applied exceeds the customer's available wallet balance");
      return;
    }
    if (amountPaid + withholdingAmount + storeCreditApplied > computedTotal + 0.01) {
      toast.error("Amount paid, withholding, and store credit together exceed the sale total");
      return;
    }

    const lines = form.lines.map((line) => {
      const selectedItem = inventoryItems.find((item) => item.id === line.item_id);
      if (!selectedItem) throw new Error("Selected inventory SKU not found");
      return {
        item_id: line.item_id,
        batch_id: line.batch_id || undefined,
        description: selectedItem.name,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
      };
    });

    const sharedFields = {
      factory_id: form.factory_id,
      delivery_date: form.delivery_date || undefined,
      amount_paid: editingOrder ? undefined : amountPaid,
      discount_percent: discountPercent,
      payment_method: form.payment_method,
      bank_account_id: form.payment_method === "bank" ? form.bank_account_id || undefined : undefined,
      requires_invoice: form.requires_invoice,
      pending_pickup: editingOrder ? undefined : form.prepaid_advance || form.pending_pickup,
      prepaid_advance: editingOrder ? undefined : form.prepaid_advance,
      vat_applied: editingOrder ? undefined : form.vat_applied,
      withholding_applied: editingOrder ? undefined : form.withholding_applied,
      store_credit_applied: editingOrder ? undefined : storeCreditApplied || undefined,
      lines,
    };

    const walkingPayload = {
      name: form.walking_buyer.name.trim(),
      phone: form.walking_buyer.phone || undefined,
      tin: form.walking_buyer.tin || undefined,
      convert_to_regular: form.walking_buyer.convert_to_regular,
    };

    const payload = editingOrder
      ? form.customer_mode === "walking"
        ? {
            action: "update",
            id: editingOrder.id,
            ...sharedFields,
            walking_customer: walkingPayload,
          }
        : {
            action: "update",
            id: editingOrder.id,
            ...sharedFields,
            customer_id: form.customer_id,
          }
      : form.customer_mode === "walking"
        ? {
            ...sharedFields,
            walking_customer: walkingPayload,
          }
        : {
            ...sharedFields,
            customer_id: form.customer_id,
          };

    mutate.mutate(payload, {
      onSuccess: () => {
        toast.success(editingOrder ? "Sale updated" : "Sale created");
        setFormOpen(false);
        setEditingOrder(null);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Sale action failed"),
    });
  };

  const handleMarkPicked = async (order: Order) => {
    if (!canManage || order.status !== "ordered") return;
    if (order.prepaid_advance) {
      openPickupDialog(order);
      return;
    }
    try {
      await mutate.mutateAsync({
        action: "update_status",
        id: order.id,
        status: "picked",
      });
      toast.success(`Sale ${order.order_number} marked as picked`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    }
  };

  const openPickupDialog = (order: Order) => {
    setPickupTarget(order);
    const defaults: Record<string, string> = {};
    for (const line of order.items ?? []) {
      const remaining = orderLineRemaining(line);
      const available = line.batch_id ? batchAvailable(line.batch_id) : remaining;
      defaults[line.id] = String(Math.min(remaining, available));
    }
    setPickupQuantities(defaults);
  };

  const submitPickup = () => {
    if (!pickupTarget) return;
    const pickups = (pickupTarget.items ?? [])
      .map((line) => ({
        order_item_id: line.id,
        quantity: Number(pickupQuantities[line.id]) || 0,
      }))
      .filter((p) => p.quantity > 0);

    if (pickups.length === 0) {
      toast.error("Enter a pickup quantity greater than zero");
      return;
    }

    mutate.mutate(
      { action: "record_pickup", id: pickupTarget.id, pickups },
      {
        onSuccess: () => {
          toast.success(`Pickup recorded for ${pickupTarget.order_number}`);
          setPickupTarget(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Pickup failed"),
      }
    );
  };

  const handleRecyclingStageChange = (order: Order, stage: RecyclingOrderStage) => {
    if (!canManage) {
      toast.error("You don't have permission to manage sales");
      return;
    }
    mutate.mutate(
      { action: "update_recycling_stage", id: order.id, stage },
      {
        onSuccess: () =>
          toast.success(`Sale ${order.order_number} updated to ${RECYCLING_STAGE_LABELS[stage]}`),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Status update failed"),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    mutate.mutate(
      { action: "delete", id: deleteTarget.id },
      {
        onSuccess: () => {
          toast.success("Sale cancelled");
          setDeleteTarget(null);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Delete failed"),
      }
    );
  };

  const openSettle = (order: Order) => {
    setSettleTarget(order);
    setSettleRefundAmount(String(order.amount_paid ?? 0));
    setSettleBalancePaymentAmount("0");
  };

  const settleCustomerBalance = settleTarget?.customer?.balance ?? 0;

  const settleRefundClamped = useMemo(() => {
    const paid = Number(settleTarget?.amount_paid ?? 0);
    return Math.min(paid, Math.max(0, Number(settleRefundAmount) || 0));
  }, [settleTarget, settleRefundAmount]);

  const settleBalancePaymentClamped = useMemo(() => {
    const paid = Number(settleTarget?.amount_paid ?? 0);
    const remainingAfterRefund = Math.max(0, paid - settleRefundClamped);
    return Math.min(
      remainingAfterRefund,
      settleCustomerBalance,
      Math.max(0, Number(settleBalancePaymentAmount) || 0)
    );
  }, [settleTarget, settleRefundClamped, settleBalancePaymentAmount, settleCustomerBalance]);

  const settleCreditAmount = useMemo(() => {
    const paid = Number(settleTarget?.amount_paid ?? 0);
    return Math.max(0, paid - settleRefundClamped - settleBalancePaymentClamped);
  }, [settleTarget, settleRefundClamped, settleBalancePaymentClamped]);

  const startExchangeOrder = (customer: Customer) => {
    const isWalking = (customer.customer_type ?? "regular") === "walking";
    openCreate();
    setForm((f) => ({
      ...f,
      customer_mode: isWalking ? "walking" : "regular",
      customer_id: isWalking ? "" : customer.id,
      walking_buyer: isWalking
        ? {
            name: customer.name,
            phone: customer.phone ?? "",
            tin: customer.tin ?? "",
            convert_to_regular: false,
          }
        : f.walking_buyer,
    }));
    toast.success(`Store credit ready for ${customer.name} — apply it on the new sale.`);
  };

  const handleSettle = () => {
    if (!settleTarget) return;
    const customer = settleTarget.customer;
    const creditIssued = settleCreditAmount;
    mutate.mutate(
      {
        action: "cancel_with_settlement",
        id: settleTarget.id,
        refund_amount: settleRefundClamped,
        balance_payment_amount: settleBalancePaymentClamped,
        credit_amount: creditIssued,
      },
      {
        onSuccess: () => {
          toast.success("Sale cancelled and payment settled");
          setSettleTarget(null);
          if (creditIssued > 0 && customer) {
            startExchangeOrder(customer);
          }
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Settlement failed"),
      }
    );
  };

  const recyclingColumns = (): DataTableColumn<Order>[] => [
    {
      id: "order",
      header: "Sale #",
      cell: (row) => <span className="font-mono text-sm">{row.order_number}</span>,
    },
    { id: "customer", header: "Customer", cell: (row) => row.customer?.name ?? "—" },
    { id: "amount", header: "Amount", cell: (row) => formatCurrency(row.total_amount) },
    {
      id: "stage",
      header: "Stage",
      cell: (row) =>
        canManage ? (
          <Select
            value={row.recycling_stage ?? "pending"}
            onValueChange={(v) => handleRecyclingStageChange(row, v as RecyclingOrderStage)}
          >
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECYCLING_STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>
                  {RECYCLING_STAGE_LABELS[stage]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline">{RECYCLING_STAGE_LABELS[row.recycling_stage ?? "pending"]}</Badge>
        ),
    },
    {
      id: "created",
      header: "Created At",
      cell: (row) => (row.created_at ? formatDate(row.created_at) : "—"),
    },
    {
      id: "delivery",
      header: "Delivery Date",
      cell: (row) => (row.delivery_date ? formatDate(row.delivery_date) : "—"),
    },
    {
      id: "actions",
      header: "",
      cell: (row) =>
        canManage ? (
          <RowActions onEdit={() => openEdit(row)} onDelete={() => setDeleteTarget(row)} />
        ) : null,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Sales"
        description="Sales are picked by default. Credit is applied to the customer account immediately unless you hold the sale for later pickup."
        actions={
          <div className="flex items-center gap-3">
            {riskCount > 0 && (
              <Badge variant="destructive" className="gap-1 px-3 py-1">
                <AlertTriangle className="size-3.5" />
                {riskCount} AI risk flag{riskCount > 1 ? "s" : ""}
              </Badge>
            )}
            {canManage && (
              <Button onClick={openCreate} className="gap-1.5 shadow-sm">
                <Plus className="size-4" />
                New Sales
              </Button>
            )}
          </div>
        }
      />

      {isRecyclingScope ? (
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">Pending ({recyclingPendingOrders.length})</TabsTrigger>
            <TabsTrigger value="accepted">Accepted ({recyclingAcceptedOrders.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({recyclingCompletedOrders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Pending Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={recyclingPendingOrders}
                  getRowKey={(row) => row.id}
                  emptyMessage="No pending sales"
                  columns={recyclingColumns()}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="accepted">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Accepted Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={recyclingAcceptedOrders}
                  getRowKey={(row) => row.id}
                  emptyMessage="No accepted sales"
                  columns={recyclingColumns()}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="completed">
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Completed Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable
                  data={recyclingCompletedOrders}
                  getRowKey={(row) => row.id}
                  emptyMessage="No completed sales"
                  columns={recyclingColumns()}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
      <Tabs defaultValue="picked">
        <TabsList>
          <TabsTrigger value="picked">
            Picked ({pickedOrders.length})
          </TabsTrigger>
          <TabsTrigger value="ordered">
            Pending Pickup ({orderedOrders.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="picked">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Picked Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={pickedOrders}
                getRowKey={(row) => row.id}
                emptyMessage="No picked sales yet"
                columns={[
                  {
                    id: "order",
                    header: "Sale #",
                    cell: (row) => (
                      <span className="font-mono text-sm">{row.order_number}</span>
                    ),
                  },
                  {
                    id: "customer",
                    header: "Customer",
                    cell: (row) => row.customer?.name ?? "—",
                  },
                  {
                    id: "paid",
                    header: "Paid",
                    cell: (row) => formatCurrency(row.amount_paid ?? 0),
                  },
                  {
                    id: "credit",
                    header: "Credit",
                    cell: (row) => formatCurrency(orderCreditAmount(row)),
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => (
                      <div className="flex flex-col">
                        <span>{formatCurrency(row.total_amount)}</span>
                        {(row.discount_percent ?? 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {row.discount_percent}% off
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "payment",
                    header: "Payment",
                    cell: (row) => row.payment_method ?? "—",
                  },
                  {
                    id: "invoice",
                    header: "Invoice",
                    cell: (row) =>
                      row.requires_invoice ? (
                        <Badge variant="outline">Yes</Badge>
                      ) : (
                        "—"
                      ),
                  },
                  {
                    id: "created",
                    header: "Created At",
                    cell: (row) => (row.created_at ? formatDate(row.created_at) : "—"),
                  },
                  {
                    id: "delivery",
                    header: "Pickup Date",
                    cell: (row) =>
                      row.delivery_date ? formatDate(row.delivery_date) : "—",
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordered">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Pending Pickup</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={orderedOrders}
                getRowKey={(row) => row.id}
                emptyMessage="No sales waiting for pickup"
                columns={[
                  {
                    id: "order",
                    header: "Sale #",
                    cell: (row) => (
                      <span className="font-mono text-sm">{row.order_number}</span>
                    ),
                  },
                  {
                    id: "customer",
                    header: "Customer",
                    cell: (row) => row.customer?.name ?? "—",
                  },
                  {
                    id: "type",
                    header: "Customer",
                    cell: (row) => {
                      const type = row.customer?.customer_type;
                      return (
                        <Badge variant="outline" className="text-[10px]">
                          {type === "walking" ? "Walking" : "Regular"}
                        </Badge>
                      );
                    },
                  },
                  {
                    id: "paid",
                    header: "Paid",
                    cell: (row) => formatCurrency(row.amount_paid ?? 0),
                  },
                  {
                    id: "credit",
                    header: "Credit",
                    cell: (row) => formatCurrency(orderCreditAmount(row)),
                  },
                  {
                    id: "amount",
                    header: "Amount",
                    cell: (row) => (
                      <div className="flex flex-col">
                        <span>{formatCurrency(row.total_amount)}</span>
                        {(row.discount_percent ?? 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {row.discount_percent}% off
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    id: "payment",
                    header: "Payment",
                    cell: (row) => row.payment_method ?? "—",
                  },
                  {
                    id: "created",
                    header: "Created At",
                    cell: (row) => (row.created_at ? formatDate(row.created_at) : "—"),
                  },
                  {
                    id: "fulfillment",
                    header: "Fulfilled",
                    cell: (row) => {
                      if (!row.prepaid_advance || !row.items?.length) return "—";
                      const ordered = row.items.reduce((s, l) => s + l.quantity, 0);
                      const fulfilled = row.items.reduce(
                        (s, l) => s + Number(l.quantity_fulfilled ?? 0),
                        0
                      );
                      return `${fulfilled.toLocaleString()} / ${ordered.toLocaleString()}`;
                    },
                  },
                  {
                    id: "delivery",
                    header: "Pickup Date",
                    cell: (row) =>
                      row.delivery_date ? formatDate(row.delivery_date) : "—",
                  },
                  {
                    id: "actions",
                    header: "",
                    cell: (row) =>
                      canManage ? (
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            disabled={mutate.isPending}
                            onClick={() =>
                              row.prepaid_advance
                                ? openPickupDialog(row)
                                : handleMarkPicked(row)
                            }
                          >
                            <CheckCircle2 className="size-3.5" />
                            {row.prepaid_advance ? "Record Pickup" : "Mark Picked"}
                          </Button>
                          <RowActions
                            onEdit={() => openEdit(row)}
                            onDelete={(row.amount_paid ?? 0) > 0 ? undefined : () => setDeleteTarget(row)}
                            extraActions={
                              (row.amount_paid ?? 0) > 0
                                ? [{ label: "Cancel & Settle", onClick: () => openSettle(row) }]
                                : []
                            }
                          />
                        </div>
                      ) : null,
                  },
                ]}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      )}

      <EntityFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingOrder ? "Edit Sale" : "New Sales"}
        description={
          editingOrder
            ? "Update sale lines, delivery date, customer, or factory."
            : "Create a sale linked to finished goods inventory."
        }
        submitLabel={editingOrder ? "Save Changes" : "Create Sale"}
        isSubmitting={mutate.isPending}
        contentClassName="sm:max-w-2xl"
        onSubmit={handleSubmit}
      >
        <div className="space-y-3">
          <Label>Customer</Label>
          <Tabs
            value={form.customer_mode}
            onValueChange={(v) =>
              setForm((f) => ({ ...f, customer_mode: v as CustomerMode }))
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="regular">Regular Customer</TabsTrigger>
              <TabsTrigger value="walking">Walking Customer</TabsTrigger>
            </TabsList>

            <TabsContent value="regular" className="space-y-2">
              <Select
                value={form.customer_id}
                onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}
              >
                <SelectTrigger id="order-customer">
                  <SelectValue placeholder="Select regular customer" />
                </SelectTrigger>
                <SelectContent>
                  {regularCustomers.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No regular customers available
                    </SelectItem>
                  ) : (
                    regularCustomers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.phone ? ` · ${c.phone}` : ""}
                        {c.balance > 0 ? ` · ${formatCurrency(c.balance)} owed` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </TabsContent>

            <TabsContent value="walking" className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="walking-name">Buyer Name</Label>
                <Input
                  id="walking-name"
                  placeholder="Enter buyer name"
                  value={form.walking_buyer.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      walking_buyer: { ...f.walking_buyer, name: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="walking-phone">Phone (optional)</Label>
                  <Input
                    id="walking-phone"
                    placeholder="+234 ..."
                    value={form.walking_buyer.phone}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        walking_buyer: { ...f.walking_buyer, phone: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="walking-tin">TIN (optional)</Label>
                  <Input
                    id="walking-tin"
                    placeholder="Tax ID number"
                    value={form.walking_buyer.tin}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        walking_buyer: { ...f.walking_buyer, tin: e.target.value },
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="convert-regular"
                  checked={form.walking_buyer.convert_to_regular}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      walking_buyer: {
                        ...f.walking_buyer,
                        convert_to_regular: checked === true,
                      },
                    }))
                  }
                />
                <Label htmlFor="convert-regular" className="cursor-pointer font-normal">
                  Convert to regular customer
                </Label>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="order-factory">Factory</Label>
            <Select
              value={form.factory_id}
              onValueChange={(v) => {
                if (v === FACTORY_IDS.block) {
                  setForm((f) => ({ ...f, factory_id: v, lines: [newBlockLine()] }));
                  return;
                }
                const fg = finishedGoodsForFactory(v);
                const first = fg[0];
                setForm((f) => ({
                  ...f,
                  factory_id: v,
                  lines: [
                    newLine(first?.id ?? ""),
                  ],
                }));
              }}
            >
              <SelectTrigger id="order-factory">
                <SelectValue placeholder="Select factory" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FACTORY_NAMES).map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-delivery">Delivery Date</Label>
            <Input
              id="order-delivery"
              type="date"
              value={form.delivery_date}
              onChange={(e) => setForm((f) => ({ ...f, delivery_date: e.target.value }))}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="order-discount">Discount (%)</Label>
          <Input
            id="order-discount"
            type="number"
            min="0"
            max="100"
            step="0.01"
            placeholder="0"
            value={form.discount_percent}
            onChange={(e) =>
              setForm((f) => ({ ...f, discount_percent: e.target.value }))
            }
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Sale Lines</Label>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addLine}>
              <Plus className="size-3.5" />
              Add line
            </Button>
          </div>

          {form.lines.map((line, index) => (
            <div
              key={line.key}
              className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Line {index + 1}</p>
                {form.lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => removeLine(line.key)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                )}
              </div>
              {form.factory_id === FACTORY_IDS.block ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Block Type</Label>
                      <Select
                        value={line.block_size_cm}
                        onValueChange={(v) => {
                          updateLine(line.key, {
                            block_size_cm: v,
                            batch_id: "",
                            item_id: "",
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select block type" />
                        </SelectTrigger>
                        <SelectContent>
                          {BLOCK_SIZE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label} block
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Batch</Label>
                      <Select
                        value={line.batch_id}
                        onValueChange={(v) => {
                          const batch = orderableBlockBatches.find((b) => b.id === v);
                          const size = parseBlockSizeCm(batch?.block_size_cm) as BlockSizeCm | null;
                          const item = size
                            ? inventoryItems.find(
                                (i) =>
                                  i.sku === finishedGoodsSku(size) && i.factory_id === FACTORY_IDS.block
                              )
                            : undefined;
                          if (!item) toast.error(missingFgSkuMessage(line.block_size_cm));
                          updateLine(line.key, {
                            batch_id: v,
                            item_id: item?.id ?? "",
                          });
                        }}
                        disabled={!line.block_size_cm}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {batchesForSize(line.block_size_cm).length === 0 ? (
                            <p className="px-2 py-1.5 text-xs text-muted-foreground">
                              No batches with stock left for this size
                            </p>
                          ) : (
                            batchesForSize(line.block_size_cm).map((b) => (
                              <SelectItem key={b.id} value={b.id}>
                                {batchLabel(b)} — {batchAvailable(b.id)} left
                                {b.status === "completed" ? " · finished" : ""}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {line.batch_id && (
                    <p className="text-[10px] text-muted-foreground">
                      {batchAvailable(line.batch_id)} pieces available in this batch
                      {form.prepaid_advance &&
                        Number(line.quantity) > batchAvailable(line.batch_id) && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {" "}
                            · {Number(line.quantity) - batchAvailable(line.batch_id)} will be
                            fulfilled as production continues
                          </span>
                        )}
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  <Label>Finished Goods SKU</Label>
                  <Select
                    value={line.item_id}
                    onValueChange={(v) => {
                      updateLine(line.key, {
                        item_id: v,
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select inventory SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {finishedGoodsForFactory(form.factory_id).map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.sku} — {item.name} ({getAvailableQuantity(item)} available)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    max={
                      form.prepaid_advance || !line.batch_id
                        ? undefined
                        : batchAvailable(line.batch_id)
                    }
                    placeholder="0"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit Price</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={line.unit_price}
                    onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payment & Billing Section at the Bottom */}
        <div className="border-t border-border/60 pt-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Payment & Billing</h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="order-payment">Payment Method</Label>
              <Select
                value={form.payment_method}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    payment_method: v as PaymentMethod,
                    bank_account_id: v === "bank" ? f.bank_account_id : "",
                  }))
                }
              >
                <SelectTrigger id="order-payment">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="order-amount-paid">Amount Paid Now</Label>
              <Input
                id="order-amount-paid"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                disabled={!!editingOrder}
                value={form.amount_paid}
                onChange={(e) => setForm((f) => ({ ...f, amount_paid: e.target.value }))}
              />
            </div>
          </div>

          {form.payment_method === "bank" && (
            <BankSelect
              id="order-bank"
              value={form.bank_account_id}
              onChange={(bank_account_id) => setForm((f) => ({ ...f, bank_account_id }))}
              required
            />
          )}

          {!editingOrder && storeCreditAvailable > 0 && (
            <div className="space-y-2">
              <Label htmlFor="order-store-credit">
                Apply Store Credit (up to {formatCurrency(storeCreditAvailable)} available)
              </Label>
              <Input
                id="order-store-credit"
                type="number"
                min="0"
                step="0.01"
                max={Math.min(storeCreditAvailable, computedTotal)}
                placeholder="0.00"
                value={form.store_credit_applied}
                onChange={(e) =>
                  setForm((f) => ({ ...f, store_credit_applied: e.target.value }))
                }
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4 py-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="requires-invoice"
                checked={form.requires_invoice}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, requires_invoice: checked === true }))
                }
              />
              <Label htmlFor="requires-invoice" className="cursor-pointer font-normal">
                Invoice
              </Label>
            </div>
            {!editingOrder && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="vat-applied"
                  checked={form.vat_applied}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, vat_applied: checked === true }))
                  }
                />
                <Label htmlFor="vat-applied" className="cursor-pointer font-normal">
                  Sell with VAT ({vatRatePercent}%)
                </Label>
              </div>
            )}
            {editingOrder && editingOrder.vat_applied && (
              <Badge variant="outline" className="text-[10px]">
                VAT applied at creation ({editingOrder.vat_rate_percent ?? 0}% ·{" "}
                {formatCurrency(vatAmount)}) — locked, not editable
              </Badge>
            )}
            {!editingOrder && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="withholding-applied"
                  checked={form.withholding_applied}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, withholding_applied: checked === true }))
                  }
                />
                <Label htmlFor="withholding-applied" className="cursor-pointer font-normal">
                  Withholding Tax ({withholdingRatePercent}%)
                </Label>
              </div>
            )}
            {editingOrder && editingOrder.withholding_applied && (
              <Badge variant="outline" className="text-[10px]">
                Withholding applied at creation ({editingOrder.withholding_rate_percent ?? 0}% ·{" "}
                {formatCurrency(withholdingAmount)}) — locked, not editable
              </Badge>
            )}
            {!editingOrder && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="prepaid-advance"
                  checked={form.prepaid_advance}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      prepaid_advance: checked === true,
                      pending_pickup: checked === true ? true : f.pending_pickup,
                    }))
                  }
                />
                <Label htmlFor="prepaid-advance" className="cursor-pointer font-normal">
                  Prepaid — pick up as produced
                </Label>
              </div>
            )}
            {!editingOrder && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="pending-pickup"
                  checked={form.pending_pickup || form.prepaid_advance}
                  disabled={form.prepaid_advance}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, pending_pickup: checked === true }))
                  }
                />
                <Label htmlFor="pending-pickup" className="cursor-pointer font-normal">
                  Hold for later pickup
                </Label>
              </div>
            )}
          </div>

          {/* Credit Risk warning & Customer Credit Score info */}
          {(creditRiskWarning || (selectedCustomerFactoryScore?.score != null && !creditRiskWarning)) && (
            <div className="bg-muted/40 p-2.5 rounded-lg border border-border/40 space-y-1">
              {creditRiskWarning && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 font-medium">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {creditRiskWarning}
                </p>
              )}
              {selectedCustomerFactoryScore?.score != null && !creditRiskWarning && (
                <p className="text-xs text-muted-foreground">
                  {isRecyclingOrder ? "Recycling" : "Block"} credit score {selectedCustomerFactoryScore.score}
                  {selectedCustomerFactoryScore.tier ? ` · ${selectedCustomerFactoryScore.tier}` : ""}
                  {selectedCustomerFactoryScore.limit != null
                    ? ` · limit ${formatCurrency(Number(selectedCustomerFactoryScore.limit))}`
                    : ""}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pricing Summary & Payment Status Comparison Panel */}
        <div className="grid gap-4 sm:grid-cols-2 bg-muted/20 p-4 rounded-xl border border-border/60">
          <div className="space-y-2">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pricing Summary</h4>
            <div className="text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(computedSubtotal)}</span>
              </div>
              {discountPercent > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <span>Discount ({discountPercent}%)</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {vatAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    VAT (
                    {editingOrder
                      ? editingOrder.vat_rate_percent ?? 0
                      : vatRatePercent}
                    %)
                  </span>
                  <span>{formatCurrency(vatAmount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-1.5 font-bold text-sm text-foreground">
                <span>Sale Total</span>
                <span>{formatCurrency(computedTotal)}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 border-t sm:border-t-0 sm:border-l border-border/60 pt-2.5 sm:pt-0 sm:pl-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Payment Status</h4>
            <div className="text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Sale Total</span>
                <span className="font-semibold">{formatCurrency(computedTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-primary">
                <span>Amount Paid Now</span>
                <span className="font-semibold">{formatCurrency(Number(form.amount_paid) || 0)}</span>
              </div>
              {withholdingAmount > 0 && (
                <div className="flex justify-between items-center text-primary">
                  <span>Withholding ({withholdingRatePercent}%)</span>
                  <span className="font-semibold">{formatCurrency(withholdingAmount)}</span>
                </div>
              )}
              {storeCreditAppliedNumber > 0 && (
                <div className="flex justify-between items-center text-primary">
                  <span>Store Credit Applied</span>
                  <span className="font-semibold">{formatCurrency(storeCreditAppliedNumber)}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-border/60 pt-1.5 font-bold text-sm text-foreground">
                <span>Remaining Balance</span>
                <span className={creditPreview > 0 ? "text-amber-600 dark:text-amber-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>
                  {formatCurrency(creditPreview)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </EntityFormDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Cancel Sale"
        description={`Are you sure you want to cancel sale ${deleteTarget?.order_number}? This action cannot be undone.`}
        confirmLabel="Cancel Sale"
        variant="destructive"
        loading={mutate.isPending}
        onConfirm={handleDelete}
      />

      <EntityFormDialog
        open={!!settleTarget}
        onOpenChange={(open) => !open && setSettleTarget(null)}
        title="Cancel & Settle Payment"
        description={`Sale ${settleTarget?.order_number} was paid but never picked up. Split the ${formatCurrency(
          Number(settleTarget?.amount_paid ?? 0)
        )} already paid between a cash refund, paying down any previous balance, and store credit.`}
        submitLabel="Cancel Sale & Settle"
        isSubmitting={mutate.isPending}
        onSubmit={handleSettle}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settle-refund">Refund Amount</Label>
            <Input
              id="settle-refund"
              type="number"
              min="0"
              step="0.01"
              max={Number(settleTarget?.amount_paid ?? 0)}
              value={settleRefundAmount}
              onChange={(e) => setSettleRefundAmount(e.target.value)}
            />
          </div>

          {settleCustomerBalance > 0 && (
            <div className="space-y-2">
              <Label htmlFor="settle-balance-payment">
                Apply to Previous Balance (customer owes {formatCurrency(settleCustomerBalance)})
              </Label>
              <Input
                id="settle-balance-payment"
                type="number"
                min="0"
                step="0.01"
                max={Math.min(
                  settleCustomerBalance,
                  Math.max(0, Number(settleTarget?.amount_paid ?? 0) - settleRefundClamped)
                )}
                value={settleBalancePaymentAmount}
                onChange={(e) => setSettleBalancePaymentAmount(e.target.value)}
              />
            </div>
          )}

          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount Paid</span>
              <span>{formatCurrency(Number(settleTarget?.amount_paid ?? 0))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Refunded (cash)</span>
              <span>{formatCurrency(settleRefundClamped)}</span>
            </div>
            {settleCustomerBalance > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Applied to Previous Balance</span>
                <span>{formatCurrency(settleBalancePaymentClamped)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-border/60 mt-1 pt-1">
              <span>Kept as Store Credit</span>
              <span>{formatCurrency(settleCreditAmount)}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Reserved stock from this sale is released. To keep the sale but change what was
            sold instead, close this and use Edit on the sale — no cancellation needed. Any
            amount kept as store credit opens a new sale for this customer, ready to apply
            toward different items (e.g. exchanging 20cm blocks for 24cm).
          </p>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={!!pickupTarget}
        onOpenChange={(open) => !open && setPickupTarget(null)}
        title="Record Pickup"
        description={
          pickupTarget
            ? `Sale ${pickupTarget.order_number} — record how many pieces the customer is taking now. The sale stays open until fully fulfilled.`
            : undefined
        }
        submitLabel="Record Pickup"
        isSubmitting={mutate.isPending}
        onSubmit={submitPickup}
      >
        <div className="space-y-4">
          {(pickupTarget?.items ?? []).map((line) => {
            const remaining = orderLineRemaining(line);
            const availableNow = line.batch_id ? batchAvailable(line.batch_id) : remaining;
            const maxPickup = Math.min(remaining, availableNow);
            return (
              <div
                key={line.id}
                className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3"
              >
                <p className="text-sm font-medium">{line.description}</p>
                <p className="text-xs text-muted-foreground">
                  Sold {line.quantity.toLocaleString()} · Picked up{" "}
                  {Number(line.quantity_fulfilled ?? 0).toLocaleString()} · Remaining{" "}
                  {remaining.toLocaleString()} · Available now {availableNow.toLocaleString()}
                </p>
                <div className="space-y-1.5">
                  <Label>Pickup now</Label>
                  <Input
                    type="number"
                    min={0}
                    max={maxPickup}
                    step={1}
                    value={pickupQuantities[line.id] ?? ""}
                    onChange={(e) =>
                      setPickupQuantities((prev) => ({ ...prev, [line.id]: e.target.value }))
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </EntityFormDialog>
    </div>
  );
}
