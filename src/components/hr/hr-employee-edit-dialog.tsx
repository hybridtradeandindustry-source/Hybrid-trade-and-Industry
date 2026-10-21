"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { FACTORY_IDS, type Employee, type HrDepartment, type HrPosition } from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract"];
const EMPLOYMENT_STATUSES = ["active", "probation", "on_leave", "terminated", "resigned"];

export type EmployeeFormState = {
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  factory_id: string;
  department_id: string;
  position_id: string;
  manager_employee_id: string;
  employment_type: string;
  employment_status: string;
  salary: string;
  monthly_allowances: string;
  hire_date: string;
  date_of_birth: string;
  gender: string;
  address: string;
  city: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  bank_name: string;
  bank_account_number: string;
  tax_id: string;
  notes: string;
  work_location: string;
  probation_end_date: string;
  contract_end_date: string;
};

export function emptyEmployeeFormState(defaultFactoryId: string): EmployeeFormState {
  return {
    employee_number: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    factory_id: defaultFactoryId,
    department_id: "",
    position_id: "",
    manager_employee_id: "",
    employment_type: "full_time",
    employment_status: "active",
    salary: "",
    monthly_allowances: "",
    hire_date: new Date().toISOString().slice(0, 10),
    date_of_birth: "",
    gender: "",
    address: "",
    city: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    bank_name: "",
    bank_account_number: "",
    tax_id: "",
    notes: "",
    work_location: "",
    probation_end_date: "",
    contract_end_date: "",
  };
}

export function employeeToFormState(employee: Employee): EmployeeFormState {
  return {
    employee_number: employee.employee_number,
    first_name: employee.first_name ?? "",
    last_name: employee.last_name ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    factory_id: employee.factory_id ?? FACTORY_IDS.block,
    department_id: employee.department_id ?? "",
    position_id: employee.position_id ?? "",
    manager_employee_id: employee.manager_employee_id ?? "",
    employment_type: employee.employment_type ?? "full_time",
    employment_status: employee.employment_status ?? "active",
    salary: employee.salary != null ? String(employee.salary) : "",
    monthly_allowances:
      employee.monthly_allowances != null ? String(employee.monthly_allowances) : "",
    hire_date: employee.hire_date.slice(0, 10),
    date_of_birth: employee.date_of_birth?.slice(0, 10) ?? "",
    gender: employee.gender ?? "",
    address: employee.address ?? "",
    city: employee.city ?? "",
    emergency_contact_name: employee.emergency_contact_name ?? "",
    emergency_contact_phone: employee.emergency_contact_phone ?? "",
    bank_name: employee.bank_name ?? "",
    bank_account_number: employee.bank_account_number ?? "",
    tax_id: employee.tax_id ?? "",
    notes: employee.notes ?? "",
    work_location: employee.work_location ?? "",
    probation_end_date: employee.probation_end_date?.slice(0, 10) ?? "",
    contract_end_date: employee.contract_end_date?.slice(0, 10) ?? "",
  };
}

export function buildEmployeePayload(
  form: EmployeeFormState,
  positions: HrPosition[],
  options: { employeeId?: string; mode: "create" | "update" }
): Record<string, unknown> {
  const selectedPos = positions.find((p) => p.id === form.position_id);
  return {
    action: options.mode === "update" ? "update_employee" : "create_employee",
    ...(options.employeeId ? { id: options.employeeId } : {}),
    employee_number: form.employee_number.trim(),
    first_name: form.first_name || undefined,
    last_name: form.last_name || undefined,
    email: form.email || undefined,
    phone: form.phone || undefined,
    factory_id: form.factory_id,
    department_id: form.department_id || undefined,
    position_id: form.position_id,
    manager_employee_id: form.manager_employee_id || undefined,
    position: selectedPos?.title ?? "Staff",
    employment_type: form.employment_type,
    employment_status: form.employment_status,
    salary: form.salary ? Number(form.salary) : undefined,
    monthly_allowances: form.monthly_allowances ? Number(form.monthly_allowances) : undefined,
    hire_date: form.hire_date,
    date_of_birth: form.date_of_birth || undefined,
    gender: form.gender || undefined,
    address: form.address || undefined,
    city: form.city || undefined,
    emergency_contact_name: form.emergency_contact_name || undefined,
    emergency_contact_phone: form.emergency_contact_phone || undefined,
    bank_name: form.bank_name || undefined,
    bank_account_number: form.bank_account_number || undefined,
    tax_id: form.tax_id || undefined,
    notes: form.notes || undefined,
    work_location: form.work_location || undefined,
    probation_end_date: form.probation_end_date || undefined,
    contract_end_date: form.contract_end_date || undefined,
  };
}

type ManagerOption = Pick<Employee, "id" | "employee_number" | "first_name" | "last_name">;

interface HrEmployeeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee | null;
  departments: HrDepartment[];
  positions: HrPosition[];
  managers: ManagerOption[];
  canViewSalary?: boolean;
  isSubmitting?: boolean;
  onSubmit: (form: EmployeeFormState) => void;
}

function employeeLabel(employee: ManagerOption) {
  const name = [employee.first_name, employee.last_name].filter(Boolean).join(" ");
  return `${employee.employee_number}${name ? ` — ${name}` : ""}`;
}

