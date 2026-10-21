export type FactoryType = "block" | "recycling" | "combined";

export type OrderStatus = "ordered" | "picked" | "cancelled";

// Additive, recycling-only order workflow stage. Block-factory orders never
// set this — it stays null and `status` remains the source of truth there.
export type RecyclingOrderStage =
  | "pending"
  | "accepted"
  | "in_production"
  | "ready"
  | "delivered"
  | "cancelled";

export type CustomerType = "regular" | "walking";
export type PaymentMethod = "cash" | "bank";

export function orderLineSubtotal(
  lines: Array<{ quantity: number; unit_price: number }>
): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
}

export function applyOrderDiscount(
  subtotal: number,
  discountPercent?: number | null
): number {
  const pct = Math.min(100, Math.max(0, Number(discountPercent ?? 0)));
  return subtotal * (1 - pct / 100);
}

export function computeOrderTotal(
  lines: Array<{ quantity: number; unit_price: number }>,
  discountPercent?: number | null
): number {
  return applyOrderDiscount(orderLineSubtotal(lines), discountPercent);
}

export function orderCreditAmount(order: {
  total_amount: number;
  amount_paid?: number | null;
  withholding_amount?: number | null;
  store_credit_applied?: number | null;
}): number {
  const effectivePaid =
    Number(order.amount_paid ?? 0) +
    Number(order.withholding_amount ?? 0) +
    Number(order.store_credit_applied ?? 0);
  return Math.max(0, Number(order.total_amount) - effectivePaid);
}

export function computeWithholdingAmount(
  totalAmount: number,
  ratePercent: number | null | undefined,
  applied: boolean
): number {
  if (!applied || !ratePercent) return 0;
  return Number(totalAmount) * (Number(ratePercent) / 100);
}

export function computeVatAmount(
  subtotalAfterDiscount: number,
  ratePercent: number | null | undefined,
  applied: boolean
): number {
  if (!applied || !ratePercent) return 0;
  return Number(subtotalAfterDiscount) * (Number(ratePercent) / 100);
}

export function computeOrderGrandTotal(
  lines: Array<{ quantity: number; unit_price: number }>,
  discountPercent?: number | null,
  vatApplied?: boolean,
  vatRatePercent?: number | null
): { subtotalAfterDiscount: number; vatAmount: number; totalAmount: number } {
  const subtotalAfterDiscount = computeOrderTotal(lines, discountPercent);
  const vatAmount = computeVatAmount(subtotalAfterDiscount, vatRatePercent, !!vatApplied);
  return {
    subtotalAfterDiscount,
    vatAmount,
    totalAmount: subtotalAfterDiscount + vatAmount,
  };
}

/** @deprecated Use dynamic category_id from InventoryConfig */
export type InventoryCategory = string;

export type InventoryAppliesTo = "block" | "recycling" | "both";

export interface InventoryItemType {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
  applies_to: InventoryAppliesTo;
  sort_order: number;
  is_active: boolean;
}

export interface InventoryCategoryDef {
  id: string;
  organization_id: string;
  item_type_id: string;
  parent_id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  factory_id?: string | null;
  is_active: boolean;
}

export interface InventoryUnitDef {
  id: string;
  organization_id: string;
  item_type_id: string;
  name: string;
  abbreviation: string;
  is_base_unit?: boolean;
  is_active: boolean;
}

export interface InventoryConfig {
  itemTypes: InventoryItemType[];
  categories: InventoryCategoryDef[];
  units: InventoryUnitDef[];
}

export type BlockCheckpoint = "batch_count" | "after_drying" | "after_curing";

export type ReconciliationStatus = "matched" | "variance" | "pending" | "approved";

export type NotificationType =
  | "task"
  | "approval"
  | "ai_alert"
  | "system"
  | "missing_data";

export type AiRole = "ceo" | "finance" | "production" | "warehouse" | "hr" | "sales";

export type ViewScope = "combined" | "block" | "recycling";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface Factory {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  type: FactoryType;
  is_active: boolean;
}

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  avatar_url?: string | null;
  phone?: string | null;
  factory_id?: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
}

export interface Role {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description?: string | null;
}

export interface UserRole {
  user_id: string;
  role_id: string;
  factory_id?: string | null;
  role?: Role;
}

