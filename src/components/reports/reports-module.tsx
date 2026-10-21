"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBase64File, useHr, useInventory, useReports } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { useAppStore } from "@/stores/app-store";
import {
  defaultFiltersForModule,
  normalizeFilters,
} from "@/lib/reports/filters";
import type { ReportModule, ReportTemplateDefinition } from "@/lib/reports/types";
import { FACTORY_OPTIONS } from "@/constants";
import { monthYearOptions, type FinancePeriod } from "@/lib/finance/periods";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/types";

type ReportTemplate = ReportTemplateDefinition & { format?: string };

type ScheduledReport = {
  id: string;
  template: string;
  schedule: string;
  recipients: string;
  active: boolean;
};

const PERIOD_OPTIONS = [
  { value: "daily", label: "Today" },
  { value: "weekly", label: "Last 7 days" },
  { value: "monthly", label: "This month" },
  { value: "custom", label: "Custom range" },
] as const;

const FINANCE_PERIOD_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "specific_month", label: "Specific month" },
  { value: "custom", label: "Custom range" },
] as const;

const BATCH_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "in_progress", label: "In progress" },
  { value: "drying", label: "Drying" },
  { value: "curing", label: "Curing" },
  { value: "completed", label: "Completed" },
] as const;

const COUNT_TYPE_OPTIONS = [
  { value: "all", label: "All count types" },
  { value: "recycling", label: "Recycling cycle" },
  { value: "batch_count", label: "Batch count" },
  { value: "after_drying", label: "After drying" },
  { value: "after_curing", label: "After curing" },
] as const;

const RECONCILIATION_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "matched", label: "Matched" },
  { value: "variance", label: "Variance" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
] as const;

const STOCK_HEALTH_OPTIONS = [
  { value: "all", label: "All health states" },
  { value: "healthy", label: "Healthy" },
  { value: "low", label: "Low stock" },
  { value: "critical", label: "Critical" },
  { value: "overstock", label: "Overstock" },
] as const;

const ATTENDANCE_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "late", label: "Late" },
  { value: "absent", label: "Absent" },
  { value: "leave", label: "Leave" },
  { value: "half_day", label: "Half day" },
] as const;

const AUDIT_ENTITY_OPTIONS = [
  { value: "all", label: "All entities" },
  { value: "orders", label: "Sales" },
  { value: "production_counts", label: "Production counts" },
  { value: "inventory_items", label: "Inventory items" },
  { value: "employees", label: "Employees" },
  { value: "customers", label: "Customers" },
] as const;

const AUDIT_ACTION_OPTIONS = [
  { value: "all", label: "All actions" },
  { value: "INSERT", label: "Insert" },
  { value: "UPDATE", label: "Update" },
  { value: "DELETE", label: "Delete" },
] as const;

const DOCUMENT_TAG_OPTIONS = [
  { value: "all", label: "All tags" },
  { value: "SOP", label: "SOP" },
  { value: "Finance", label: "Finance" },
  { value: "HR", label: "HR" },
  { value: "Compliance", label: "Compliance" },
] as const;

function filterField(
  module: ReportModule,
  key: string
): boolean {
  const dateModules: ReportModule[] = [
    "production",
    "finance",
    "inventory",
    "hr",
    "orders",
    "audit",
    "executive",
  ];
  if (key === "period" || key === "dateFrom" || key === "dateTo") {
    return dateModules.includes(module);
  }
  return true;
}

