"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import type { HrCostCenter, HrLeavePolicyRule, HrLeaveType, HrShift, HrWorkSchedule } from "@/types";

interface HrPoliciesPanelProps {
  shifts: HrShift[];
  workSchedules: HrWorkSchedule[];
  leavePolicyRules: HrLeavePolicyRule[];
  leaveTypes: HrLeaveType[];
  costCenters: HrCostCenter[];
  canManage: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => void;
}

export function HrPoliciesPanel({
  shifts,
  workSchedules,
  leavePolicyRules,
  leaveTypes,
  costCenters,
  canManage,
  onAction,
}: HrPoliciesPanelProps) {
  const [shiftOpen, setShiftOpen] = useState(false);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState({ code: "", name: "", start_time: "08:00", end_time: "17:00" });
  const [ruleForm, setRuleForm] = useState({
    leave_type_id: leaveTypes[0]?.id ?? "",
    name: "",
    annual_entitlement: "21",
    department_id: "",
  });
  const [importText, setImportText] = useState("");

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Shifts</CardTitle>
            <CardDescription>Configurable work shifts with grace periods and overtime rules</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setShiftOpen(true)}>Add Shift</Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            data={shifts}
            getRowKey={(r) => r.id}
            columns={[
              { id: "code", header: "Code", cell: (r) => r.code },
              { id: "name", header: "Name", cell: (r) => r.name },
              { id: "hours", header: "Hours", cell: (r) => `${r.start_time} – ${r.end_time}` },
              { id: "grace", header: "Grace (min)", cell: (r) => r.grace_minutes },
              { id: "ot", header: "OT Mult.", cell: (r) => r.overtime_multiplier },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Work Schedules</CardTitle>
          <CardDescription>Working days and weekends — effective-dated policies</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={workSchedules}
            getRowKey={(r) => r.id}
            columns={[
              { id: "name", header: "Name", cell: (r) => r.name },
              { id: "working", header: "Working Days", cell: (r) => r.working_days.join(", ") },
              { id: "weekend", header: "Weekends", cell: (r) => r.weekend_days.join(", ") },
              { id: "from", header: "Effective From", cell: (r) => r.effective_from },
              { id: "default", header: "Default", cell: (r) => (r.is_default ? "Yes" : "—") },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Leave Policy Rules</CardTitle>
            <CardDescription>Criteria-based rules by department, position, employment type, etc.</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setRuleOpen(true)}>Add Rule</Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            data={leavePolicyRules}
            getRowKey={(r) => r.id}
            columns={[
              { id: "name", header: "Rule", cell: (r) => r.name },
              {
                id: "type",
                header: "Leave Type",
                cell: (r) => leaveTypes.find((t) => t.id === r.leave_type_id)?.name ?? r.leave_type_id,
              },
              { id: "entitlement", header: "Days/Year", cell: (r) => r.annual_entitlement },
              { id: "priority", header: "Priority", cell: (r) => r.priority },
              {
                id: "criteria",
                header: "Criteria",
                cell: (r) => JSON.stringify(r.criteria),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Cost Centers</CardTitle>
            <CardDescription>For payroll and finance allocation by department/project</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setImportOpen(true)}>Import Holidays (JSON)</Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            data={costCenters}
            getRowKey={(r) => r.id}
            columns={[
              { id: "code", header: "Code", cell: (r) => r.code },
              { id: "name", header: "Name", cell: (r) => r.name },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog open={shiftOpen} onOpenChange={setShiftOpen} title="Add Shift" onSubmit={() => {
        onAction({ action: "upsert_shift", ...shiftForm }, "Shift saved");
        setShiftOpen(false);
      }}>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Code</Label><Input value={shiftForm.code} onChange={(e) => setShiftForm((f) => ({ ...f, code: e.target.value }))} /></div>
          <div className="grid gap-2"><Label>Name</Label><Input value={shiftForm.name} onChange={(e) => setShiftForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2"><Label>Start</Label><Input type="time" value={shiftForm.start_time} onChange={(e) => setShiftForm((f) => ({ ...f, start_time: e.target.value }))} /></div>
            <div className="grid gap-2"><Label>End</Label><Input type="time" value={shiftForm.end_time} onChange={(e) => setShiftForm((f) => ({ ...f, end_time: e.target.value }))} /></div>
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog open={ruleOpen} onOpenChange={setRuleOpen} title="Add Leave Policy Rule" onSubmit={() => {
        onAction({
          action: "upsert_leave_policy_rule",
          leave_type_id: ruleForm.leave_type_id,
          name: ruleForm.name,
          annual_entitlement: Number(ruleForm.annual_entitlement),
          criteria: ruleForm.department_id ? { department_id: ruleForm.department_id } : {},
        }, "Policy rule saved");
        setRuleOpen(false);
      }}>
        <div className="grid gap-4">
          <div className="grid gap-2"><Label>Rule Name</Label><Input value={ruleForm.name} onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))} /></div>
          <div className="grid gap-2"><Label>Annual Entitlement</Label><Input type="number" value={ruleForm.annual_entitlement} onChange={(e) => setRuleForm((f) => ({ ...f, annual_entitlement: e.target.value }))} /></div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog open={importOpen} onOpenChange={setImportOpen} title="Import Holidays" onSubmit={() => {
        try {
          const holidays = JSON.parse(importText) as Array<{ name: string; holiday_date: string }>;
          onAction({ action: "import_holidays", year: new Date().getFullYear(), holidays }, "Holidays imported");
          setImportOpen(false);
        } catch {
          onAction({ action: "import_holidays", year: new Date().getFullYear(), holidays: [] }, "Invalid JSON");
        }
      }}>
        <div className="grid gap-2">
          <Label>JSON Array</Label>
          <textarea
            className="min-h-32 w-full rounded-md border bg-background p-2 text-sm"
            placeholder='[{"name":"New Year","holiday_date":"2026-01-01"}]'
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
        </div>
      </EntityFormDialog>
    </div>
  );
}
