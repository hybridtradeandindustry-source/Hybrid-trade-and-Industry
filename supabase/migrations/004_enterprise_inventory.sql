-- Enterprise inventory: catalog, locations, lots, BOM, intelligence, requisitions, Sage mapping

-- Extend movement types
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'receipt';
ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'issue';

CREATE TYPE inventory_applies_to AS ENUM ('block', 'recycling', 'both');
CREATE TYPE stock_status AS ENUM ('available', 'quarantine', 'hold');
CREATE TYPE abc_class AS ENUM ('A', 'B', 'C');
CREATE TYPE catalog_change_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE requisition_status AS ENUM ('draft', 'pending_approval', 'approved', 'ordered', 'cancelled');
CREATE TYPE cycle_count_frequency AS ENUM ('daily', 'weekly', 'monthly', 'quarterly');

-- ─── Configurable catalog ───────────────────────────────────────────────────
CREATE TABLE inventory_item_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  applies_to inventory_applies_to NOT NULL DEFAULT 'both',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE TABLE inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_type_id UUID NOT NULL REFERENCES inventory_item_types(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_type_id, slug)
);

CREATE TABLE inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_type_id UUID NOT NULL REFERENCES inventory_item_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL,
  is_base_unit BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_type_id, abbreviation)
);

CREATE TABLE inventory_unit_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_type_id UUID NOT NULL REFERENCES inventory_item_types(id) ON DELETE CASCADE,
  from_unit TEXT NOT NULL,
  to_unit TEXT NOT NULL,
  factor DECIMAL(18, 8) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_type_id, from_unit, to_unit)
);

CREATE TABLE inventory_custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_type_id UUID NOT NULL REFERENCES inventory_item_types(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  options JSONB,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_type_id, field_key)
);

CREATE TABLE inventory_sku_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  item_type_id UUID REFERENCES inventory_item_types(id) ON DELETE SET NULL,
  prefix TEXT NOT NULL,
  separator TEXT NOT NULL DEFAULT '-',
  sequence_pad INT NOT NULL DEFAULT 3,
  next_sequence INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_catalog_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  payload JSONB NOT NULL,
  status catalog_change_status NOT NULL DEFAULT 'pending',
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- ─── Extend inventory items ─────────────────────────────────────────────────
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_type_id UUID REFERENCES inventory_item_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_quantity DECIMAL(15, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorder_quantity DECIMAL(15, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_stock_level DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS lead_time_days INT DEFAULT 7,
  ADD COLUMN IF NOT EXISTS abc_class abc_class,
  ADD COLUMN IF NOT EXISTS stock_status stock_status NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS custom_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS barcode TEXT,
  ADD COLUMN IF NOT EXISTS location_id UUID;

CREATE TABLE inventory_custom_field_values (
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES inventory_custom_field_definitions(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY (item_id, field_definition_id)
);

-- ─── Locations & bin stock ──────────────────────────────────────────────────
CREATE TABLE inventory_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location_type TEXT NOT NULL DEFAULT 'bin',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(factory_id, code)
);

ALTER TABLE inventory_items
  ADD CONSTRAINT inventory_items_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES inventory_locations(id) ON DELETE SET NULL;

CREATE TABLE inventory_location_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES inventory_locations(id) ON DELETE CASCADE,
  quantity DECIMAL(15, 4) NOT NULL DEFAULT 0,
  lot_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id, location_id, lot_id)
);

-- ─── Lot / batch tracking ───────────────────────────────────────────────────
CREATE TABLE inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  quantity DECIMAL(15, 4) NOT NULL DEFAULT 0,
  manufactured_at DATE,
  expires_at DATE,
  supplier_lot TEXT,
  notes TEXT,
  stock_status stock_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(factory_id, item_id, lot_number)
);

ALTER TABLE inventory_location_stock
  ADD CONSTRAINT inventory_location_stock_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES inventory_lots(id) ON DELETE SET NULL;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES inventory_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS balance_after DECIMAL(15, 4);

-- ─── Bill of materials ──────────────────────────────────────────────────────
CREATE TABLE inventory_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  finished_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  yield_quantity DECIMAL(15, 4) NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(finished_item_id, version)
);

CREATE TABLE inventory_bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_id UUID NOT NULL REFERENCES inventory_bom(id) ON DELETE CASCADE,
  component_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity_required DECIMAL(15, 4) NOT NULL,
  unit TEXT NOT NULL,
  scrap_factor DECIMAL(5, 4) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

-- ─── Quarantine / hold ──────────────────────────────────────────────────────
CREATE TABLE inventory_quarantine_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES inventory_lots(id) ON DELETE SET NULL,
  quantity DECIMAL(15, 4) NOT NULL,
  reason TEXT NOT NULL,
  status stock_status NOT NULL DEFAULT 'quarantine',
  held_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  released_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

-- ─── Cycle count schedules & variance rules ─────────────────────────────────
CREATE TABLE inventory_cycle_count_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  item_type_id UUID REFERENCES inventory_item_types(id) ON DELETE SET NULL,
  category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL,
  frequency cycle_count_frequency NOT NULL DEFAULT 'monthly',
  next_run_date DATE NOT NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_blind BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_variance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  max_variance_percent DECIMAL(5, 2) NOT NULL DEFAULT 2,
  max_variance_units DECIMAL(15, 4),
  auto_approve BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stock_counts
  ADD COLUMN IF NOT EXISTS is_blind BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES inventory_cycle_count_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS barcode_scanned TEXT,
  ADD COLUMN IF NOT EXISTS auto_approved BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── Purchase requisitions ────────────────────────────────────────────────────
CREATE TABLE purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  requisition_number TEXT NOT NULL,
  status requisition_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE(organization_id, requisition_number)
);

CREATE TABLE purchase_requisition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity DECIMAL(15, 4) NOT NULL,
  unit TEXT NOT NULL,
  estimated_unit_cost DECIMAL(15, 4),
  notes TEXT
);

-- ─── Sage inventory mapping ───────────────────────────────────────────────────
CREATE TABLE sage_inventory_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  sage_item_code TEXT NOT NULL,
  sage_warehouse_code TEXT,
  last_synced_at TIMESTAMPTZ,
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(item_id),
  UNIQUE(organization_id, sage_item_code)
);

-- ─── Inter-factory transfers ──────────────────────────────────────────────────
CREATE TABLE inventory_inter_factory_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  to_factory_id UUID NOT NULL REFERENCES factories(id) ON DELETE CASCADE,
  from_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  to_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity DECIMAL(15, 4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inventory_lots_item ON inventory_lots(item_id);
CREATE INDEX idx_inventory_bom_finished ON inventory_bom(finished_item_id);
CREATE INDEX idx_inventory_location_stock_item ON inventory_location_stock(item_id);
CREATE INDEX idx_purchase_requisitions_status ON purchase_requisitions(status);
CREATE INDEX idx_cycle_schedules_next_run ON inventory_cycle_count_schedules(next_run_date);
