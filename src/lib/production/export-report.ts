import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  filterProductionBatches,
  filterProductionCounts,
  getBatchDate,
  getCountTypeLabel,
  isRecyclingCount,
  periodLabel,
  type ProductionFilterState,
} from "@/lib/production/filters";
import { CHECKPOINT_LABELS, FACTORY_IDS, type ProductionBatch, type ProductionCount, type ViewScope } from "@/types";

const FACTORY_NAMES: Record<string, string> = {
  [FACTORY_IDS.block]: "Block Factory",
  [FACTORY_IDS.recycling]: "Plastic Recycling",
};

function batchRows(batches: ProductionBatch[]) {
  return batches.map((b) => ({
    Date: getBatchDate(b),
    "Batch Number": b.batch_number,
    Factory: FACTORY_NAMES[b.factory_id] ?? b.factory_id,
    Status: b.status.replace(/_/g, " "),
  }));
}

function countRows(counts: ProductionCount[], batches: ProductionBatch[]) {
  return counts.map((c) => {
    const batch = batches.find((b) => b.id === c.batch_id);
    if (isRecyclingCount(c)) {
      return {
        Date: c.production_date,
        Factory: FACTORY_NAMES[c.factory_id] ?? c.factory_id,
        Type: "Recycling cycle",
        "Material In": c.material_received ?? 0,
        Output: c.processed_output ?? 0,
        Waste: c.waste_rejected ?? 0,
      };
    }
    return {
      Date: c.production_date,
      Factory: FACTORY_NAMES[c.factory_id] ?? c.factory_id,
      Type: c.checkpoint ? CHECKPOINT_LABELS[c.checkpoint] : "Block count",
      Batch: batch?.batch_number ?? "—",
      Good: c.good_count ?? 0,
      Damaged: c.damaged_count ?? 0,
    };
  });
}

export async function generateProductionReport(input: {
  batches: ProductionBatch[];
  counts: ProductionCount[];
  filters: ProductionFilterState;
  scope: ViewScope;
  format: "PDF" | "Excel";
}) {
  const filteredBatches = filterProductionBatches(input.batches, input.filters);
  const filteredCounts = filterProductionCounts(input.counts, input.filters);
  const title = `${periodLabel(input.filters.period)} Production Report`;
  const filename = `${title.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}`;

  const batchData = batchRows(filteredBatches);
  const countData = countRows(filteredCounts, input.batches);

  if (input.format === "Excel") {
    const wb = XLSX.utils.book_new();
    if (batchData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchData), "Batches");
    }
    if (countData.length > 0) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(countData), "Production Counts");
    }
    if (batchData.length === 0 && countData.length === 0) {
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([{ Message: "No records match the selected filters." }]),
        "Summary"
      );
    }
    const buffer = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
    return {
      filename: `${filename}.xlsx`,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      data: buffer,
    };
  }

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 26);
  doc.text(`Scope: ${input.scope}`, 14, 32);
  doc.text(`Period: ${input.filters.dateFrom} → ${input.filters.dateTo}`, 14, 38);

  let startY = 46;

  if (batchData.length > 0) {
    doc.setFontSize(12);
    doc.text("Batch Status", 14, startY);
    const headers = Object.keys(batchData[0]);
    autoTable(doc, {
      startY: startY + 4,
      head: [headers],
      body: batchData.map((row) => headers.map((h) => String(row[h as keyof typeof row] ?? ""))),
    });
    startY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20;
    startY += 12;
  }

  if (countData.length > 0) {
    if (startY > 250) {
      doc.addPage();
      startY = 20;
    }
    doc.setFontSize(12);
    doc.text("Production Count History", 14, startY);
    const headers = Object.keys(countData[0]);
    autoTable(doc, {
      startY: startY + 4,
      head: [headers],
      body: countData.map((row) => headers.map((h) => String(row[h as keyof typeof row] ?? ""))),
    });
  }

  if (batchData.length === 0 && countData.length === 0) {
    doc.text("No records match the selected filters.", 14, 50);
  }

  const pdfBase64 = doc.output("datauristring").split(",")[1];
  return {
    filename: `${filename}.pdf`,
    mimeType: "application/pdf",
    data: pdfBase64,
  };
}
