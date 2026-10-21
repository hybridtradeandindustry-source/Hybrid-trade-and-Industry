-- Block factory: purchasing, movement provenance, batch timeline

ALTER TABLE production_batches
  ADD COLUMN IF NOT EXISTS expected_completion_date date;

ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS source_module text;

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_phone text,
  contact_email text,
  address text,
  is_active boolean NOT NULL DEFAULT true,
  total_purchases numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS material_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES factories(id),
  purchase_number text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id),
  supplier_name text NOT NULL,
  material_type text NOT NULL,
  item_id uuid REFERENCES inventory_items(id),
  quantity numeric NOT NULL,
  unit text NOT NULL,
  unit_price numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  vehicle_plate text,
  delivery_notes text,
  purchase_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'ordered',
  received_at timestamptz,
  received_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_purchases_org ON material_purchases(organization_id, purchase_date DESC);
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(organization_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_org ON suppliers FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);

CREATE POLICY material_purchases_org ON material_purchases FOR ALL USING (
  organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
);
