-- Enterprise HR platform: policy engine, shifts, workflows, leave ledger,
-- cost centers, employment history, versioned policies, extended configuration.

-- ---------------------------------------------------------------------------
-- Branches / work locations
-- ---------------------------------------------------------------------------
CREATE TABLE hr_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  city TEXT,
  currency TEXT NOT NULL DEFAULT 'ETB',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

-- ---------------------------------------------------------------------------
-- Cost centers
-- ---------------------------------------------------------------------------
CREATE TABLE hr_cost_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  factory_id UUID REFERENCES factories(id) ON DELETE SET NULL,
  department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE hr_employee_cost_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  cost_center_id UUID NOT NULL REFERENCES hr_cost_centers(id) ON DELETE CASCADE,
  allocation_percent DECIMAL(5, 2) NOT NULL DEFAULT 100,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (allocation_percent > 0 AND allocation_percent <= 100)
);

-- ---------------------------------------------------------------------------
-- Shifts & work schedules (effective-dated)
-- ---------------------------------------------------------------------------
CREATE TABLE hr_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  break_minutes INTEGER NOT NULL DEFAULT 60,
  grace_minutes INTEGER NOT NULL DEFAULT 15,
  standard_hours DECIMAL(4, 2) NOT NULL DEFAULT 8,
  overtime_multiplier DECIMAL(4, 2) NOT NULL DEFAULT 1.5,
  is_overnight BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE hr_work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  working_days JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  weekend_days JSONB NOT NULL DEFAULT '[0,6]',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_schedule_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_id UUID REFERENCES hr_shifts(id) ON DELETE SET NULL,
  work_schedule_id UUID REFERENCES hr_work_schedules(id) ON DELETE SET NULL,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Versioned generic policies
-- ---------------------------------------------------------------------------
CREATE TABLE hr_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  policy_domain TEXT NOT NULL,
  policy_key TEXT NOT NULL,
  policy_value JSONB NOT NULL DEFAULT '{}',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hr_policy_versions_lookup
  ON hr_policy_versions(organization_id, policy_domain, policy_key, effective_from DESC);

-- ---------------------------------------------------------------------------
-- Flexible leave policy rules (criteria-based, effective-dated)
-- ---------------------------------------------------------------------------
CREATE TABLE hr_leave_policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES hr_leave_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  criteria JSONB NOT NULL DEFAULT '{}',
  annual_entitlement DECIMAL(5, 1) NOT NULL DEFAULT 0,
  accrual_monthly DECIMAL(5, 2) NOT NULL DEFAULT 0,
  max_carry_over DECIMAL(5, 1) NOT NULL DEFAULT 0,
  max_consecutive_days DECIMAL(5, 1),
  min_notice_days INTEGER NOT NULL DEFAULT 0,
  probation_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Approval workflows
-- ---------------------------------------------------------------------------
CREATE TABLE hr_approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE hr_approval_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES hr_approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  approver_type TEXT NOT NULL DEFAULT 'hr',
  approver_role_id UUID REFERENCES roles(id) ON DELETE SET NULL,
  approver_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  can_delegate BOOLEAN NOT NULL DEFAULT FALSE,
  escalate_after_hours INTEGER,
  UNIQUE (workflow_id, step_order)
);

CREATE TABLE hr_approval_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES hr_approval_workflows(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  current_step INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES hr_approval_instances(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  comment TEXT,
  acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Leave balance ledger (full audit trail)
-- ---------------------------------------------------------------------------
CREATE TABLE hr_leave_balance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type TEXT NOT NULL,
  leave_type_id UUID REFERENCES hr_leave_types(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL,
  days_delta DECIMAL(5, 2) NOT NULL,
  balance_after DECIMAL(5, 2) NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  reason TEXT,
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hr_leave_ledger_employee ON hr_leave_balance_ledger(employee_id, leave_type, effective_date DESC);

-- ---------------------------------------------------------------------------
-- Attendance corrections
-- ---------------------------------------------------------------------------
CREATE TABLE hr_attendance_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  attendance_record_id UUID REFERENCES attendance_records(id) ON DELETE SET NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  reason TEXT NOT NULL,
  old_clock_in TIMESTAMPTZ,
  new_clock_in TIMESTAMPTZ,
  old_clock_out TIMESTAMPTZ,
  new_clock_out TIMESTAMPTZ,
  old_status TEXT,
  new_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  corrected_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Employment history & benefits
-- ---------------------------------------------------------------------------
CREATE TABLE hr_employment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  effective_date DATE NOT NULL,
  department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  position_id UUID REFERENCES hr_positions(id) ON DELETE SET NULL,
  salary DECIMAL(15, 2),
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_employee_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  benefit_type TEXT NOT NULL,
  description TEXT,
  amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- Payroll categories & finance mapping
-- ---------------------------------------------------------------------------
CREATE TABLE hr_payroll_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category_type TEXT NOT NULL DEFAULT 'expense',
  sage_transaction_type TEXT NOT NULL DEFAULT 'payroll_expense',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, code)
);

CREATE TABLE hr_holiday_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  location TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE hr_notification_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  days_before INTEGER NOT NULL DEFAULT 0,
  recipient_roles JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, event_type)
);

