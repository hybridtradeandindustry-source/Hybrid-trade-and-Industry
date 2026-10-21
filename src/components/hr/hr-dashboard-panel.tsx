"use client";

import { BarChart3, Calendar, Clock, Users, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { HrDashboardMetrics } from "@/types";

interface HrDashboardPanelProps {
  dashboard: HrDashboardMetrics;
}

export function HrDashboardPanel({ dashboard }: HrDashboardPanelProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="Headcount" value={dashboard.headcount} icon={<Users className="size-4" />} />
        <MetricCard title="Active" value={dashboard.activeEmployees} icon={<Users className="size-4" />} />
        <MetricCard title="On Probation" value={dashboard.onProbation} icon={<Users className="size-4" />} />
        <MetricCard title="Absent Today" value={dashboard.absentToday} icon={<Clock className="size-4" />} />
        <MetricCard title="Pending Leave" value={dashboard.pendingLeave} icon={<Calendar className="size-4" />} />
        <MetricCard title="Pending Approvals" value={dashboard.pendingApprovals} icon={<BarChart3 className="size-4" />} />
        <MetricCard
          title="Overtime (Month)"
          value={`${dashboard.overtimeHoursMonth}h`}
          icon={<Clock className="size-4" />}
        />
        <MetricCard
          title="Payroll Expense"
          value={formatCurrency(dashboard.payrollExpenseMonth)}
          icon={<Wallet className="size-4" />}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Leave Liability</CardTitle>
            <CardDescription>Total unused leave days across all employees</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{dashboard.leaveLiabilityDays} days</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Expiring Soon</CardTitle>
            <CardDescription>Contracts and probation ending within 30 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Contracts expiring: <strong>{dashboard.contractsExpiring30}</strong></p>
            <p>Probation ending: <strong>{dashboard.probationExpiring30}</strong></p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Upcoming Holidays</CardTitle>
        </CardHeader>
        <CardContent>
          {dashboard.upcomingHolidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming holidays configured.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dashboard.upcomingHolidays.map((h) => (
                <li key={h.id} className="flex justify-between border-b border-border/40 pb-2">
                  <span>{h.name}</span>
                  <span className="text-muted-foreground">{formatDate(h.holiday_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
