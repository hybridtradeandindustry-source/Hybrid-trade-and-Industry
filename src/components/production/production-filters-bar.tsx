"use client";

import { FileSpreadsheet, FileText, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHECKPOINT_LABELS } from "@/types";
import {
  periodLabel,
  resolveDateRange,
  type BatchStatusFilter,
  type CountTypeFilter,
  type ProductionFilterState,
  type ReportPeriod,
} from "@/lib/production/filters";

interface ProductionFiltersBarProps {
  filters: ProductionFilterState;
  onChange: (filters: ProductionFilterState) => void;
  showBatchFilters?: boolean;
  onExport?: (format: "PDF" | "Excel") => void;
  exporting?: boolean;
}

export function ProductionFiltersBar({
  filters,
  onChange,
  showBatchFilters = true,
  onExport,
  exporting = false,
}: ProductionFiltersBarProps) {
  const updatePeriod = (period: ReportPeriod) => {
    const range = resolveDateRange(period, filters.dateFrom, filters.dateTo);
    onChange({ ...filters, period, dateFrom: range.from, dateTo: range.to });
  };

  const resetFilters = () => {
    const range = resolveDateRange("weekly");
    onChange({
      period: "weekly",
      dateFrom: range.from,
      dateTo: range.to,
      batchStatus: "all",
      countType: "all",
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Filters &amp; Reports</p>
          <p className="text-xs text-muted-foreground">
            Active batches always stay in the list. Finished batches show when their start or finish
            date is in the selected period — or set Batch status to Completed.
          </p>
        </div>
        {onExport && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => onExport("PDF")}
            >
              <FileText className="size-4" />
              Export PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => onExport("Excel")}
            >
              <FileSpreadsheet className="size-4" />
              Export Excel
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-2">
          <Label>Report period</Label>
          <Select value={filters.period} onValueChange={(v) => updatePeriod(v as ReportPeriod)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">{periodLabel("daily")}</SelectItem>
              <SelectItem value="weekly">{periodLabel("weekly")}</SelectItem>
              <SelectItem value="monthly">{periodLabel("monthly")}</SelectItem>
              <SelectItem value="custom">{periodLabel("custom")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-from">From</Label>
          <Input
            id="filter-from"
            type="date"
            value={filters.dateFrom}
            onChange={(e) =>
              onChange({ ...filters, period: "custom", dateFrom: e.target.value })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="filter-to">To</Label>
          <Input
            id="filter-to"
            type="date"
            value={filters.dateTo}
            onChange={(e) =>
              onChange({ ...filters, period: "custom", dateTo: e.target.value })
            }
          />
        </div>

        {showBatchFilters && (
          <div className="space-y-2">
            <Label>Batch status</Label>
            <Select
              value={filters.batchStatus}
              onValueChange={(v) =>
                onChange({ ...filters, batchStatus: v as BatchStatusFilter })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="drying">Drying</SelectItem>
                <SelectItem value="curing">Curing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Count type</Label>
          <Select
            value={filters.countType}
            onValueChange={(v) => onChange({ ...filters, countType: v as CountTypeFilter })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="recycling">Recycling cycle</SelectItem>
              {Object.entries(CHECKPOINT_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end">
          <Button variant="ghost" size="sm" className="w-full" onClick={resetFilters}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
