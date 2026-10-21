"use client";

import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadBase64File, useReports } from "@/hooks/use-api";
import { useAuth } from "@/providers/auth-provider";
import { resolveFinanceDateRange, type FinancePeriod } from "@/lib/finance/periods";

const CUSTOMER_STATEMENT_TEMPLATE = {
  id: "rpt-10",
  slug: "finance-customer-statements",
  module: "finance" as const,
};

type CustomerStatementExportProps = {
  customerId: string;
  customerName: string;
  period: FinancePeriod;
  monthYear?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Prefer dashboard-resolved range when available */
  resolvedFrom?: string;
  resolvedTo?: string;
};

export function CustomerStatementExport({
  customerId,
  customerName,
  period,
  monthYear,
  dateFrom,
  dateTo,
  resolvedFrom,
  resolvedTo,
}: CustomerStatementExportProps) {
  const { hasPermission } = useAuth();
  const canExport = hasPermission("reports", "export");
  const { exportMutation } = useReports();

  const exportStatement = (format: "PDF" | "Excel") => {
    if (!canExport) {
      toast.error("You do not have permission to export reports.");
      return;
    }

    const range =
      resolvedFrom && resolvedTo
        ? { from: resolvedFrom, to: resolvedTo }
        : resolveFinanceDateRange(period, {
            monthYear: period === "specific_month" ? monthYear : undefined,
            dateFrom: period === "custom" ? dateFrom : undefined,
            dateTo: period === "custom" ? dateTo : undefined,
          });

    exportMutation.mutate(
      {
        templateId: CUSTOMER_STATEMENT_TEMPLATE.id,
        format,
        filters: {
          financePeriod: period,
          monthYear: period === "specific_month" ? monthYear : undefined,
          dateFrom: range.from,
          dateTo: range.to,
          customerId,
          status: "all",
        },
        templateSlug: CUSTOMER_STATEMENT_TEMPLATE.slug,
        templateModule: CUSTOMER_STATEMENT_TEMPLATE.module,
        templateName: `${customerName} Statement`,
      },
      {
        onSuccess: (result) => {
          downloadBase64File(result.data, result.filename, result.mimeType);
          toast.success(`${customerName} statement exported as ${format}`);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Export failed"),
      }
    );
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={!canExport || exportMutation.isPending}
        onClick={() => exportStatement("PDF")}
        aria-label={`Export ${customerName} statement as PDF`}
        title="Export PDF"
      >
        <FileText className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={!canExport || exportMutation.isPending}
        onClick={() => exportStatement("Excel")}
        aria-label={`Export ${customerName} statement as Excel`}
        title="Export Excel"
      >
        <FileSpreadsheet className="size-3.5" />
      </Button>
    </div>
  );
}