-- ---------------------------------------------------------------------------
-- Extend existing tables
-- ---------------------------------------------------------------------------
ALTER TABLE hr_leave_types
  ADD COLUMN IF NOT EXISTS min_notice_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_consecutive_days DECIMAL(5, 1),
  ADD COLUMN IF NOT EXISTS probation_restricted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_attachment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expiry_months INTEGER,
  ADD COLUMN IF NOT EXISTS encashment_formula TEXT NOT NULL DEFAULT 'basic_salary_daily',
  ADD COLUMN IF NOT EXISTS encashment_fixed_rate DECIMAL(15, 2),
  ADD COLUMN IF NOT EXISTS allow_half_day BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_carry_forward BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE hr_holidays
  ADD COLUMN IF NOT EXISTS holiday_type TEXT NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES hr_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES hr_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eligibility JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES hr_holiday_import_batches(id) ON DELETE SET NULL;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES hr_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS probation_end_date DATE,
  ADD COLUMN IF NOT EXISTS contract_end_date DATE,
  ADD COLUMN IF NOT EXISTS work_location TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'ETB',
  ADD COLUMN IF NOT EXISTS seniority_level TEXT;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS is_half_day BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS half_day_period TEXT,
  ADD COLUMN IF NOT EXISTS attachment_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES hr_shifts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_remote BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE hr_payroll_runs
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_of_run_id UUID REFERENCES hr_payroll_runs(id) ON DELETE SET NULL;

ALTER TABLE hr_payroll_items
  ADD COLUMN IF NOT EXISTS unpaid_leave_deduction DECIMAL(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payroll_breakdown JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES hr_cost_centers(id) ON DELETE SET NULL;

ALTER TABLE hr_settings
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'ETB',
  ADD COLUMN IF NOT EXISTS default_work_schedule_id UUID,
  ADD COLUMN IF NOT EXISTS default_shift_id UUID,
  ADD COLUMN IF NOT EXISTS attendance_correction_requires_approval BOOLEAN NOT NULL DEFAULT TRUE;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX idx_hr_branches_org ON hr_branches(organization_id);
CREATE INDEX idx_hr_cost_centers_org ON hr_cost_centers(organization_id);
CREATE INDEX idx_hr_shifts_org ON hr_shifts(organization_id);
CREATE INDEX idx_hr_schedule_assignments_emp ON hr_schedule_assignments(employee_id, effective_from DESC);
CREATE INDEX idx_hr_leave_policy_rules_org ON hr_leave_policy_rules(organization_id, leave_type_id);
CREATE INDEX idx_hr_approval_instances_entity ON hr_approval_instances(entity_type, entity_id);
CREATE INDEX idx_hr_employment_history_emp ON hr_employment_history(employee_id, effective_date DESC);
CREATE INDEX idx_hr_holidays_extended ON hr_holidays(organization_id, holiday_date, holiday_type);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE hr_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_cost_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_schedule_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_approval_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_approval_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_leave_balance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_employee_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_payroll_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_holiday_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_notification_rules ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'hr_branches','hr_cost_centers','hr_employee_cost_allocations','hr_shifts',
    'hr_work_schedules','hr_schedule_assignments','hr_policy_versions',
    'hr_leave_policy_rules','hr_approval_workflows','hr_leave_balance_ledger',
    'hr_attendance_corrections','hr_employment_history','hr_employee_benefits',
    'hr_payroll_categories','hr_holiday_import_batches','hr_notification_rules',
    'hr_approval_instances'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (organization_id = get_user_organization_id())',
      tbl || '_org', tbl
    );
  END LOOP;
END $$;

CREATE POLICY hr_approval_workflow_steps_org ON hr_approval_workflow_steps FOR ALL USING (
  EXISTS (
    SELECT 1 FROM hr_approval_workflows w
    WHERE w.id = workflow_id AND w.organization_id = get_user_organization_id()
  )
);

