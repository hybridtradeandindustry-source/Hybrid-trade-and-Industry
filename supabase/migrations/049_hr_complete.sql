-- Complete HR: employee profiles, leave types/policies, attendance metrics,
-- leave compensation, payroll runs, finance integration hooks.

-- ---------------------------------------------------------------------------
-- HR settings (org-wide policies)
-- ---------------------------------------------------------------------------
CREATE TABLE hr_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  work_start_time TIME NOT NULL DEFAULT '08:00',
  work_end_time TIME NOT NULL DEFAULT '17:00',
  late_grace_minutes INTEGER NOT NULL DEFAULT 15,
  standard_work_hours DECIMAL(4, 2) NOT NULL DEFAULT 8,
  overtime_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.5,
  leave_compensation_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  leave_compensation_daily_rate_divisor INTEGER NOT NULL DEFAULT 30,
  payroll_tax_rate_percent DECIMAL(5, 2) NOT NULL DEFAULT 0,
  payroll_day_of_month INTEGER NOT NULL DEFAULT 25,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Configurable leave types
-- ---------------------------------------------------------------------------
CREATE TABLE hr_leave_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  default_days DECIMAL(5, 1) NOT NULL DEFAULT 0,
  accrual_monthly DECIMAL(5, 2) NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  is_convertible BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  max_carry_over DECIMAL(5, 1) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

-- Department/position leave policy overrides
CREATE TABLE hr_leave_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES hr_leave_types(id) ON DELETE CASCADE,
  department_id UUID REFERENCES hr_departments(id) ON DELETE CASCADE,
  position_id UUID REFERENCES hr_positions(id) ON DELETE CASCADE,
  annual_entitlement DECIMAL(5, 1) NOT NULL,
  accrual_monthly DECIMAL(5, 2) NOT NULL DEFAULT 0,
  max_carry_over DECIMAL(5, 1) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  holiday_date DATE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Extend employees for full profiles
-- ---------------------------------------------------------------------------
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS manager_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS employment_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,
  ADD COLUMN IF NOT EXISTS monthly_allowances DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS termination_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ---------------------------------------------------------------------------
