"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EntityFormDialog } from "@/components/crud/entity-form-dialog";
import { formatDate } from "@/lib/utils";
import type { HrHoliday, HrLeaveType, HrSettings } from "@/types";

interface HrSettingsPanelProps {
  settings: HrSettings;
  leaveTypes: HrLeaveType[];
  holidays: HrHoliday[];
  canManage: boolean;
  onAction: (payload: Record<string, unknown>, success: string) => void;
}

export function HrSettingsPanel({
  settings,
  leaveTypes,
  holidays,
  canManage,
  onAction,
}: HrSettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [leaveTypeOpen, setLeaveTypeOpen] = useState(false);
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    code: "",
    name: "",
    default_days: "0",
    accrual_monthly: "0",
    is_convertible: false,
  });
  const [holidayForm, setHolidayForm] = useState({ name: "", holiday_date: "" });

  const saveSettings = () => {
    onAction({ action: "update_hr_settings", settings: localSettings }, "HR settings saved");
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings2 className="size-5" />
            Company HR Policies
          </CardTitle>
          <CardDescription>Work hours, attendance rules, payroll tax, and leave compensation</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Work Start</Label>
            <Input
              type="time"
              value={localSettings.work_start_time}
              disabled={!canManage}
              onChange={(e) => setLocalSettings((s) => ({ ...s, work_start_time: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Work End</Label>
            <Input
              type="time"
              value={localSettings.work_end_time}
              disabled={!canManage}
              onChange={(e) => setLocalSettings((s) => ({ ...s, work_end_time: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Late Grace (minutes)</Label>
            <Input
              type="number"
              value={localSettings.late_grace_minutes}
              disabled={!canManage}
              onChange={(e) =>
                setLocalSettings((s) => ({ ...s, late_grace_minutes: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Standard Work Hours</Label>
            <Input
              type="number"
              step="0.5"
              value={localSettings.standard_work_hours}
              disabled={!canManage}
              onChange={(e) =>
                setLocalSettings((s) => ({ ...s, standard_work_hours: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Overtime Multiplier</Label>
            <Input
              type="number"
              step="0.1"
              value={localSettings.overtime_multiplier}
              disabled={!canManage}
              onChange={(e) =>
                setLocalSettings((s) => ({ ...s, overtime_multiplier: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Payroll Tax Rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={localSettings.payroll_tax_rate_percent}
              disabled={!canManage}
              onChange={(e) =>
                setLocalSettings((s) => ({ ...s, payroll_tax_rate_percent: Number(e.target.value) }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label>Leave Comp. Daily Rate Divisor</Label>
            <Input
              type="number"
              value={localSettings.leave_compensation_daily_rate_divisor}
              disabled={!canManage}
              onChange={(e) =>
                setLocalSettings((s) => ({
                  ...s,
                  leave_compensation_daily_rate_divisor: Number(e.target.value),
                }))
              }
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch
              checked={localSettings.leave_compensation_enabled}
              disabled={!canManage}
              onCheckedChange={(checked) =>
                setLocalSettings((s) => ({ ...s, leave_compensation_enabled: checked === true }))
              }
            />
            <Label>Enable leave-to-compensation conversion</Label>
          </div>
          {canManage && (
            <div className="md:col-span-2 flex gap-2">
              <Button onClick={saveSettings}>Save Settings</Button>
              <Button
                variant="outline"
                onClick={() =>
                  onAction({ action: "run_leave_accrual" }, "Leave accrual processed")
                }
              >
                Run Monthly Accrual
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Leave Types</CardTitle>
            <CardDescription>Configurable leave categories with accrual and conversion rules</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setLeaveTypeOpen(true)}>
              Add Leave Type
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            data={leaveTypes}
            getRowKey={(row) => row.id}
            columns={[
              { id: "code", header: "Code", cell: (row) => row.code },
              { id: "name", header: "Name", cell: (row) => row.name },
              { id: "days", header: "Default Days", cell: (row) => row.default_days },
              { id: "accrual", header: "Monthly Accrual", cell: (row) => row.accrual_monthly },
              {
                id: "flags",
                header: "Flags",
                cell: (row) =>
                  [
                    row.is_paid ? "Paid" : "Unpaid",
                    row.is_convertible ? "Convertible" : null,
                    row.requires_approval ? "Approval" : "Auto",
                  ]
                    .filter(Boolean)
                    .join(" · "),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Public Holidays</CardTitle>
            <CardDescription>Excluded from leave day calculations</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setHolidayOpen(true)}>
              Add Holiday
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <DataTable
            data={holidays}
            getRowKey={(row) => row.id}
            columns={[
              { id: "name", header: "Name", cell: (row) => row.name },
              { id: "date", header: "Date", cell: (row) => formatDate(row.holiday_date) },
              {
                id: "actions",
                header: "",
                cell: (row) =>
                  canManage ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        onAction({ action: "delete_holiday", id: row.id }, "Holiday removed")
                      }
                    >
                      Remove
                    </Button>
                  ) : null,
              },
            ]}
          />
        </CardContent>
      </Card>

      <EntityFormDialog
        open={leaveTypeOpen}
        onOpenChange={setLeaveTypeOpen}
        title="Add Leave Type"
        onSubmit={() => {
          onAction(
            {
              action: "upsert_leave_type",
              code: leaveTypeForm.code,
              name: leaveTypeForm.name,
              default_days: Number(leaveTypeForm.default_days),
              accrual_monthly: Number(leaveTypeForm.accrual_monthly),
              is_convertible: leaveTypeForm.is_convertible,
            },
            "Leave type saved"
          );
          setLeaveTypeOpen(false);
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Code</Label>
            <Input
              value={leaveTypeForm.code}
              onChange={(e) => setLeaveTypeForm((f) => ({ ...f, code: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={leaveTypeForm.name}
              onChange={(e) => setLeaveTypeForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Default Days</Label>
              <Input
                type="number"
                value={leaveTypeForm.default_days}
                onChange={(e) => setLeaveTypeForm((f) => ({ ...f, default_days: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label>Monthly Accrual</Label>
              <Input
                type="number"
                step="0.25"
                value={leaveTypeForm.accrual_monthly}
                onChange={(e) => setLeaveTypeForm((f) => ({ ...f, accrual_monthly: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={leaveTypeForm.is_convertible}
              onCheckedChange={(checked) =>
                setLeaveTypeForm((f) => ({ ...f, is_convertible: checked === true }))
              }
            />
            <Label>Eligible for compensation conversion</Label>
          </div>
        </div>
      </EntityFormDialog>

      <EntityFormDialog
        open={holidayOpen}
        onOpenChange={setHolidayOpen}
        title="Add Holiday"
        onSubmit={() => {
          onAction(
            {
              action: "create_holiday",
              name: holidayForm.name,
              holiday_date: holidayForm.holiday_date,
            },
            "Holiday added"
          );
          setHolidayOpen(false);
        }}
      >
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={holidayForm.name}
              onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={holidayForm.holiday_date}
              onChange={(e) => setHolidayForm((f) => ({ ...f, holiday_date: e.target.value }))}
            />
          </div>
        </div>
      </EntityFormDialog>
    </div>
  );
}