export type MovementType =
  | "production_in"
  | "production_out"
  | "damage_return"
  | "sale"
  | "adjustment"
  | "stock_count"
  | "transfer"
  | "receipt"
  | "issue";

export interface InventoryItem {
  id: string;
  organization_id: string;
  factory_id: string;
  name: string;
  sku: string;
  item_type_id: string;
  category_id: string;
  unit: string;
  quantity: number;
  reserved_quantity?: number;
  low_stock_threshold: number;
  reorder_quantity?: number;
  max_stock_level?: number;
  unit_cost?: number;
  supplier?: string | null;
  location?: string | null;
  location_id?: string | null;
  lead_time_days?: number;
  abc_class?: "A" | "B" | "C" | null;
  stock_status?: "available" | "quarantine" | "hold";
  custom_fields?: Record<string, string | number | null>;
  barcode?: string | null;
  is_active: boolean;
  /** Legacy enum column still used by Supabase seed rows */
  category?: "raw_material" | "work_in_process" | "finished_goods" | null;
}

export interface InventoryMovement {
  id: string;
  organization_id: string;
  factory_id: string;
  item_id: string;
  item?: InventoryItem;
  movement_type: MovementType | string;
  quantity: number;
  balance_after?: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  source_module?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface InventoryMetrics {
  totalSkus: number;
  /** Sum of finished-goods quantities (blocks, pellets, etc.) */
  totalUnits: number;
  totalValue: number;
  /** Raw material / WIP quantities on hand (can differ by unit) */
  rawMaterialUnits: number;
  finishedGoodsUnits: number;
  negativeStockCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  pendingCounts: number;
  blockFactory: { skus: number; units: number; value: number };
  recyclingFactory: { skus: number; units: number; value: number };
  byItemType: Record<string, { count: number; units: number; value: number; label: string }>;
  /** @deprecated Use byItemType */
  byCategory: Record<string, { count: number; units: number; value: number }>;
}

export interface ProductionCount {
  id: string;
  organization_id: string;
  factory_id: string;
  batch_id?: string | null;
  checkpoint?: BlockCheckpoint | null;
  material_received?: number | null;
  processed_output?: number | null;
  waste_rejected?: number | null;
  good_count?: number | null;
  damaged_count?: number | null;
  photo_url?: string | null;
  production_date: string;
  created_at: string;
}

export interface ProductionBatch {
  id: string;
  organization_id: string;
  factory_id: string;
  batch_number: string;
  name?: string | null;
  status: string;
  order_id?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Block size in cm (20, 15, 10, 24) — block factory only */
  block_size_cm?: number | null;
  planned_quantity?: number | null;
  cement_bags_consumed?: number | null;
  cement_kg_consumed?: number | null;
  poliche_loads_consumed?: number | null;
  expected_waste_rate?: number | null;
  expected_waste_pieces?: number | null;
  actual_output?: number | null;
  actual_waste?: number | null;
  operator_id?: string | null;
  production_date?: string | null;
  expected_completion_date?: string | null;
}

export interface ProductionSettings {
  organization_id: string;
  default_daily_target_plates: number;
  cement_kg_per_bag: number;
  updated_at?: string;
}

export interface FinanceSettings {
  organization_id: string;
  withholding_tax_rate_percent: number;
  vat_rate_percent: number;
  updated_at?: string;
}

export interface ProductionDailyLog {
  id: string;
  organization_id: string;
  factory_id: string;
  batch_id: string;
  log_date: string;
  target_plates: number;
  is_custom_target: boolean;
  actual_plates?: number | null;
  calculated_pieces?: number | null;
  target_pieces: number;
  shortfall_reason?: string | null;
  cement_bags_used?: number | null;
  poliche_loads_used?: number | null;
  standard_cement_bags: number;
  standard_poliche_loads: number;
  cement_waste_bags: number;
  poliche_waste_loads: number;
  waste_cost: number;
  entered_by?: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  tin?: string | null;
  customer_type: CustomerType;
  balance: number;
  /** Wallet balance from cancelled paid orders kept as credit, spendable on a future order. */
  store_credit_balance?: number;
  is_active: boolean;
  created_at?: string;
  /** Overall/Combined credit score — company-wide across both factories. */
  credit_score?: number | null;
  credit_limit?: number | null;
  credit_risk_tier?: "low" | "medium" | "high" | "blocked" | null;
  credit_score_updated_at?: string | null;
  credit_score_factors?: Record<string, unknown> | null;
  credit_score_block?: number | null;
  credit_limit_block?: number | null;
  credit_risk_tier_block?: "low" | "medium" | "high" | "blocked" | null;
  credit_score_block_updated_at?: string | null;
  credit_score_recycling?: number | null;
  credit_limit_recycling?: number | null;
  credit_risk_tier_recycling?: "low" | "medium" | "high" | "blocked" | null;
  credit_score_recycling_updated_at?: string | null;
}

export interface Bank {
  id: string;
  organization_id: string;
  name: string;
  code?: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BankAccount {
  id: string;
  organization_id: string;
  bank_id: string;
  account_number: string;
  account_name?: string | null;
  is_active: boolean;
  created_at: string;
  bank?: Bank | null;
}

export type CustomerPaymentKind = "payment" | "refund" | "store_credit_issue" | "store_credit_apply";

export interface CustomerPayment {
  id: string;
  organization_id: string;
  customer_id: string;
  order_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  kind?: CustomerPaymentKind;
  bank_id?: string | null;
  bank_account_id?: string | null;
  bank?: Bank | null;
  bank_account?: BankAccount | null;
  payment_date: string;
  reference?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface CustomerSummary extends Customer {
  order_count: number;
  pipeline_value: number;
  picked_value: number;
  open_order_count: number;
  total_paid: number;
  total_refunded: number;
  net_paid: number;
  pending_order_credit: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  item_id?: string | null;
  /** Specific production batch this line was ordered against (block factory only). */
  batch_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
  quantity_fulfilled?: number;
  inventory_item?: InventoryItem | null;
}

export interface Order {
  id: string;
  organization_id: string;
  factory_id: string;
  customer_id: string;
  order_number: string;
  status: OrderStatus;
  total_amount: number;
  discount_percent?: number;
  delivery_date?: string | null;
  payment_method?: PaymentMethod | null;
  bank_id?: string | null;
  bank_account_id?: string | null;
  bank?: Bank | null;
  bank_account?: BankAccount | null;
  amount_paid?: number;
  requires_invoice?: boolean;
  ai_risk_flag: boolean;
  ai_risk_reason?: string | null;
  customer?: Customer;
  items?: OrderItem[];
  production_batch_id?: string | null;
  recycling_stage?: RecyclingOrderStage | null;
  /** Amount of this order's payment sourced from the customer's store-credit wallet. */
  store_credit_applied?: number;
  /** Customer paid upfront; quantity may exceed current batch production. */
  prepaid_advance?: boolean;
  withholding_applied?: boolean;
  withholding_rate_percent?: number | null;
  withholding_amount?: number;
  vat_applied?: boolean;
  vat_rate_percent?: number | null;
  vat_amount?: number;
  created_at: string;
}

export interface Delivery {
  id: string;
  organization_id: string;
  order_id: string;
  photo_url?: string | null;
  signature_url?: string | null;
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  delivered_at: string;
}

export interface SageTransaction {
  id: string;
  organization_id: string;
  sage_id: string;
  transaction_date: string;
  description?: string | null;
  amount: number;
  transaction_type?: string | null;
  factory_id?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
}

export type MaterialPurchaseType = "cement" | "poliche" | "ashwa" | "spare_parts" | "other";
export type MaterialPurchaseStatus = "ordered" | "received" | "cancelled";
export type PurchaseSortingStatus = "not_applicable" | "pending_sorting" | "sorted";
export type PurchasePaymentMethod = PaymentMethod | "credit";
export type PurchasePaymentStatus = "unpaid" | "partial" | "paid";
export type SupplierType = "credit" | "cash";

export interface Supplier {
  id: string;
  organization_id: string;
  name: string;
  contact_phone?: string | null;
  contact_email?: string | null;
  address?: string | null;
  is_active: boolean;
  total_purchases: number;
  balance?: number;
  supplier_type?: SupplierType;
  created_at?: string;
}

export interface SupplierPayment {
  id: string;
  organization_id: string;
  supplier_id: string;
  purchase_id?: string | null;
  amount: number;
  payment_method: PaymentMethod;
  bank_id?: string | null;
  bank_account_id?: string | null;
  payment_date: string;
  reference?: string | null;
  notes?: string | null;
  created_at?: string;
  supplier_name?: string | null;
  purchase_number?: string | null;
  purchase_factory_id?: string | null;
  bank?: Bank | null;
  bank_account?: BankAccount | null;
}

export interface MaterialPurchase {
  id: string;
  organization_id: string;
  factory_id: string;
  purchase_number: string;
  supplier_id?: string | null;
  supplier_name: string;
  material_type: MaterialPurchaseType;
  item_id?: string | null;
  item?: InventoryItem | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_cost: number;
  vehicle_plate?: string | null;
  delivery_notes?: string | null;
  purchase_date: string;
  status: MaterialPurchaseStatus;
  payment_method?: PurchasePaymentMethod;
  amount_paid?: number;
  payment_status?: PurchasePaymentStatus;
  bank_id?: string | null;
  bank_account_id?: string | null;
  received_at?: string | null;
  received_by?: string | null;
  created_at?: string;
  /** Stage 1: gross weight as delivered by the supplier (raw-material recycling purchases only) */
  initial_received_weight?: number | null;
  /** Stage 2: weight remaining after unrecyclable/contaminated material is sorted out — drives inventory */
  net_recyclable_weight?: number | null;
  /** Derived: initial_received_weight - net_recyclable_weight, stored by the DB */
  waste_quantity?: number | null;
  sorting_status?: PurchaseSortingStatus;
  sorted_at?: string | null;
  sorted_by?: string | null;
  cancellation_reason?: string | null;
}

export interface ReconciliationRecord {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  operational_record_type: string;
  operational_record_id: string;
  sage_transaction_id?: string | null;
  operational_amount: number;
  sage_amount?: number | null;
  variance: number;
  status: ReconciliationStatus;
  verified_by?: string | null;
  verified_at?: string | null;
}

export interface SageSyncLog {
  id: string;
  organization_id: string;
  status: "success" | "failed" | "partial" | "running";
  records_processed: number;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export type OperatingExpenseStatus = "pending" | "posted" | "cancelled";

export interface ExpenseCategory {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface OperatingExpense {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  category_id?: string | null;
  category_name?: string | null;
  category_code?: string | null;
  vendor_name?: string | null;
  description: string;
  amount: number;
  expense_date: string;
  payment_method: PaymentMethod;
  bank_account_id?: string | null;
  reference?: string | null;
  notes?: string | null;
  status: OperatingExpenseStatus;
  sage_transaction_id?: string | null;
  posted_at?: string | null;
  posted_by?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseMetrics {
  totalPending: number;
  pendingCount: number;
  postedThisMonth: number;
  postedCountThisMonth: number;
  totalPostedAllTime: number;
  byCategory: { category: string; amount: number; count: number }[];
}

export type ExpenseSourceType =
  | "operating_expense"
  | "supplier_payment"
  | "material_purchase"
  | "payroll"
  | "cogs"
  | "sage_expense";

export interface UnifiedExpenseLine {
  id: string;
  source_type: ExpenseSourceType;
  date: string;
  description: string;
  category: string;
  vendor?: string | null;
  amount: number;
  factory_id?: string | null;
  payment_method?: string | null;
  status?: string | null;
  reference_id?: string | null;
  in_finance_ledger: boolean;
  detail_path?: string | null;
}

export interface ExpenseAnalyticsSummary {
  period: { from: string; to: string; label: string };
  totalPlExpenses: number;
  operatingExpenses: number;
  supplierPayments: number;
  payrollExpenses: number;
  cogs: number;
  materialPurchasesReceived: number;
  pendingOperating: number;
  totalCashOut: number;
  transactionCount: number;
  bySource: { source: string; amount: number; count: number }[];
  byCategory: { category: string; amount: number; count: number }[];
  byFactory: { factory: string; factory_id: string | null; amount: number }[];
  byPaymentMethod: { method: string; amount: number; count: number }[];
  topVendors: { name: string; amount: number; count: number }[];
  monthlyTrend: {
    month: string;
    label: string;
    operating: number;
    purchasing: number;
    payroll: number;
    cogs: number;
    total: number;
  }[];
  financeSync: {
    postedOperatingCount: number;
    unpostedOperatingCount: number;
    sageExpenseTotal: number;
    sageLinkedOperating: number;
    supplierPaymentsInPeriod: number;
  };
}

export interface ExpensesDataPayload {
  expenses: OperatingExpense[];
  categories: ExpenseCategory[];
  metrics: ExpenseMetrics;
  analytics: ExpenseAnalyticsSummary;
  unifiedLines: UnifiedExpenseLine[];
}

export interface FinanceDashboardMetrics {
  period: { from: string; to: string; label: string };
  revenue: number;
  receivables: number;
  collections: number;
  supplierPayments: number;
  operatingCashOut: number;
  cashOut: number;
  expenses: number;
  payrollExpenses: number;
  cashFlow: number;
  outstandingBalance: number;
  pendingOrderCredit: number;
  reconciliationPending: number;
  reconciliationVariance: number;
  netProfit: number;
}

export interface CustomerFinancialRow {
  customer_id: string;
  customer_name: string;
  customer_type: CustomerType;
  balance: number;
  total_paid: number;
  collections_in_period: number;
  credit_outstanding: number;
  pending_order_credit: number;
  picked_value: number;
}

export interface FinancialAlert {
  id: string;
  severity: "warning" | "critical" | "info";
  title: string;
  description: string;
  amount?: number;
}

export interface FinanceTrendPoint {
  date: string;
  revenue: number;
  expenses: number;
  collections: number;
  supplierPayments: number;
  cashFlow: number;
}

export interface HrDepartment {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  manager_employee_id?: string | null;
  is_active: boolean;
  employee_count?: number;
}

export interface HrPosition {
  id: string;
  organization_id: string;
  department_id?: string | null;
  factory_id?: string | null;
  title: string;
  grade?: string | null;
  description?: string | null;
  headcount_limit?: number | null;
  is_active: boolean;
  filled_count?: number;
}

export type EmploymentStatus =
  | "active"
  | "probation"
  | "on_leave"
  | "terminated"
  | "resigned";

export interface Employee {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  employee_number: string;
  department?: string | null;
  position: string;
  department_id?: string | null;
  position_id?: string | null;
  manager_employee_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  employment_type?: string | null;
  employment_status?: EmploymentStatus | string | null;
  salary?: number | null;
  monthly_allowances?: number | null;
  hire_date: string;
  termination_date?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
  city?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  bank_name?: string | null;
  bank_account_number?: string | null;
  tax_id?: string | null;
  notes?: string | null;
  branch_id?: string | null;
  probation_end_date?: string | null;
  contract_end_date?: string | null;
  work_location?: string | null;
  currency?: string | null;
  seniority_level?: string | null;
  is_active: boolean;
}

export interface AttendanceRecord {
  id: string;
  organization_id?: string;
  employee_id: string;
  factory_id?: string | null;
  shift_date: string;
  clock_in?: string | null;
  clock_out?: string | null;
  status: "present" | "absent" | "late" | "leave" | "half_day";
  working_hours?: number | null;
  overtime_hours?: number | null;
  late_minutes?: number | null;
  early_departure_minutes?: number | null;
  shift_id?: string | null;
  is_remote?: boolean | null;
  is_corrected?: boolean | null;
  notes?: string | null;
}

export interface LeaveBalance {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type: string;
  leave_type_id?: string | null;
  balance_days: number;
  used_days: number;
  accrued_days?: number;
  carry_over_days?: number;
  balance_year?: number;
}

export interface LeaveRequest {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type: string;
  leave_type_id?: string | null;
  start_date: string;
  end_date: string;
  days_count?: number | null;
  reason?: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  approved_by?: string | null;
  rejection_reason?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  is_half_day?: boolean | null;
  half_day_period?: string | null;
  attachment_document_id?: string | null;
  cancelled_at?: string | null;
  created_at?: string;
}

export interface HrMetrics {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  pendingLeave: number;
  departmentCount: number;
  positionCount: number;
  blockEmployees: number;
  recyclingEmployees: number;
}

export interface HrSettings {
  organization_id: string;
  work_start_time: string;
  work_end_time: string;
  late_grace_minutes: number;
  standard_work_hours: number;
  overtime_multiplier: number;
  leave_compensation_enabled: boolean;
  leave_compensation_daily_rate_divisor: number;
  payroll_tax_rate_percent: number;
  payroll_day_of_month: number;
  default_currency?: string;
  attendance_correction_requires_approval?: boolean;
}

export interface HrBranch {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  code: string;
  name: string;
  country?: string | null;
  city?: string | null;
  currency: string;
  is_active: boolean;
}

export interface HrCostCenter {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  department_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  is_active: boolean;
}

export interface HrShift {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  grace_minutes: number;
  standard_hours: number;
  overtime_multiplier: number;
  is_overnight: boolean;
  is_active: boolean;
}

export interface HrWorkSchedule {
  id: string;
  organization_id: string;
  name: string;
  working_days: number[];
  weekend_days: number[];
  effective_from: string;
  effective_to?: string | null;
  is_default: boolean;
}

export interface HrLeavePolicyRule {
  id: string;
  organization_id: string;
  leave_type_id: string;
  name: string;
  priority: number;
  criteria: Record<string, unknown>;
  annual_entitlement: number;
  accrual_monthly: number;
  max_carry_over: number;
  max_consecutive_days?: number | null;
  min_notice_days: number;
  probation_restricted: boolean;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
}

export interface HrApprovalWorkflow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  entity_type: string;
  is_active: boolean;
  steps?: HrApprovalWorkflowStep[];
}

export interface HrApprovalWorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  approver_type: string;
  approver_role_id?: string | null;
  approver_user_id?: string | null;
  can_delegate: boolean;
  escalate_after_hours?: number | null;
}

export interface HrLeaveBalanceLedgerEntry {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type: string;
  leave_type_id?: string | null;
  transaction_type: string;
  days_delta: number;
  balance_after: number;
  reference_type?: string | null;
  reference_id?: string | null;
  reason?: string | null;
  effective_date: string;
  created_by?: string | null;
  created_at?: string;
}

export interface HrAttendanceCorrection {
  id: string;
  organization_id: string;
  attendance_record_id?: string | null;
  employee_id: string;
  shift_date: string;
  reason: string;
  status: string;
  old_status?: string | null;
  new_status?: string | null;
  corrected_by?: string | null;
  approved_by?: string | null;
}

export interface HrEmploymentHistoryEntry {
  id: string;
  organization_id: string;
  employee_id: string;
  event_type: string;
  effective_date: string;
  department_id?: string | null;
  position_id?: string | null;
  salary?: number | null;
  notes?: string | null;
}

export interface HrEmployeeBenefit {
  id: string;
  organization_id: string;
  employee_id: string;
  benefit_type: string;
  description?: string | null;
  amount: number;
  frequency: string;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
}

export interface HrPayrollCategory {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  category_type: string;
  sage_transaction_type: string;
  is_active: boolean;
}

export interface HrDashboardMetrics {
  headcount: number;
  activeEmployees: number;
  onProbation: number;
  pendingLeave: number;
  pendingApprovals: number;
  absentToday: number;
  overtimeHoursMonth: number;
  payrollExpenseMonth: number;
  leaveLiabilityDays: number;
  contractsExpiring30: number;
  probationExpiring30: number;
  upcomingHolidays: HrHoliday[];
}

export interface HrLeaveType {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description?: string | null;
  default_days: number;
  accrual_monthly: number;
  is_paid: boolean;
  is_convertible: boolean;
  requires_approval: boolean;
  max_carry_over: number;
  is_active: boolean;
  sort_order: number;
  min_notice_days?: number;
  max_consecutive_days?: number | null;
  probation_restricted?: boolean;
  requires_attachment?: boolean;
  expiry_months?: number | null;
  encashment_formula?: string;
  encashment_fixed_rate?: number | null;
  allow_half_day?: boolean;
  allow_carry_forward?: boolean;
}

export interface HrLeavePolicy {
  id: string;
  organization_id: string;
  leave_type_id: string;
  department_id?: string | null;
  position_id?: string | null;
  annual_entitlement: number;
  accrual_monthly: number;
  max_carry_over: number;
}

export interface HrHoliday {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  branch_id?: string | null;
  department_id?: string | null;
  name: string;
  holiday_date: string;
  holiday_type?: string;
  country?: string | null;
  is_recurring: boolean;
  eligibility?: Record<string, unknown>;
}

export interface HrLeaveCompensationRequest {
  id: string;
  organization_id: string;
  employee_id: string;
  leave_type: string;
  leave_type_id?: string | null;
  days_converted: number;
  daily_rate: number;
  amount: number;
  status: "pending" | "approved" | "rejected" | "paid";
  notes?: string | null;
  approved_by?: string | null;
  reviewed_at?: string | null;
  payroll_run_id?: string | null;
  sage_transaction_id?: string | null;
}

export type PayrollRunStatus = "draft" | "calculated" | "approved" | "paid";

export interface HrPayrollRun {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  period_start: string;
  period_end: string;
  status: PayrollRunStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_expense: number;
  notes?: string | null;
  calculated_by?: string | null;
  approved_by?: string | null;
  paid_at?: string | null;
  is_locked?: boolean;
  created_at?: string;
}

export interface HrPayrollItem {
  id: string;
  payroll_run_id: string;
  organization_id: string;
  employee_id: string;
  base_salary: number;
  allowances: number;
  overtime_pay: number;
  bonus: number;
  leave_compensation: number;
  gross_pay: number;
  tax_deduction: number;
  other_deductions: number;
  net_pay: number;
  payment_status: "pending" | "paid";
  unpaid_leave_deduction?: number;
  payroll_breakdown?: Record<string, number>;
  cost_center_id?: string | null;
  sage_transaction_id?: string | null;
}

export interface AttendanceSummary {
  employee_id: string;
  present_days: number;
  absent_days: number;
  late_days: number;
  leave_days: number;
  total_working_hours: number;
  total_overtime_hours: number;
  total_late_minutes: number;
}

export interface Notification {
  id: string;
  organization_id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: string | null;
  entity_id?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface AiBriefing {
  id: string;
  organization_id: string;
  role: AiRole;
  factory_id?: string | null;
  summary: string;
  confidence_level: number;
  data_gaps?: Record<string, unknown> | null;
  generated_at: string;
}

export interface AiAlert {
  id: string;
  organization_id: string;
  role: AiRole;
  factory_id?: string | null;
  alert_type: string;
  title: string;
  message: string;
  severity: string;
  entity_type?: string | null;
  entity_id?: string | null;
  is_resolved: boolean;
  created_at: string;
}

export interface AiConversation {
  id: string;
  organization_id: string;
  user_id: string;
  role: AiRole;
  messages: Array<{ role: string; content: string }>;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id?: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  old_values?: Record<string, unknown> | null;
  new_values?: Record<string, unknown> | null;
  created_at: string;
}

export interface Document {
  id: string;
  organization_id: string;
  name: string;
  file_url: string;
  tag: string;
  entity_type?: string | null;
  entity_id?: string | null;
  is_restricted: boolean;
}

export interface StockCount {
  id: string;
  organization_id: string;
  factory_id: string;
  item_id: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number;
  status: string;
  notes?: string | null;
  reviewed_by?: string | null;
  is_blind?: boolean;
  schedule_id?: string | null;
  barcode_scanned?: string | null;
  auto_approved?: boolean;
  item?: InventoryItem;
}

export interface DashboardMetrics {
  revenue: number;
  production: number;
  withholdingCollected: number;
  activeOrders: number;
  openRiskAlerts: number;
}

export interface FactoryDashboardMetrics {
  todayOutput: number;
  yieldRate: number;
  rejectionRate: number;
  rawMaterialStock: number;
  finishedGoodsStock: number;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ordered: "Pending Pickup",
  picked: "Picked",
  cancelled: "Cancelled",
};

export const RECYCLING_STAGE_LABELS: Record<RecyclingOrderStage, string> = {
  pending: "Pending",
  accepted: "Accepted",
  in_production: "In Production",
  ready: "Ready",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const CHECKPOINT_LABELS: Record<BlockCheckpoint, string> = {
  batch_count: "Batch Count",
  after_drying: "After Drying",
  after_curing: "After Curing",
};

export const FACTORY_IDS = {
  block: "22222222-2222-2222-2222-222222222221",
  recycling: "22222222-2222-2222-2222-222222222222",
} as const;

export const ORG_ID = "11111111-1111-1111-1111-111111111111";

export * from "./inventory-enterprise";
export * from "./production-intelligence";
