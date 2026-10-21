import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import {
  aggregateCustomerOrderStats,
  aggregateCustomerPayments,
  aggregateCustomerRefunds,
  countOpenOrdersForCustomer,
} from "@/lib/services/customer-order-sync";
import type { Customer, CustomerSummary, CustomerType, OrderStatus } from "@/types";

const OPEN_ORDER_STATUSES: OrderStatus[] = ["ordered"];

function mapCustomerRow(
  row: Record<string, unknown>,
  stats?: {
    order_count: number;
    pipeline_value: number;
    picked_value: number;
    open_order_count: number;
    total_paid: number;
    total_refunded: number;
    pending_order_credit: number;
  }
): CustomerSummary {
  const customer = row as unknown as Customer;
  const totalPaid = stats?.total_paid ?? 0;
  const totalRefunded = stats?.total_refunded ?? 0;
  return {
    ...customer,
    customer_type: (customer.customer_type ?? "regular") as CustomerType,
    balance: Number(customer.balance),
    order_count: stats?.order_count ?? 0,
    pipeline_value: stats?.pipeline_value ?? 0,
    picked_value: stats?.picked_value ?? 0,
    open_order_count: stats?.open_order_count ?? 0,
    total_paid: totalPaid,
    total_refunded: totalRefunded,
    net_paid: totalPaid - totalRefunded,
    pending_order_credit: stats?.pending_order_credit ?? 0,
  };
}

export async function fetchCustomersData(orgId: string): Promise<CustomerSummary[]> {
  const supabase = await createClient();

  const [
    { data: customers, error: customersError },
    { data: orders, error: ordersError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .eq("organization_id", orgId)
      .order("name", { ascending: true }),
    supabase
      .from("orders")
      .select("customer_id, status, total_amount, amount_paid")
      .eq("organization_id", orgId),
    supabase
      .from("customer_payments")
      .select("customer_id, amount, kind")
      .eq("organization_id", orgId),
  ]);

  if (customersError) throw new Error(customersError.message);
  if (ordersError) throw new Error(ordersError.message);
  if (paymentsError) throw new Error(paymentsError.message);

  const statsByCustomer = aggregateCustomerOrderStats(
    (orders ?? []) as Array<{
      customer_id: string;
      status: OrderStatus;
      total_amount: number;
      amount_paid?: number | null;
    }>
  );
  const paidByCustomer = aggregateCustomerPayments(
    (payments ?? []) as Array<{ customer_id: string; amount: number; kind?: string | null }>
  );
  const refundedByCustomer = aggregateCustomerRefunds(
    (payments ?? []) as Array<{ customer_id: string; amount: number; kind?: string | null }>
  );

  const openByCustomer = new Map<string, number>();
  for (const order of orders ?? []) {
    if (!OPEN_ORDER_STATUSES.includes(order.status as OrderStatus)) continue;
    const customerId = order.customer_id as string;
    openByCustomer.set(customerId, (openByCustomer.get(customerId) ?? 0) + 1);
  }

  return (customers ?? []).map((row) => {
    const stats = statsByCustomer.get(row.id as string);
    return mapCustomerRow(row as Record<string, unknown>, {
      order_count: stats?.order_count ?? 0,
      pipeline_value: stats?.pipeline_value ?? 0,
      picked_value: stats?.picked_value ?? 0,
      open_order_count: openByCustomer.get(row.id as string) ?? 0,
      total_paid: paidByCustomer.get(row.id as string) ?? 0,
      total_refunded: refundedByCustomer.get(row.id as string) ?? 0,
      pending_order_credit: stats?.pending_order_credit ?? 0,
    });
  });
}

export async function insertCustomer(
  input: {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    tin?: string;
    customer_type?: CustomerType;
    balance?: number;
  },
  user: ApiUser
): Promise<CustomerSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .insert({
      organization_id: user.organization_id,
      name: input.name.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      tin: input.tin?.trim() || null,
      customer_type: input.customer_type ?? "regular",
      balance: input.balance ?? 0,
      is_active: true,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  return mapCustomerRow(data as Record<string, unknown>);
}

export async function updateCustomerRecord(
  id: string,
  input: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    tin?: string;
    customer_type?: CustomerType;
    balance?: number;
  },
  user: ApiUser
): Promise<CustomerSummary> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("customers")
    .update({
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.tin !== undefined ? { tin: input.tin?.trim() || null } : {}),
      ...(input.customer_type != null ? { customer_type: input.customer_type } : {}),
      ...(input.balance != null ? { balance: input.balance } : {}),
    })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const service = await createServiceClient();
  const { data: orders } = await service
    .from("orders")
    .select("customer_id, status, total_amount")
    .eq("organization_id", user.organization_id)
    .eq("customer_id", id);

  const stats = aggregateCustomerOrderStats(
    (orders ?? []) as Array<{ customer_id: string; status: OrderStatus; total_amount: number }>
  ).get(id);

  const open_order_count = await countOpenOrdersForCustomer(service, id, user.organization_id);

  return mapCustomerRow(data as Record<string, unknown>, {
    order_count: stats?.order_count ?? 0,
    pipeline_value: stats?.pipeline_value ?? 0,
    picked_value: stats?.picked_value ?? 0,
    open_order_count,
    total_paid: 0,
    total_refunded: 0,
    pending_order_credit: stats?.pending_order_credit ?? 0,
  });
}

export async function deactivateCustomerRecord(id: string, user: ApiUser): Promise<Customer> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const openOrders = await countOpenOrdersForCustomer(service, id, user.organization_id);
  if (openOrders > 0) {
    throw new Error(
      `Cannot deactivate customer with ${openOrders} open order(s). Complete or cancel them first.`
    );
  }

  const { data, error } = await supabase
    .from("customers")
    .update({ is_active: false })
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as Customer;
}

export async function assertCustomerIsActive(customerId: string, orgId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, is_active")
    .eq("id", customerId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Customer not found");
  if (!data.is_active) throw new Error("Cannot use an inactive customer on new orders");
}

export async function convertWalkingToRegular(
  id: string,
  user: ApiUser
): Promise<CustomerSummary> {
  return updateCustomerRecord(id, { customer_type: "regular" }, user);
}
