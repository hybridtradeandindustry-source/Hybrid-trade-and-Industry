"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBase64File, useReports } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import {
  monthYearOptions,
  resolveFinanceDateRange,
  type FinancePeriod,
} from "@/lib/finance/periods";
import { REPORT_TEMPLATES } from "@/lib/reports/template-registry";
import { formatDate } from "@/lib/utils";

const PERIOD_OPTIONS: { value: FinancePeriod; label: string }[] = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "specific_month", label: "Specific month" },
  { value: "custom", label: "Custom range" },
];

const FINANCE_REPORTS = REPORT_TEMPLATES.filter((t) => t.module === "finance");

type FinanceReportsPanelProps = {
  initialPeriod?: FinancePeriod;
  initialMonthYear?: string;
  initialDateFrom?: string;
  initialDateTo?: string;
  /** Live period from parent (dashboard) when compact */
  syncPeriod?: FinancePeriod;
  syncMonthYear?: string;
  syncDateFrom?: string;
  syncDateTo?: string;
  compact?: boolean;
};

export function FinanceReportsPanel({
  initialPeriod = "this_month",
  initialMonthYear,
  initialDateFrom = "",
  initialDateTo = "",
  syncPeriod,
  syncMonthYear,
  syncDateFrom,
  syncDateTo,
  compact = false,
}: FinanceReportsPanelProps) {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("reports", "export");
  const { exportMutation } = useReports();

  const [period, setPeriod] = useState<FinancePeriod>(initialPeriod);
  const [monthYear, setMonthYear] = useState(
    initialMonthYear ?? monthYearOptions()[0]?.value ?? ""
  );
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [selectedReportId, setSelectedReportId] = useState(
    FINANCE_REPORTS.find((t) => t.slug === "finance-dashboard-summary")?.id ??
      FINANCE_REPORTS[0]?.id ??
      ""
  );

  const activePeriod = syncPeriod ?? period;
  const activeMonthYear = syncMonthYear ?? monthYear;
  const activeDateFrom = syncDateFrom ?? dateFrom;
  const activeDateTo = syncDateTo ?? dateTo;

  const selectedTemplate = useMemo(() => {
    if (compact) {
      return (
        FINANCE_REPORTS.find((t) => t.slug === "finance-dashboard-summary") ??
        FINANCE_REPORTS[0]
      );
    }
    return FINANCE_REPORTS.find((t) => t.id === selectedReportId) ?? FINANCE_REPORTS[0];
  }, [compact, selectedReportId]);

  const dateRange = useMemo(
    () =>
      resolveFinanceDateRange(activePeriod, {
        monthYear: activePeriod === "specific_month" ? activeMonthYear : undefined,
        dateFrom: activePeriod === "custom" ? activeDateFrom : undefined,
        dateTo: activePeriod === "custom" ? activeDateTo : undefined,
      }),
    [activePeriod, activeMonthYear, activeDateFrom, activeDateTo]
  );

  const exportFilters = useMemo(
    () => ({
      financePeriod: activePeriod,
      monthYear: activePeriod === "specific_month" ? activeMonthYear : undefined,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
      status: "all",
    }),
    [activePeriod, activeMonthYear, dateRange.from, dateRange.to]
  );

  const handleExport = (format: "PDF" | "Excel") => {
    if (!selectedTemplate) return;
    if (!canExport) {
      toast.error("You do not have permission to export reports.");
      return;
    }

    exportMutation.mutate(
      {
        templateId: selectedTemplate.id,
        format,
        filters: exportFilters,
        templateSlug: selectedTemplate.slug,
        templateModule: selectedTemplate.module,
        templateName: selectedTemplate.name,
      },
      {
        onSuccess: (result) => {
          downloadBase64File(result.data, result.filename, result.mimeType);
          toast.success(`${selectedTemplate?.name ?? "Report"} exported as ${format}`);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Export failed"),
      }
    );
  };

  if (compact) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={exportMutation.isPending || !canExport}
          onClick={() => handleExport("PDF")}
        >
          <FileText className="size-3.5" />
          PDF
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={exportMutation.isPending || !canExport}
          onClick={() => handleExport("Excel")}
        >
          <FileSpreadsheet className="size-3.5" />
          Excel
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Financial Reports</h2>
        <p className="text-sm text-muted-foreground">
          Generate PDF or Excel reports for the selected period. Reports include paid vs unpaid
          breakdowns where applicable.
        </p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Report Settings</CardTitle>
          <CardDescription>
            {dateRange.label}: {formatDate(dateRange.from)} – {formatDate(dateRange.to)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as FinancePeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {period === "specific_month" && (
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={monthYear} onValueChange={setMonthYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {monthYearOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {period === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
              </>
            )}

            <div className="space-y-2 sm:col-span-2">
              <Label>Report Type</Label>
              <Select value={selectedReportId} onValueChange={setSelectedReportId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FINANCE_REPORTS.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              className="gap-1.5"
              disabled={exportMutation.isPending || !canExport}
              onClick={() => handleExport("PDF")}
            >
              <FileText className="size-4" />
              Export PDF
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              disabled={exportMutation.isPending || !canExport}
              onClick={() => handleExport("Excel")}
            >
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
          </div>

          {!canExport && (
            <p className="text-xs text-muted-foreground">
              You need report export permission to download files.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {FINANCE_REPORTS.map((template) => (
          <Card key={template.id} className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{template.name}</CardTitle>
              <CardDescription className="text-xs">{template.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-xs"
                disabled={exportMutation.isPending || !canExport}
                onClick={() => {
                  setSelectedReportId(template.id);
                  exportMutation.mutate(
                    {
                      templateId: template.id,
                      format: template.defaultFormat,
                      filters: exportFilters,
                      templateSlug: template.slug,
                      templateModule: template.module,
                      templateName: template.name,
                    },
                    {
                      onSuccess: (result) => {
                        downloadBase64File(result.data, result.filename, result.mimeType);
                        toast.success(`${template.name} exported`);
                      },
                      onError: (err) =>
                        toast.error(err instanceof Error ? err.message : "Export failed"),
                    }
                  );
                }}
              >
                {template.defaultFormat === "PDF" ? (
                  <FileText className="size-3" />
                ) : (
                  <FileSpreadsheet className="size-3" />
                )}
                {template.defaultFormat}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}