export function ReportsModule() {
  const viewScope = useAppStore((s) => s.viewScope);
  const { hasPermission } = useAuth();
  const canExport = hasPermission("reports", "export");
  const scopeLabel = FACTORY_OPTIONS.find((o) => o.value === viewScope)?.label ?? viewScope;

  const { data, isLoading, exportMutation, scheduleMutation } = useReports();
  const { data: hrData } = useHr();
  const { data: inventoryData } = useInventory();

  const templates = (data?.templates ?? []) as ReportTemplate[];
  const schedules = (data?.schedules ?? []) as ScheduledReport[];

  const [selectedId, setSelectedId] = useState<string>("");
  const [filterState, setFilterState] = useState<Record<string, unknown>>({});

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? templates[0] ?? null,
    [templates, selectedId]
  );

  const activeModule = selectedTemplate?.module ?? "executive";

  const departments = (hrData?.departments ?? []) as { id: string; name: string; is_active: boolean }[];
  const inventoryConfig = inventoryData?.config as
    | { categories?: { id: string; name: string }[]; itemTypes?: { id: string; name: string }[] }
    | undefined;

  const currentFilters = useMemo(() => {
    if (!selectedTemplate) return {};
    return normalizeFilters(activeModule, filterState);
  }, [selectedTemplate, activeModule, filterState]);

  const selectTemplate = (template: ReportTemplate) => {
    setSelectedId(template.id);
    setFilterState(defaultFiltersForModule(template.module) as unknown as Record<string, unknown>);
  };

  useEffect(() => {
    if (templates.length > 0 && !selectedId) {
      const first = templates[0];
      setSelectedId(first.id);
      setFilterState(defaultFiltersForModule(first.module) as unknown as Record<string, unknown>);
    }
  }, [templates, selectedId]);

  const updateFilter = (key: string, value: unknown) => {
    setFilterState((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    if (!selectedTemplate) return;
    setFilterState(defaultFiltersForModule(selectedTemplate.module) as unknown as Record<string, unknown>);
  };

  const handleExport = (
    format: "PDF" | "Excel",
    templateOverride?: ReportTemplate,
    filtersOverride?: Record<string, unknown>
  ) => {
    const template = templateOverride ?? selectedTemplate;
    if (!template) return;
    if (!canExport) {
      toast.error("You do not have permission to export reports.");
      return;
    }
    exportMutation.mutate(
      {
        templateId: template.id,
        format,
        filters: filtersOverride ?? filterState,
        templateSlug: template.slug,
        templateModule: template.module,
        templateName: template.name,
      },
      {
        onSuccess: (result) => {
          downloadBase64File(result.data, result.filename, result.mimeType);
          toast.success(`${template.name} exported as ${format}`);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Export failed"),
      }
    );
  };

  const toggleSchedule = (id: string, active: boolean) => {
    scheduleMutation.mutate(
      { id, active },
      {
        onSuccess: () => toast.success(active ? "Schedule activated" : "Schedule paused"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Schedule update failed"),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reports"
        description="Generate filtered operational reports for each module. Exports respect the factory scope selected in the top bar."
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Scope: {scopeLabel}</Badge>
        {selectedTemplate ? (
          <Badge variant="secondary">{selectedTemplate.category}</Badge>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Report Templates</CardTitle>
            <CardDescription>Select a report, configure filters, then export</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {templates.map((template) => {
                const isSelected = selectedTemplate?.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => selectTemplate(template)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/60 bg-background/50 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{template.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {template.description}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {template.category}
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="size-4" />
              Filters
            </CardTitle>
            <CardDescription>
              {selectedTemplate
                ? `Applied when generating ${selectedTemplate.name}`
                : "Select a template to configure filters"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTemplate && filterField(activeModule, "period") ? (
              <>
                <div className="space-y-2">
                  <Label>Period</Label>
                  <Select
                    value={String(
                      activeModule === "finance"
                        ? filterState.financePeriod ?? "this_month"
                        : filterState.period ?? "weekly"
                    )}
                    onValueChange={(v) =>
                      activeModule === "finance"
                        ? updateFilter("financePeriod", v)
                        : updateFilter("period", v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(activeModule === "finance"
                        ? FINANCE_PERIOD_OPTIONS
                        : PERIOD_OPTIONS
                      ).map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {activeModule === "finance" &&
                filterState.financePeriod === "specific_month" ? (
                  <div className="space-y-2">
                    <Label>Month</Label>
                    <Select
                      value={String(filterState.monthYear ?? monthYearOptions()[0]?.value)}
                      onValueChange={(v) => updateFilter("monthYear", v)}
                    >
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
                ) : null}
                {(activeModule !== "finance" || filterState.financePeriod === "custom") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="report-from">From</Label>
                      <Input
                        id="report-from"
                        type="date"
                        value={String(filterState.dateFrom ?? "")}
                        onChange={(e) => updateFilter("dateFrom", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="report-to">To</Label>
                      <Input
                        id="report-to"
                        type="date"
                        value={String(filterState.dateTo ?? "")}
                        onChange={(e) => updateFilter("dateTo", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : null}

            {activeModule === "production" ? (
              <>
                <div className="space-y-2">
                  <Label>Batch status</Label>
                  <Select
                    value={String(filterState.batchStatus ?? "all")}
                    onValueChange={(v) => updateFilter("batchStatus", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BATCH_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Count type</Label>
                  <Select
                    value={String(filterState.countType ?? "all")}
                    onValueChange={(v) => updateFilter("countType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNT_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {activeModule === "finance" && selectedTemplate?.slug === "finance-reconciliation" ? (
              <div className="space-y-2">
                <Label>Reconciliation status</Label>
                <Select
                  value={String(filterState.status ?? "all")}
                  onValueChange={(v) => updateFilter("status", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECONCILIATION_STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {activeModule === "inventory" ? (
              <>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={String(filterState.category ?? "all")}
                    onValueChange={(v) => updateFilter("category", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      {(inventoryConfig?.categories ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Item type</Label>
                  <Select
                    value={String(filterState.itemType ?? "all")}
                    onValueChange={(v) => updateFilter("itemType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All item types</SelectItem>
                      {(inventoryConfig?.itemTypes ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Stock health</Label>
                  <Select
                    value={String(filterState.health ?? "all")}
                    onValueChange={(v) => updateFilter("health", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STOCK_HEALTH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="low-stock-only"
                    checked={filterState.lowStockOnly === true}
                    onCheckedChange={(checked) => updateFilter("lowStockOnly", checked)}
                  />
                  <Label htmlFor="low-stock-only">Low stock items only</Label>
                </div>
              </>
            ) : null}

            {activeModule === "hr" ? (
              <>
                <div className="space-y-2">
                  <Label>Attendance status</Label>
                  <Select
                    value={String(filterState.attendanceStatus ?? "all")}
                    onValueChange={(v) => updateFilter("attendanceStatus", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Select
                    value={String(filterState.departmentId ?? "all")}
                    onValueChange={(v) => updateFilter("departmentId", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All departments</SelectItem>
                      {departments
                        .filter((d) => d.is_active)
                        .map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {activeModule === "orders" ? (
              <>
                <div className="space-y-2">
                  <Label>Sale status</Label>
                  <Select
                    value={String(filterState.status ?? "all")}
                    onValueChange={(v) => updateFilter("status", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {ORDER_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="risk-only"
                    checked={filterState.riskOnly === true}
                    onCheckedChange={(checked) => updateFilter("riskOnly", checked)}
                  />
                  <Label htmlFor="risk-only">AI risk flagged only</Label>
                </div>
              </>
            ) : null}

            {activeModule === "customers" ? (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    id="active-customers"
                    checked={filterState.activeOnly !== false}
                    onCheckedChange={(checked) => updateFilter("activeOnly", checked)}
                  />
                  <Label htmlFor="active-customers">Active customers only</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="min-balance">Min balance</Label>
                    <Input
                      id="min-balance"
                      type="number"
                      value={String(filterState.minBalance ?? "")}
                      onChange={(e) => updateFilter("minBalance", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-balance">Max balance</Label>
                    <Input
                      id="max-balance"
                      type="number"
                      value={String(filterState.maxBalance ?? "")}
                      onChange={(e) => updateFilter("maxBalance", e.target.value)}
                    />
                  </div>
                </div>
              </>
            ) : null}

            {activeModule === "audit" ? (
              <>
                <div className="space-y-2">
                  <Label>Entity type</Label>
                  <Select
                    value={String(filterState.entityType ?? "all")}
                    onValueChange={(v) => updateFilter("entityType", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIT_ENTITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Action</Label>
                  <Select
                    value={String(filterState.action ?? "all")}
                    onValueChange={(v) => updateFilter("action", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIT_ACTION_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            {activeModule === "documents" ? (
              <>
                <div className="space-y-2">
                  <Label>Document tag</Label>
                  <Select
                    value={String(filterState.tag ?? "all")}
                    onValueChange={(v) => updateFilter("tag", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TAG_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="restricted-only"
                    checked={filterState.restrictedOnly === true}
                    onCheckedChange={(checked) => updateFilter("restrictedOnly", checked)}
                  />
                  <Label htmlFor="restricted-only">Restricted documents only</Label>
                </div>
              </>
            ) : null}

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
              {"period" in currentFilters
                ? `Date range: ${String((currentFilters as { dateFrom?: string }).dateFrom ?? "")} → ${String((currentFilters as { dateTo?: string }).dateTo ?? "")}`
                : "Filters apply to the current dataset at export time."}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                className="flex-1 gap-1.5"
                disabled={!selectedTemplate || !canExport || exportMutation.isPending}
                onClick={() => handleExport("PDF")}
              >
                <FileText className="size-4" />
                Export PDF
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-1.5"
                disabled={!selectedTemplate || !canExport || exportMutation.isPending}
                onClick={() => handleExport("Excel")}
              >
                <FileSpreadsheet className="size-4" />
                Export Excel
              </Button>
              <Button variant="ghost" size="icon" onClick={resetFilters} title="Reset filters">
                <RotateCcw className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="size-5" />
            Scheduled Reports
          </CardTitle>
          <CardDescription>Automated report delivery to stakeholders</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {schedules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No scheduled reports configured.
            </p>
          ) : (
            schedules.map((schedule) => (
              <div
                key={schedule.id}
                className="flex flex-col gap-4 rounded-lg border border-border/60 bg-background/30 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{schedule.template}</p>
                  <p className="text-sm text-muted-foreground">{schedule.schedule}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Recipients: {schedule.recipients}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`schedule-${schedule.id}`}
                      checked={schedule.active}
                      disabled={scheduleMutation.isPending}
                      onCheckedChange={(checked) => toggleSchedule(schedule.id, checked)}
                    />
                    <Label htmlFor={`schedule-${schedule.id}`} className="text-sm">
                      {schedule.active ? "Active" : "Paused"}
                    </Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={exportMutation.isPending}
                    onClick={() => {
                      const template = templates.find((t) => t.name === schedule.template);
                      if (template) {
                        const defaults = defaultFiltersForModule(
                          template.module
                        ) as unknown as Record<string, unknown>;
                        handleExport(template.defaultFormat ?? "PDF", template, defaults);
                      } else {
                        toast.error("Template not found for this schedule");
                      }
                    }}
                  >
                    <Download className="size-4" />
                    Run Now
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