CREATE POLICY hr_approval_actions_org ON hr_approval_actions FOR ALL USING (
  EXISTS (
    SELECT 1 FROM hr_approval_instances i
    WHERE i.id = instance_id AND i.organization_id = get_user_organization_id()
  )
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_hr_branches_updated BEFORE UPDATE ON hr_branches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_cost_centers_updated BEFORE UPDATE ON hr_cost_centers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_employee_cost_allocations_updated BEFORE UPDATE ON hr_employee_cost_allocations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_shifts_updated BEFORE UPDATE ON hr_shifts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_work_schedules_updated BEFORE UPDATE ON hr_work_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_schedule_assignments_updated BEFORE UPDATE ON hr_schedule_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_policy_versions_updated BEFORE UPDATE ON hr_policy_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_leave_policy_rules_updated BEFORE UPDATE ON hr_leave_policy_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_approval_workflows_updated BEFORE UPDATE ON hr_approval_workflows FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_attendance_corrections_updated BEFORE UPDATE ON hr_attendance_corrections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_employee_benefits_updated BEFORE UPDATE ON hr_employee_benefits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_notification_rules_updated BEFORE UPDATE ON hr_notification_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_hr_approval_instances_updated BEFORE UPDATE ON hr_approval_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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

SELECT add_audit_trigger_if_missing('hr_branches'::regclass);
SELECT add_audit_trigger_if_missing('hr_cost_centers'::regclass);
SELECT add_audit_trigger_if_missing('hr_shifts'::regclass);
SELECT add_audit_trigger_if_missing('hr_work_schedules'::regclass);
SELECT add_audit_trigger_if_missing('hr_leave_policy_rules'::regclass);
SELECT add_audit_trigger_if_missing('hr_approval_workflows'::regclass);
SELECT add_audit_trigger_if_missing('hr_leave_balance_ledger'::regclass);
SELECT add_audit_trigger_if_missing('hr_attendance_corrections'::regclass);
SELECT add_audit_trigger_if_missing('hr_employment_history'::regclass);
SELECT add_audit_trigger_if_missing('hr_employee_benefits'::regclass);
SELECT add_audit_trigger_if_missing('hr_payroll_categories'::regclass);

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO permissions (resource, action, description) VALUES
  ('hr', 'manage_policies', 'Configure HR policies, shifts, and workflows'),
  ('hr', 'self_service', 'Employee self-service for leave and attendance'),
  ('hr', 'view_salary', 'View sensitive salary and compensation data'),
  ('hr', 'approve_attendance', 'Approve attendance corrections'),
  ('hr', 'adjust_leave', 'Manual leave balance adjustments')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333337', id FROM permissions
WHERE resource = 'hr' AND action IN ('manage_policies', 'view_salary', 'approve_attendance', 'adjust_leave')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT '33333333-3333-3333-3333-333333333332', id FROM permissions
WHERE resource = 'hr' AND action IN ('read', 'view_salary', 'payroll')
ON CONFLICT DO NOTHING;

-- Default payroll categories
INSERT INTO hr_payroll_categories (organization_id, code, name, category_type, sage_transaction_type) VALUES
  ('11111111-1111-1111-1111-111111111111', 'SALARY', 'Base Salary', 'expense', 'payroll_expense'),
  ('11111111-1111-1111-1111-111111111111', 'ALLOWANCE', 'Allowances', 'expense', 'payroll_expense'),
  ('11111111-1111-1111-1111-111111111111', 'OVERTIME', 'Overtime Pay', 'expense', 'payroll_expense'),
  ('11111111-1111-1111-1111-111111111111', 'LEAVE_COMP', 'Leave Compensation', 'expense', 'payroll_expense'),
  ('11111111-1111-1111-1111-111111111111', 'BENEFIT', 'Employee Benefits', 'expense', 'payroll_expense'),
  ('11111111-1111-1111-1111-111111111111', 'TAX', 'Payroll Tax', 'deduction', 'payroll_expense')
ON CONFLICT (organization_id, code) DO NOTHING;

-- Default work schedule (Mon-Fri)
INSERT INTO hr_work_schedules (organization_id, name, working_days, weekend_days, is_default, effective_from)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Standard Mon-Fri',
  '[1,2,3,4,5]',
  '[0,6]',
  TRUE,
  CURRENT_DATE
);

-- Default shift
INSERT INTO hr_shifts (organization_id, code, name, start_time, end_time, break_minutes, grace_minutes)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'DAY',
  'Day Shift',
  '08:00',
  '17:00',
  60,
  15
);

-- Default leave approval workflow
INSERT INTO hr_approval_workflows (id, organization_id, code, name, entity_type) VALUES
  ('c3000001-0001-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111', 'LEAVE_STD', 'Standard Leave Approval', 'leave_request');

INSERT INTO hr_approval_workflow_steps (workflow_id, step_order, approver_type) VALUES
  ('c3000001-0001-4000-8000-000000000001', 1, 'manager'),
  ('c3000001-0001-4000-8000-000000000001', 2, 'hr');

-- Default notification rules
INSERT INTO hr_notification_rules (organization_id, event_type, enabled, days_before, recipient_roles) VALUES
  ('11111111-1111-1111-1111-111111111111', 'leave_pending_approval', TRUE, 0, '["hr_manager"]'),
  ('11111111-1111-1111-1111-111111111111', 'probation_expiring', TRUE, 14, '["hr_manager"]'),
  ('11111111-1111-1111-1111-111111111111', 'contract_expiring', TRUE, 30, '["hr_manager"]'),
  ('11111111-1111-1111-1111-111111111111', 'payroll_deadline', TRUE, 3, '["hr_manager"]')
ON CONFLICT (organization_id, event_type) DO NOTHING;
