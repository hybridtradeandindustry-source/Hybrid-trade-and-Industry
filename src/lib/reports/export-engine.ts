import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import type { GeneratedReportFile, ReportBuildResult, ReportFormat } from "@/lib/reports/types";
import type { ViewScope } from "@/types";

const SCOPE_LABELS: Record<ViewScope, string> = {
  combined: "Overall Company",
  block: "Block Factory",
  recycling: "Plastic Recycling",
};

function emptySheet(message: string) {
  return [{ Message: message }];
}

export function exportReportFile(
  report: ReportBuildResult,
  format: ReportFormat,
  scope: ViewScope
): GeneratedReportFile {
  const safeTitle = report.title.replace(/\s+/g, "-").toLowerCase();
  const filenameBase = `${safeTitle}-${Date.now()}`;
  const sheets =
    report.sheets.length > 0
      ? report.sheets
      : [{ name: "Summary", rows: emptySheet("No records match the selected filters.") }];

  if (format === "Excel") {
    const wb = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const rows = sheet.rows.length > 0 ? sheet.rows : emptySheet("No records match the selected filters.");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheet.name.slice(0, 31));
    }
    const buffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    return {
      filename: `${filenameBase}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buffer,
    };
  }

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(report.title, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
  doc.text(`Scope: ${SCOPE_LABELS[scope]}`, 14, 32);

  let metaY = 38;
  for (const line of report.filterSummary) {
    doc.text(line, 14, metaY);
    metaY += 6;
  }

  let startY = metaY + 6;

  for (const sheet of sheets) {
    const rows = sheet.rows.length > 0 ? sheet.rows : emptySheet("No records match the selected filters.");
    if (startY > 240) {
      doc.addPage();
      startY = 20;
    }
    doc.setFontSize(12);
    doc.text(sheet.name, 14, startY);
    const headers = Object.keys(rows[0] ?? { Message: "" });
    autoTable(doc, {
      startY: startY + 4,
      head: [headers],
      body: rows.map((row) =>
        headers.map((h) => String((row as Record<string, unknown>)[h] ?? ""))
      ),
      styles: { fontSize: 8 },
    });
    startY =
      (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;
    startY += 14;
  }

  const pdfBase64 = doc.output("datauristring").split(",")[1];
  return {
    filename: `${filenameBase}.pdf`,
    mimeType: "application/pdf",
    data: pdfBase64 ?? "",
  };
}
