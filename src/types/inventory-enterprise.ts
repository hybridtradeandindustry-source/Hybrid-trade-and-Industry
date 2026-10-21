import type { InventoryAppliesTo, InventoryCategoryDef, InventoryItemType, InventoryUnitDef } from "@/types";

export type StockStatus = "available" | "quarantine" | "hold";
export type AbcClass = "A" | "B" | "C";
export type CatalogChangeStatus = "pending" | "approved" | "rejected";
export type RequisitionStatus = "draft" | "pending_approval" | "approved" | "ordered" | "cancelled";
export type CycleCountFrequency = "daily" | "weekly" | "monthly" | "quarterly";

export interface InventoryUnitConversion {
  id: string;
  organization_id: string;
  item_type_id: string;
  from_unit: string;
  to_unit: string;
  factor: number;
}

export interface InventoryCustomFieldDef {
  id: string;
  organization_id: string;
  item_type_id: string;
  field_key: string;
  field_label: string;
  field_type: "text" | "number" | "select" | "date";
  is_required?: boolean;
  options?: string[];
  sort_order: number;
  is_active: boolean;
}

export interface InventorySkuRule {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  item_type_id?: string | null;
  prefix: string;
  separator: string;
  sequence_pad: number;
  next_sequence: number;
  is_active: boolean;
}

export interface InventoryCatalogChangeRequest {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id?: string | null;
  payload: Record<string, unknown>;
  status: CatalogChangeStatus;
  requested_by?: string | null;
  reviewed_by?: string | null;
  review_notes?: string | null;
  created_at: string;
  reviewed_at?: string | null;
}

export interface InventoryLocation {
  id: string;
  organization_id: string;
  factory_id: string;
  parent_id?: string | null;
  code: string;
  name: string;
  location_type: "warehouse" | "zone" | "bin" | "yard" | "line";
  is_active: boolean;
}

export interface InventoryLocationStock {
  id: string;
  organization_id: string;
  item_id: string;
  location_id: string;
  quantity: number;
  lot_id?: string | null;
  location?: InventoryLocation;
}

export interface InventoryLot {
  id: string;
  organization_id: string;
  factory_id: string;
  item_id: string;
  lot_number: string;
  quantity: number;
  manufactured_at?: string | null;
  expires_at?: string | null;
  supplier_lot?: string | null;
  notes?: string | null;
  stock_status: StockStatus;
  item?: { name: string; sku: string };
}

export interface InventoryBom {
  id: string;
  organization_id: string;
  factory_id: string;
  finished_item_id: string;
  name: string;
  version: number;
  yield_quantity: number;
  is_active: boolean;
  lines?: InventoryBomLine[];
  finished_item?: { name: string; sku: string };
}

export interface InventoryBomLine {
  id: string;
  bom_id: string;
  component_item_id: string;
  quantity_required: number;
  unit: string;
  scrap_factor: number;
  sort_order: number;
  component_item?: { name: string; sku: string };
}

export interface InventoryQuarantineHold {
  id: string;
  organization_id: string;
  factory_id: string;
  item_id: string;
  lot_id?: string | null;
  quantity: number;
  reason: string;
  status: StockStatus;
  held_by?: string | null;
  released_by?: string | null;
  created_at: string;
  released_at?: string | null;
  item?: { name: string; sku: string };
}

export interface InventoryCycleCountSchedule {
  id: string;
  organization_id: string;
  factory_id: string;
  name: string;
  item_type_id?: string | null;
  category_id?: string | null;
  frequency: CycleCountFrequency;
  next_run_date: string;
  assigned_to?: string | null;
  is_blind: boolean;
  is_active: boolean;
}

export interface InventoryVarianceRule {
  id: string;
  organization_id: string;
  factory_id?: string | null;
  name: string;
  max_variance_percent: number;
  max_variance_units?: number | null;
  auto_approve: boolean;
  is_active: boolean;
}

export interface PurchaseRequisition {
  id: string;
  organization_id: string;
  factory_id: string;
  requisition_number: string;
  status: RequisitionStatus;
  notes?: string | null;
  requested_by?: string | null;
  approved_by?: string | null;
  created_at: string;
  approved_at?: string | null;
  lines?: PurchaseRequisitionLine[];
}

export interface PurchaseRequisitionLine {
  id: string;
  requisition_id: string;
  item_id: string;
  quantity: number;
  unit: string;
  estimated_unit_cost?: number | null;
  notes?: string | null;
  item?: { name: string; sku: string };
}

export interface SageInventoryMapping {
  id: string;
  organization_id: string;
  item_id: string;
  sage_item_code: string;
  sage_warehouse_code?: string | null;
  last_synced_at?: string | null;
  sync_enabled: boolean;
}

export interface InventoryInterFactoryTransfer {
  id: string;
  organization_id: string;
  from_factory_id: string;
  to_factory_id: string;
  from_item_id: string;
  to_item_id: string;
  quantity: number;
  status: string;
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
}

export interface InventoryIntelligence {
  abcAnalysis: AbcAnalysisRow[];
  daysOfSupply: DaysOfSupplyRow[];
  deadStock: DeadStockRow[];
  smartReorder: SmartReorderRow[];
}

export interface AbcAnalysisRow {
  item_id: string;
  sku: string;
  name: string;
  abc_class: AbcClass;
  annual_value: number;
  pct_of_total: number;
  movement_count: number;
}

export interface DaysOfSupplyRow {
  item_id: string;
  sku: string;
  name: string;
  quantity: number;
  avg_daily_usage: number;
  days_of_supply: number;
}

export interface DeadStockRow {
  item_id: string;
  sku: string;
  name: string;
  quantity: number;
  value: number;
  days_since_last_movement: number;
}

export interface SmartReorderRow {
  item_id: string;
  sku: string;
  name: string;
  available: number;
  reorder_point: number;
  suggested_qty: number;
  lead_time_days: number;
  reason: string;
}

export interface InventoryEnterpriseData {
  locations: InventoryLocation[];
  locationStock: InventoryLocationStock[];
  lots: InventoryLot[];
  boms: InventoryBom[];
  quarantineHolds: InventoryQuarantineHold[];
  cycleCountSchedules: InventoryCycleCountSchedule[];
  varianceRules: InventoryVarianceRule[];
  requisitions: PurchaseRequisition[];
  sageMappings: SageInventoryMapping[];
  interFactoryTransfers: InventoryInterFactoryTransfer[];
  unitConversions: InventoryUnitConversion[];
  customFieldDefs: InventoryCustomFieldDef[];
  skuRules: InventorySkuRule[];
  catalogChangeRequests: InventoryCatalogChangeRequest[];
  intelligence: InventoryIntelligence;
}

export interface ExtendedInventoryConfig {
  itemTypes: InventoryItemType[];
  categories: InventoryCategoryDef[];
  units: InventoryUnitDef[];
  unitConversions: InventoryUnitConversion[];
  customFieldDefs: InventoryCustomFieldDef[];
  skuRules: InventorySkuRule[];
  catalogChangeRequests: InventoryCatalogChangeRequest[];
}
