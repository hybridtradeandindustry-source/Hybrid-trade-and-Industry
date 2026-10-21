import type { CustomerPaymentKind, CustomerSummary, Order, OrderItem, OrderStatus } from "@/types";
import type { CustomerPayment } from "@/types";

export type CustomerBatchRef = {
  id: string;
  batch_number: string;
  name?: string | null;
  block_size_cm?: number | null;
  status?: string | null;
};

export type CustomerOrderAllocation = {
  id: string;
  order_id: string;
  order_item_id?: string | null;
  batch_id: string;
  quantity: number;
  batch?: CustomerBatchRef | null;
};

export type EnrichedOrderItem = OrderItem & {
  batch?: CustomerBatchRef | null;
};

export type EnrichedCustomerOrder = Order & {
  items: EnrichedOrderItem[];
  production_batch?: CustomerBatchRef | null;
  allocations: CustomerOrderAllocation[];
  factory_label: string;
  unpaid_credit: number;
};

export type EnrichedCustomerPayment = CustomerPayment & {
  order?: Pick<Order, "id" | "order_number" | "status" | "total_amount"> | null;
  wallet_balance_after?: number | null;
};

export type StoreCreditLedgerEntry = {
  payment_id: string;
  date: string;
  kind: Extract<CustomerPaymentKind, "store_credit_issue" | "store_credit_apply">;
  amount: number;
  order_id?: string | null;
  order_number?: string | null;
  order_status?: OrderStatus | null;
  notes?: string | null;
  source_batches: CustomerBatchRef[];
  target_batches: CustomerBatchRef[];
  wallet_after: number;
};

export type ReceivableLedgerEntry = {
  id: string;
  date: string;
  kind: "pickup_credit" | "payment" | "settlement_to_balance" | "manual";
  amount: number;
  direction: "increase" | "decrease";
  order_id?: string | null;
  order_number?: string | null;
  description: string;
};

export type CustomerActivityEvent = {
  id: string;
  date: string;
  category: "sale" | "pickup" | "payment" | "refund" | "store_credit" | "cancellation";
  title: string;
  description: string;
  amount?: number;
  order_id?: string | null;
  order_number?: string | null;
  batches: CustomerBatchRef[];
};

export type CustomerDetail = {
  customer: CustomerSummary;
  payments: EnrichedCustomerPayment[];
  orders: EnrichedCustomerOrder[];
  storeCreditLedger: StoreCreditLedgerEntry[];
  receivableLedger: ReceivableLedgerEntry[];
  timeline: CustomerActivityEvent[];
  batchesInvolved: CustomerBatchRef[];
};

export function formatCustomerBatchLabel(batch: Pick<CustomerBatchRef, "batch_number" | "name">) {
  return batch.name ? `${batch.batch_number} — ${batch.name}` : batch.batch_number;
}
