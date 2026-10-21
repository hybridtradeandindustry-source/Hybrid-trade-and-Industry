"use client";

import { useState } from "react";
import { Banknote, Calculator, CheckCircle, Play } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Employee, HrPayrollItem, HrPayrollRun } from "@/types";

interface HrPayrollPanelProps {
  payrollRuns: HrPayrollRun[];
  payrollItems: HrPayrollItem[];
  employees: Employee[];
  canPayroll: boolean;
  defaultFactoryId: string;
  onAction: (payload: Record<string, unknown>, success: string) => void;
  onSelectRun: (runId: string) => void;
  selectedRunId?: string;
}

function employeeLabel(employees: Employee[], id: string) {
  const emp = employees.find((e) => e.id === id);
  if (!emp) return id.slice(0, 8);
  const name = [emp.first_name, emp.last_name].filter(Boolean).join(" ");
  return name || emp.employee_number;
}

export function HrPayrollPanel({
  payrollRuns,
  payrollItems,
  employees,
  canPayroll,
  defaultFactoryId,
  onAction,
  onSelectRun,
  selectedRunId,
}: HrPayrollPanelProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    period_start: "",
    period_end: "",
    notes: "",
    factory_id: defaultFactoryId,
  });

  const activeRun = payrollRuns.find((r) => r.id === selectedRunId) ?? payrollRuns[0];

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-5" />
              Payroll Runs
            </CardTitle>
            <CardDescription>
              Monthly payroll calculation, approval, and payment with automatic finance posting
            </CardDescription>
          </div>
          {canPayroll && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              New Payroll Run
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            data={payrollRuns}
            getRowKey={(row) => row.id}
            columns={[
              {
                id: "period",
                header: "Period",
                cell: (row) => (
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => onSelectRun(row.id)}
                  >
                    {formatDate(row.period_start)} — {formatDate(row.period_end)}
                  </button>
                ),
              },
              {
                id: "status",
                header: "Status",
                cell: (row) => (
                  <StatusBadge
                    status={
                      row.status === "paid"
                        ? "completed"
                        : row.status === "approved" || row.status === "calculated"
                          ? "confirmed"
                          : row.status === "draft"
                            ? "draft"
                            : "pending"
                    }
                    label={row.status}
                  />
                ),
              },
              {
                id: "gross",
                header: "Gross",
                cell: (row) => formatCurrency(row.total_gross),
              },
              {
                id: "net",
                header: "Net Pay",
                cell: (row) => formatCurrency(row.total_net),
              },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  canPayroll ? (
                    <div className="flex flex-wrap gap-1">
                      {row.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1"
                          onClick={() =>
                            onAction({ action: "calculate_payroll", id: row.id }, "Payroll calculated")
                          }
                        >
                          <Calculator className="size-3" />
                          Calculate
                        </Button>
                      )}
                      {row.status === "calculated" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1"
                          onClick={() =>
                            onAction({ action: "approve_payroll", id: row.id }, "Payroll approved")
                          }
                        >
                          <CheckCircle className="size-3" />
                          Approve
                        </Button>
                      )}
                      {row.status === "approved" && (
                        <Button
                          size="sm"
                          className="h-7 gap-1"
                          onClick={() =>
                            onAction({ action: "pay_payroll", id: row.id }, "Payroll paid & posted to finance")
                          }
                        >
                          <Play className="size-3" />
                          Pay & Post
                        </Button>
                      )}
                    </div>
                  ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>

      {activeRun && (
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Payslips — {formatDate(activeRun.period_start)} to {formatDate(activeRun.period_end)}</CardTitle>
            <CardDescription>
              Per-employee breakdown: salary, allowances, overtime, leave compensation, deductions
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payrollItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payslip lines yet. Calculate the payroll run to generate items.
              </p>
            ) : (
              <DataTable
                data={payrollItems}
                getRowKey={(row) => row.id}
                columns={[
                  {
                    id: "employee",
                    header: "Employee",
                    cell: (row) => employeeLabel(employees, row.employee_id),
                  },
                  { id: "base", header: "Base", cell: (row) => formatCurrency(row.base_salary) },
                  { id: "allow", header: "Allowances", cell: (row) => formatCurrency(row.allowances) },
                  { id: "ot", header: "Overtime", cell: (row) => formatCurrency(row.overtime_pay) },
                  { id: "lc", header: "Leave Comp.", cell: (row) => formatCurrency(row.leave_compensation) },
                  { id: "gross", header: "Gross", cell: (row) => formatCurrency(row.gross_pay) },
                  { id: "tax", header: "Tax", cell: (row) => formatCurrency(row.tax_deduction) },
                  { id: "net", header: "Net", cell: (row) => formatCurrency(row.net_pay) },
                  {
                    id: "status",
                    header: "Payment",
                    cell: (row) => (
                      <StatusBadge
                        status={row.payment_status === "paid" ? "completed" : "pending"}
                        label={row.payment_status}
                      />
                    ),
                  },
                ]}
              />
            )}
          </CardContent>
        </Card>
      )}

      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Create Payroll Run"
        description="Define the pay period for this payroll run"
        onSubmit={() => {
          if (!form.period_start || !form.period_end) {
            toast.error("Period start and end dates are required");
            return;
          }
          onAction(
            {
              action: "create_payroll_run",
              factory_id: form.factory_id,
              period_start: form.period_start,
              period_end: form.period_end,
              notes: form.notes,
            },
            "Payroll run created"
          );
          setCreateOpen(false);
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Period Start</Label>
            <Input
              type="date"
              value={form.period_start}
              onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Period End</Label>
            <Input
              type="date"
              value={form.period_end}
              onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>
      </EntityFormDialog>
    </div>
  );
}
