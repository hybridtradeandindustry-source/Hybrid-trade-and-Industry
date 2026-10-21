import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { ApiUser } from "@/lib/api/auth-helpers";
import { buildExpenseAnalytics } from "@/lib/services/expense-analytics";
import type { FinancePeriod } from "@/lib/finance/periods";
import type {
  ExpenseCategory,
  ExpenseMetrics,
  ExpensesDataPayload,
  MaterialPurchase,
  OperatingExpense,
  PaymentMethod,
  SageTransaction,
  ViewScope,
} from "@/types";
import { FACTORY_IDS } from "@/types";

function scopeFactoryId(scope: ViewScope): string | null {
  if (scope === "block") return FACTORY_IDS.block;
  if (scope === "recycling") return FACTORY_IDS.recycling;
  return null;
}

function mapExpense(
  row: Record<string, unknown>,
  categoryById: Map<string, ExpenseCategory>
): OperatingExpense {
  const categoryId = row.category_id as string | null;
  const category = categoryId ? categoryById.get(categoryId) : undefined;
  return {
    id: row.id as string,
    organization_id: row.organization_id as string,
    factory_id: row.factory_id as string | null,
    category_id: categoryId,
    category_name: category?.name ?? null,
    category_code: category?.code ?? null,
    vendor_name: row.vendor_name as string | null,
    description: row.description as string,
    amount: Number(row.amount),
    expense_date: row.expense_date as string,
    payment_method: row.payment_method as PaymentMethod,
    bank_account_id: row.bank_account_id as string | null,
    reference: row.reference as string | null,
    notes: row.notes as string | null,
    status: row.status as OperatingExpense["status"],
    sage_transaction_id: row.sage_transaction_id as string | null,
    posted_at: row.posted_at as string | null,
    posted_by: row.posted_by as string | null,
    created_by: row.created_by as string | null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function computeMetrics(expenses: OperatingExpense[]): ExpenseMetrics {
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const pending = expenses.filter((e) => e.status === "pending");
  const postedThisMonth = expenses.filter(
    (e) => e.status === "posted" && e.expense_date >= monthStart
  );
  const postedAll = expenses.filter((e) => e.status === "posted");

  const categoryTotals = new Map<string, { amount: number; count: number }>();
  for (const exp of postedThisMonth) {
    const key = exp.category_name ?? exp.category_code ?? "Uncategorized";
    const cur = categoryTotals.get(key) ?? { amount: 0, count: 0 };
    categoryTotals.set(key, {
      amount: cur.amount + exp.amount,
      count: cur.count + 1,
    });
  }

  return {
    totalPending: pending.reduce((s, e) => s + e.amount, 0),
    pendingCount: pending.length,
    postedThisMonth: postedThisMonth.reduce((s, e) => s + e.amount, 0),
    postedCountThisMonth: postedThisMonth.length,
    totalPostedAllTime: postedAll.reduce((s, e) => s + e.amount, 0),
    byCategory: [...categoryTotals.entries()]
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export async function fetchExpensesData(
  scope: ViewScope,
  orgId: string,
  period: FinancePeriod = "this_month",
  periodOptions?: { dateFrom?: string; dateTo?: string; monthYear?: string }
): Promise<ExpensesDataPayload> {
  const supabase = await createClient();
  const factoryId = scopeFactoryId(scope);

  const [
    { data: categoriesRaw },
    { data: expensesRaw },
    { data: supplierPaymentRows },
    { data: purchasesRaw },
    { data: sageRaw },
    { data: payrollRaw },
  ] = await Promise.all([
    supabase
      .from("expense_categories")
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("sort_order"),
    (() => {
      let query = supabase
        .from("operating_expenses")
        .select("*")
        .eq("organization_id", orgId)
        .order("expense_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (factoryId) query = query.eq("factory_id", factoryId);
      return query;
    })(),
    supabase
      .from("supplier_payments")
      .select(
        "id, amount, payment_date, payment_method, reference, supplier:suppliers(name), purchase:material_purchases(factory_id, purchase_number)"
      )
      .eq("organization_id", orgId)
      .order("payment_date", { ascending: false }),
    (() => {
      let query = supabase
        .from("material_purchases")
        .select("*")
        .eq("organization_id", orgId)
        .order("purchase_date", { ascending: false });
      if (factoryId) query = query.eq("factory_id", factoryId);
      return query;
    })(),
    (() => {
      let query = supabase.from("sage_transactions").select("*").eq("organization_id", orgId);
      if (factoryId) query = query.eq("factory_id", factoryId);
      return query;
    })(),
    (() => {
      let query = supabase
        .from("hr_payroll_runs")
        .select("id, period_start, period_end, total_expense, factory_id, paid_at, status")
        .eq("organization_id", orgId)
        .order("period_end", { ascending: false });
      if (factoryId) query = query.eq("factory_id", factoryId);
      return query;
    })(),
  ]);

  const categories = (categoriesRaw ?? []) as ExpenseCategory[];
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const expenses = (expensesRaw ?? []).map((row) =>
    mapExpense(row as Record<string, unknown>, categoryById)
  );

  const supplierPayments = (supplierPaymentRows ?? []).map((row) => {
    const purchase = row.purchase as {
      factory_id?: string | null;
      purchase_number?: string | null;
    } | null;
    const supplier = row.supplier as { name?: string | null } | null;
    return {
      id: row.id as string,
      amount: Number(row.amount),
      payment_date: row.payment_date as string,
      payment_method: row.payment_method as string,
      supplier_name: supplier?.name ?? null,
      purchase_factory_id: purchase?.factory_id ?? null,
      purchase_number: purchase?.purchase_number ?? null,
      reference: row.reference as string | null,
    };
  });

  const materialPurchases = (purchasesRaw ?? []) as MaterialPurchase[];
  const sageTransactions = (sageRaw ?? []) as SageTransaction[];
  const payrollRuns = (payrollRaw ?? []).map((row) => ({
    id: row.id as string,
    period_start: row.period_start as string,
    period_end: row.period_end as string,
    total_expense: Number(row.total_expense),
    factory_id: row.factory_id as string | null,
    paid_at: row.paid_at as string | null,
    status: row.status as string,
  }));

  const { summary, unifiedLines } = buildExpenseAnalytics({
    scope,
    period,
    periodOptions,
    operatingExpenses: expenses,
    supplierPayments,
    materialPurchases,
    sageTransactions,
    payrollRuns,
  });

  return {
    expenses,
    categories,
    metrics: computeMetrics(expenses),
    analytics: summary,
    unifiedLines,
  };
}

async function assertBankRequired(
  paymentMethod: PaymentMethod,
  bankAccountId?: string | null
): Promise<void> {
  if (paymentMethod === "bank" && !bankAccountId) {
    throw new Error("Select a bank account for bank payments");
  }
}

export async function createOperatingExpense(
  input: {
    factory_id?: string;
    category_id?: string;
    vendor_name?: string;
    description: string;
    amount: number;
    expense_date: string;
    payment_method: PaymentMethod;
    bank_account_id?: string;
    reference?: string;
    notes?: string;
    post_immediately?: boolean;
  },
  user: ApiUser
): Promise<OperatingExpense> {
  if (!input.description?.trim()) throw new Error("Description is required");
  if (!input.amount || input.amount <= 0) throw new Error("Amount must be greater than zero");
  await assertBankRequired(input.payment_method, input.bank_account_id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("operating_expenses")
    .insert({
      organization_id: user.organization_id,
      factory_id: input.factory_id ?? null,
      category_id: input.category_id ?? null,
      vendor_name: input.vendor_name?.trim() || null,
      description: input.description.trim(),
      amount: input.amount,
      expense_date: input.expense_date,
      payment_method: input.payment_method,
      bank_account_id: input.payment_method === "bank" ? input.bank_account_id ?? null : null,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      status: "pending",
      created_by: user.id,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (input.post_immediately) {
    return postOperatingExpense(data.id as string, user);
  }

  const payload = await fetchExpensesData("combined", user.organization_id);
  const categoryById = new Map(payload.categories.map((c) => [c.id, c]));
  return mapExpense(data as Record<string, unknown>, categoryById);
}

export async function updateOperatingExpense(
  id: string,
  input: {
    factory_id?: string;
    category_id?: string;
    vendor_name?: string;
    description?: string;
    amount?: number;
    expense_date?: string;
    payment_method?: PaymentMethod;
    bank_account_id?: string | null;
    reference?: string;
    notes?: string;
  },
  user: ApiUser
): Promise<OperatingExpense> {
  const supabase = await createClient();
  const service = await createServiceClient();
  const { data: existing, error: fetchError } = await supabase
    .from("operating_expenses")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();
  if (fetchError || !existing) throw new Error("Expense not found");
  if (existing.status === "cancelled") {
    throw new Error("Cancelled expenses cannot be edited");
  }

  const paymentMethod = (input.payment_method ?? existing.payment_method) as PaymentMethod;
  const bankAccountId =
    input.bank_account_id !== undefined ? input.bank_account_id : existing.bank_account_id;
  await assertBankRequired(paymentMethod, bankAccountId as string | null);

  if (input.amount != null && input.amount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  const { data, error } = await supabase
    .from("operating_expenses")
    .update({
      ...(input.factory_id !== undefined ? { factory_id: input.factory_id } : {}),
      ...(input.category_id !== undefined ? { category_id: input.category_id || null } : {}),
      ...(input.vendor_name !== undefined ? { vendor_name: input.vendor_name?.trim() || null } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.expense_date !== undefined ? { expense_date: input.expense_date } : {}),
      ...(input.payment_method !== undefined ? { payment_method: input.payment_method } : {}),
      ...(input.bank_account_id !== undefined
        ? { bank_account_id: paymentMethod === "bank" ? input.bank_account_id : null }
        : {}),
      ...(input.reference !== undefined ? { reference: input.reference?.trim() || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
    })
    .eq("id", id)
    .select("*, expense_categories(code, name)")
    .single();
  if (error) throw new Error(error.message);

  if (existing.status === "posted" && existing.sage_transaction_id) {
    const category = data.expense_categories as { code: string; name: string } | null;
    const categoryLabel = category?.name ?? "Operating expense";
    const vendor = data.vendor_name ? ` — ${data.vendor_name}` : "";
    const { error: sageError } = await service
      .from("sage_transactions")
      .update({
        factory_id: data.factory_id,
        transaction_date: data.expense_date,
        description: `${categoryLabel}${vendor}: ${data.description}`,
        amount: -Number(data.amount),
      })
      .eq("id", existing.sage_transaction_id)
      .eq("organization_id", user.organization_id);
    if (sageError) throw new Error(sageError.message);
  }

  const categoryById = new Map<string, ExpenseCategory>();
  const categoryJoin = data.expense_categories as { code: string; name: string } | null;
  if (data.category_id && categoryJoin) {
    categoryById.set(data.category_id as string, {
      id: data.category_id as string,
      organization_id: user.organization_id,
      code: categoryJoin.code,
      name: categoryJoin.name,
      is_active: true,
      sort_order: 0,
    });
  } else {
    const { data: categoriesRaw } = await supabase
      .from("expense_categories")
      .select("*")
      .eq("organization_id", user.organization_id);
    for (const c of (categoriesRaw ?? []) as ExpenseCategory[]) {
      categoryById.set(c.id, c);
    }
  }
  return mapExpense(data as Record<string, unknown>, categoryById);
}

export async function postOperatingExpense(
  id: string,
  user: ApiUser
): Promise<OperatingExpense> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: expense, error: fetchError } = await supabase
    .from("operating_expenses")
    .select("*, expense_categories(code, name)")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();
  if (fetchError || !expense) throw new Error("Expense not found");
  if (expense.status === "posted") throw new Error("Expense is already posted");
  if (expense.status === "cancelled") throw new Error("Cancelled expenses cannot be posted");

  const category = expense.expense_categories as { code: string; name: string } | null;
  const categoryLabel = category?.name ?? "Operating expense";
  const vendor = expense.vendor_name ? ` — ${expense.vendor_name}` : "";
  const sageId = `EXP-${id.slice(0, 8)}-${Date.now()}`;

  const { data: tx, error: txError } = await service
    .from("sage_transactions")
    .insert({
      organization_id: user.organization_id,
      factory_id: expense.factory_id,
      sage_id: sageId,
      transaction_date: expense.expense_date,
      description: `${categoryLabel}${vendor}: ${expense.description}`,
      amount: -Number(expense.amount),
      transaction_type: "expense",
      reference: id,
    })
    .select("id")
    .single();
  if (txError) throw new Error(txError.message);

  const { data: updated, error: updateError } = await supabase
    .from("operating_expenses")
    .update({
      status: "posted",
      sage_transaction_id: tx.id,
      posted_at: new Date().toISOString(),
      posted_by: user.id,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  const { data: categoriesRaw } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("organization_id", user.organization_id);
  const categoryById = new Map(
    ((categoriesRaw ?? []) as ExpenseCategory[]).map((c) => [c.id, c])
  );
  return mapExpense(updated as Record<string, unknown>, categoryById);
}

export async function cancelOperatingExpense(id: string, user: ApiUser): Promise<OperatingExpense> {
  const supabase = await createClient();
  const service = await createServiceClient();

  const { data: expense, error: fetchError } = await supabase
    .from("operating_expenses")
    .select("*")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .single();
  if (fetchError || !expense) throw new Error("Expense not found");
  if (expense.status === "cancelled") throw new Error("Expense is already cancelled");

  if (expense.sage_transaction_id) {
    const { error: deleteError } = await service
      .from("sage_transactions")
      .delete()
      .eq("id", expense.sage_transaction_id)
      .eq("organization_id", user.organization_id);
    if (deleteError) throw new Error(deleteError.message);
  }

  const { data: updated, error: updateError } = await supabase
    .from("operating_expenses")
    .update({
      status: "cancelled",
      sage_transaction_id: null,
      posted_at: null,
      posted_by: null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (updateError) throw new Error(updateError.message);

  const { data: categoriesRaw } = await supabase
    .from("expense_categories")
    .select("*")
    .eq("organization_id", user.organization_id);
  const categoryById = new Map(
    ((categoriesRaw ?? []) as ExpenseCategory[]).map((c) => [c.id, c])
  );
  return mapExpense(updated as Record<string, unknown>, categoryById);
}

export async function deleteOperatingExpense(id: string, user: ApiUser): Promise<void> {
  const supabase = await createClient();
  const { data: expense } = await supabase
    .from("operating_expenses")
    .select("status")
    .eq("id", id)
    .eq("organization_id", user.organization_id)
    .maybeSingle();
  if (!expense) throw new Error("Expense not found");
  if (expense.status === "posted") {
    throw new Error("Posted expenses cannot be deleted — cancel instead");
  }

  const { error } = await supabase
    .from("operating_expenses")
    .delete()
    .eq("id", id)
    .eq("organization_id", user.organization_id);
  if (error) throw new Error(error.message);
}