-- Extend leave balances & requests
-- ---------------------------------------------------------------------------
ALTER TABLE leave_balances
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES hr_leave_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accrued_days DECIMAL(5, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carry_over_days DECIMAL(5, 1) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS leave_type_id UUID REFERENCES hr_leave_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS days_count DECIMAL(5, 1),
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Extend attendance with computed metrics
-- ---------------------------------------------------------------------------
ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS working_hours DECIMAL(5, 2),
  ADD COLUMN IF NOT EXISTS overtime_hours DECIMAL(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_minutes INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS early_departure_minutes INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Leave-to-compensation conversion
-- ---------------------------------------------------------------------------
CREATE TABLE hr_leave_compensation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  leave_type_id UUID REFERENCES hr_leave_types(id) ON DELETE SET NULL,
  days_converted DECIMAL(5, 1) NOT NULL,
  daily_rate DECIMAL(15, 2) NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  payroll_run_id UUID,
  sage_transaction_id UUID REFERENCES sage_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Payroll
-- ---------------------------------------------------------------------------
CREATE TABLE hr_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_gross DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_net DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_expense DECIMAL(15, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  calculated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_payroll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id UUID NOT NULL REFERENCES hr_payroll_runs(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  base_salary DECIMAL(15, 2) NOT NULL DEFAULT 0,
  allowances DECIMAL(15, 2) NOT NULL DEFAULT 0,
  overtime_pay DECIMAL(15, 2) NOT NULL DEFAULT 0,
  bonus DECIMAL(15, 2) NOT NULL DEFAULT 0,
  leave_compensation DECIMAL(15, 2) NOT NULL DEFAULT 0,
  gross_pay DECIMAL(15, 2) NOT NULL DEFAULT 0,
  tax_deduction DECIMAL(15, 2) NOT NULL DEFAULT 0,
  other_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0,
  net_pay DECIMAL(15, 2) NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  sage_transaction_id UUID REFERENCES sage_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, employee_id)
);

ALTER TABLE hr_leave_compensation_requests
  ADD CONSTRAINT hr_leave_comp_requests_payroll_fk
  FOREIGN KEY (payroll_run_id) REFERENCES hr_payroll_runs(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_hr_leave_types_org ON hr_leave_types(organization_id);
CREATE INDEX idx_hr_leave_policies_org ON hr_leave_policies(organization_id);
CREATE INDEX idx_hr_holidays_org_date ON hr_holidays(organization_id, holiday_date);
CREATE INDEX idx_employees_manager ON employees(manager_employee_id);
CREATE INDEX idx_employees_status ON employees(employment_status);
CREATE INDEX idx_leave_requests_reviewed ON leave_requests(reviewed_at DESC);
CREATE INDEX idx_attendance_employee_date ON attendance_records(employee_id, shift_date DESC);
CREATE INDEX idx_hr_leave_comp_org ON hr_leave_compensation_requests(organization_id);
CREATE INDEX idx_hr_payroll_runs_org_period ON hr_payroll_runs(organization_id, period_start DESC);
CREATE INDEX idx_hr_payroll_items_run ON hr_payroll_items(payroll_run_id);
CREATE INDEX idx_hr_payroll_items_employee ON hr_payroll_items(employee_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE hr_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_compensation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_settings_org ON hr_settings FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_leave_types_org ON hr_leave_types FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_leave_policies_org ON hr_leave_policies FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_holidays_org ON hr_holidays FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_leave_comp_org ON hr_leave_compensation_requests FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_payroll_runs_org ON hr_payroll_runs FOR ALL USING (
  organization_id = get_user_organization_id()
);
CREATE POLICY hr_payroll_items_org ON hr_payroll_items FOR ALL USING (
  organization_id = get_user_organization_id()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_hr_settings_updated
  BEFORE UPDATE ON hr_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_leave_types_updated
  BEFORE UPDATE ON hr_leave_types FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_leave_policies_updated
  BEFORE UPDATE ON hr_leave_policies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_leave_comp_updated
  BEFORE UPDATE ON hr_leave_compensation_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_payroll_runs_updated
  BEFORE UPDATE ON hr_payroll_runs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_payroll_items_updated
  BEFORE UPDATE ON hr_payroll_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- Audit triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION add_audit_trigger_if_missing(target_table regclass)
RETURNS void AS $$
DECLARE
  trigger_name text := 'audit_' || target_table::text;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trigger_name, target_table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION create_audit_log()',
    trigger_name,
    target_table
  );
END;
$$ LANGUAGE plpgsql;

SELECT add_audit_trigger_if_missing('leave_balances'::regclass);
SELECT add_audit_trigger_if_missing('hr_leave_types'::regclass);
SELECT add_audit_trigger_if_missing('hr_leave_policies'::regclass);
SELECT add_audit_trigger_if_missing('hr_holidays'::regclass);
SELECT add_audit_trigger_if_missing('hr_leave_compensation_requests'::regclass);
SELECT add_audit_trigger_if_missing('hr_payroll_runs'::regclass);
SELECT add_audit_trigger_if_missing('hr_payroll_items'::regclass);
-- hr_settings uses organization_id as PK (no id column) — skip generic audit trigger

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO permissions (resource, action, description) VALUES
  ('hr', 'payroll', 'Process payroll and payslips'),
  ('hr', 'approve_leave', 'Approve or reject leave requests')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333337', id FROM permissions
WHERE resource = 'hr' AND action IN ('payroll', 'approve_leave')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333332', id FROM permissions
WHERE resource = 'hr' AND action = 'read'
ON CONFLICT DO NOTHING;

-- Default leave types for demo org
INSERT INTO hr_leave_types (organization_id, code, name, default_days, accrual_monthly, is_paid, is_convertible, sort_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'annual', 'Annual Leave', 21, 1.75, TRUE, TRUE, 1),
  ('11111111-1111-1111-1111-111111111111', 'sick', 'Sick Leave', 10, 0, TRUE, FALSE, 2),
  ('11111111-1111-1111-1111-111111111111', 'personal', 'Personal Leave', 5, 0, TRUE, FALSE, 3),
  ('11111111-1111-1111-1111-111111111111', 'unpaid', 'Unpaid Leave', 0, 0, FALSE, FALSE, 4),
  ('11111111-1111-1111-1111-111111111111', 'maternity', 'Maternity Leave', 90, 0, TRUE, FALSE, 5),
  ('11111111-1111-1111-1111-111111111111', 'paternity', 'Paternity Leave', 5, 0, TRUE, FALSE, 6);

INSERT INTO hr_settings (organization_id) VALUES
  ('11111111-1111-1111-1111-111111111111')
ON CONFLICT (organization_id) DO NOTHING;

-- Link existing leave balances to leave types
UPDATE leave_balances lb
SET leave_type_id = lt.id
FROM hr_leave_types lt
WHERE lb.organization_id = lt.organization_id
  AND LOWER(lb.leave_type) = LOWER(lt.code)
  AND lb.leave_type_id IS NULL;