export function HrEmployeeEditDialog({
  open,
  onOpenChange,
  employee,
  departments,
  positions,
  managers,
  canViewSalary = true,
  isSubmitting = false,
  onSubmit,
}: HrEmployeeEditDialogProps) {
  const defaultFactoryId = employee?.factory_id ?? FACTORY_IDS.block;
  const [form, setForm] = useState<EmployeeFormState>(() =>
    employee ? employeeToFormState(employee) : emptyEmployeeFormState(defaultFactoryId)
  );

  useEffect(() => {
    if (open) {
      setForm(
        employee ? employeeToFormState(employee) : emptyEmployeeFormState(defaultFactoryId)
      );
    }
  }, [open, employee, defaultFactoryId]);

  const assignmentIds = useMemo(
    () => ({
      departmentIds: employee?.department_id ? [employee.department_id] : [],
      positionIds: employee?.position_id ? [employee.position_id] : [],
    }),
    [employee]
  );

  const departmentsForFactory = (factoryId: string) => {
    const active = departments.filter((d) => d.factory_id === factoryId && d.is_active);
    const extras = departments.filter(
      (d) =>
        assignmentIds.departmentIds.includes(d.id) &&
        !d.is_active &&
        !active.some((item) => item.id === d.id)
    );
    return [...active, ...extras];
  };

  const positionsForFactory = (factoryId: string) => {
    const active = positions.filter((p) => p.factory_id === factoryId && p.is_active);
    const extras = positions.filter(
      (p) =>
        assignmentIds.positionIds.includes(p.id) &&
        !p.is_active &&
        !active.some((item) => item.id === p.id)
    );
    return [...active, ...extras];
  };

  return (
    <EntityFormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={employee ? "Edit Employee" : "Add Employee"}
      submitLabel={employee ? "Save Changes" : "Add Employee"}
      isSubmitting={isSubmitting}
      contentClassName="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
      onSubmit={() => onSubmit(form)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Employee Number</Label>
          <Input
            value={form.employee_number}
            onChange={(e) => setForm((f) => ({ ...f, employee_number: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Hire Date</Label>
          <Input
            type="date"
            value={form.hire_date}
            onChange={(e) => setForm((f) => ({ ...f, hire_date: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>First Name</Label>
          <Input
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Last Name</Label>
          <Input
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Factory</Label>
        <Select
          value={form.factory_id}
          onValueChange={(v) => {
            const depts = departmentsForFactory(v);
            const pos = positionsForFactory(v);
            setForm((f) => ({
              ...f,
              factory_id: v,
              department_id: depts[0]?.id ?? "",
              position_id: pos[0]?.id ?? "",
            }));
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FACTORY_NAMES).map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Department</Label>
          <Select
            value={form.department_id}
            onValueChange={(v) => setForm((f) => ({ ...f, department_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select department" />
            </SelectTrigger>
            <SelectContent>
              {departmentsForFactory(form.factory_id).map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                  {!d.is_active ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Position</Label>
          <Select
            value={form.position_id}
            onValueChange={(v) => setForm((f) => ({ ...f, position_id: v }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select position" />
            </SelectTrigger>
            <SelectContent>
              {positionsForFactory(form.factory_id).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                  {p.grade ? ` (${p.grade})` : ""}
                  {!p.is_active ? " — inactive" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Employment Type</Label>
          <Select
            value={form.employment_type}
            onValueChange={(v) => setForm((f) => ({ ...f, employment_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">
                  {t.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Employment Status</Label>
          <Select
            value={form.employment_status}
            onValueChange={(v) => setForm((f) => ({ ...f, employment_status: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {canViewSalary && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Monthly Salary</Label>
            <Input
              type="number"
              min="0"
              value={form.salary}
              onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Monthly Allowances</Label>
            <Input
              type="number"
              min="0"
              value={form.monthly_allowances}
              onChange={(e) => setForm((f) => ({ ...f, monthly_allowances: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input
              value={form.bank_name}
              onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Bank Account</Label>
            <Input
              value={form.bank_account_number}
              onChange={(e) => setForm((f) => ({ ...f, bank_account_number: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Tax ID (TIN)</Label>
            <Input
              value={form.tax_id}
              onChange={(e) => setForm((f) => ({ ...f, tax_id: e.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Reporting Manager</Label>
          <Select
            value={form.manager_employee_id || "__none__"}
            onValueChange={(v) =>
              setForm((f) => ({
                ...f,
                manager_employee_id: v === "__none__" ? "" : v,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Optional" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {managers.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {employeeLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Work Location</Label>
          <Input
            value={form.work_location}
            onChange={(e) => setForm((f) => ({ ...f, work_location: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Probation End</Label>
          <Input
            type="date"
            value={form.probation_end_date}
            onChange={(e) => setForm((f) => ({ ...f, probation_end_date: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Contract End</Label>
          <Input
            type="date"
            value={form.contract_end_date}
            onChange={(e) => setForm((f) => ({ ...f, contract_end_date: e.target.value }))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Date of Birth</Label>
          <Input
            type="date"
            value={form.date_of_birth}
            onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Gender</Label>
          <Input
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Address</Label>
          <Input
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>City</Label>
          <Input
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Emergency Contact</Label>
          <Input
            value={form.emergency_contact_name}
            onChange={(e) => setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))}
          />
        </div>
        <div className="space-y-2">
          <Label>Emergency Phone</Label>
          <Input
            value={form.emergency_contact_phone}
            onChange={(e) => setForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
        />
      </div>
    </EntityFormDialog>
  );
}
