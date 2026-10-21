-- Enterprise HR: departments, positions, employee profiles, leave balances, attendance status

CREATE TABLE hr_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  manager_employee_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE hr_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  grade TEXT,
  description TEXT,
  headcount_limit INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES hr_positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS employment_type TEXT NOT NULL DEFAULT 'full_time',
  ADD COLUMN IF NOT EXISTS salary DECIMAL(15, 2);

ALTER TABLE hr_departments
  ADD CONSTRAINT hr_departments_manager_fk
  FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'present';

CREATE TABLE leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  balance_days DECIMAL(5, 1) NOT NULL DEFAULT 0,
  used_days DECIMAL(5, 1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, leave_type)
);

CREATE INDEX idx_hr_departments_org_factory ON hr_departments(organization_id, factory_id);
CREATE INDEX idx_hr_positions_org_factory ON hr_positions(organization_id, factory_id);
CREATE INDEX idx_hr_positions_department ON hr_positions(department_id);
CREATE INDEX idx_employees_department ON employees(department_id);
CREATE INDEX idx_employees_position ON employees(position_id);
CREATE INDEX idx_attendance_shift_date ON attendance_records(shift_date DESC);
CREATE INDEX idx_leave_balances_employee ON leave_balances(employee_id);

ALTER TABLE hr_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_departments_org ON hr_departments FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_positions_org ON hr_positions FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY leave_balances_org ON leave_balances FOR ALL USING (
  organization_id = get_user_organization_id()
);

CREATE TRIGGER trg_hr_departments_updated
  BEFORE UPDATE ON hr_departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_positions_updated
  BEFORE UPDATE ON hr_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_leave_balances_updated
  BEFORE UPDATE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Block Factory departments & positions
INSERT INTO hr_departments (id, organization_id, factory_id, code, name, description) VALUES
  ('a1000001-0001-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 'BLK-PROD', 'Production', 'Block manufacturing and curing'),
  ('a1000001-0001-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 'BLK-WH', 'Warehouse & Logistics', 'Raw materials and finished goods handling'),
  ('a1000001-0001-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221', 'BLK-QA', 'Quality Assurance', 'Batch quality and compliance'),
  ('a1000001-0001-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'REC-PROD', 'Recycling Production', 'Plastic processing lines'),
  ('a1000001-0001-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'REC-OPS', 'Operations', 'Plant operations and scheduling'),
  ('a1000001-0001-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'REC-MAINT', 'Maintenance', 'Equipment upkeep and safety');

INSERT INTO hr_positions (id, organization_id, department_id, factory_id, title, grade, headcount_limit, description) VALUES
  ('b2000001-0001-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000001', '22222222-2222-2222-2222-222222222221', 'Production Supervisor', 'L3', 2, 'Supervises curing and batch output'),
  ('b2000001-0001-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000001', '22222222-2222-2222-2222-222222222221', 'Production Operator', 'L1', 12, 'Operates block production line'),
  ('b2000001-0001-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000002', '22222222-2222-2222-2222-222222222221', 'Warehouse Officer', 'L2', 4, 'Inventory receipts and issues'),
  ('b2000001-0001-4000-8000-000000000004', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000003', '22222222-2222-2222-2222-222222222221', 'QA Inspector', 'L2', 3, 'Checkpoint quality checks'),
  ('b2000001-0001-4000-8000-000000000005', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000004', '22222222-2222-2222-2222-222222222222', 'Line Operator', 'L1', 8, 'Recycling line operator'),
  ('b2000001-0001-4000-8000-000000000006', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000005', '22222222-2222-2222-2222-222222222222', 'Shift Lead', 'L3', 2, 'Shift supervision for recycling'),
  ('b2000001-0001-4000-8000-000000000007', '11111111-1111-1111-1111-111111111111', 'a1000001-0001-4000-8000-000000000006', '22222222-2222-2222-2222-222222222222', 'Maintenance Technician', 'L2', 3, 'Preventive and corrective maintenance');
