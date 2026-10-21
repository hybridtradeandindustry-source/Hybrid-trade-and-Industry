#!/usr/bin/env node
/**
 * Elecnovatech Sage 50 Sync Agent
 *
 * Runs on the client's Windows machine where Sage 50 is installed.
 * Reads Sage data (via ODBC/SDK placeholder) and pushes encrypted payloads
 * to the Elecnovatech platform on a schedule.
 *
 * Configure via environment variables or .env file in this directory.
 */

import * as fs from "fs";
import * as path from "path";

const CONFIG = {
  platformUrl: process.env.ELECNOVA_PLATFORM_URL ?? "http://localhost:3000",
  syncApiKey: process.env.SAGE50_SYNC_API_KEY ?? "",
  syncSecret: process.env.SAGE50_SYNC_SECRET ?? "",
  intervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 30),
  sageDataFile: process.env.SAGE_DATA_FILE ?? path.join(__dirname, "sample-sage-export.json"),
};

interface SageExport {
  accounts?: unknown[];
  transactions?: Array<{
    sage_id: string;
    transaction_date: string;
    description: string;
    amount: number;
    transaction_type: string;
    factory_id?: string | null;
  }>;
  invoices?: unknown[];
  budgets?: unknown[];
}

async function readSageData(): Promise<SageExport> {
  // Production: replace with ODBC/SDK read against client's Sage 50 version
  if (fs.existsSync(CONFIG.sageDataFile)) {
    return JSON.parse(fs.readFileSync(CONFIG.sageDataFile, "utf-8")) as SageExport;
  }

  const today = new Date().toISOString().slice(0, 10);
  return {
    transactions: [
      {
        sage_id: `SAGE-TX-${Date.now()}`,
        transaction_date: today,
        description: "Scheduled sync — Block sales revenue",
        amount: 45000 + Math.floor(Math.random() * 1000),
        transaction_type: "revenue",
        factory_id: "22222222-2222-2222-2222-222222222221",
      },
      {
        sage_id: `SAGE-TX-${Date.now() + 1}`,
        transaction_date: today,
        description: "Scheduled sync — Raw material expense",
        amount: -(8000 + Math.floor(Math.random() * 500)),
        transaction_type: "expense",
        factory_id: "22222222-2222-2222-2222-222222222221",
      },
    ],
  };
}

async function pushToPlatform(payload: SageExport): Promise<void> {
  const url = `${CONFIG.platformUrl.replace(/\/$/, "")}/api/sage/sync`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sage-Sync-Key": CONFIG.syncApiKey,
      "X-Sage-Sync-Secret": CONFIG.syncSecret,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? `Sync failed with status ${res.status}`);
  }

  console.log(`[${new Date().toISOString()}] Sync successful — ${json.data?.records_processed ?? 0} records`);
}

async function runSync(): Promise<void> {
  if (!CONFIG.syncApiKey || !CONFIG.syncSecret) {
    console.error("SAGE50_SYNC_API_KEY and SAGE50_SYNC_SECRET must be set");
    process.exit(1);
  }

  try {
    const data = await readSageData();
    await pushToPlatform(data);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Sync failed:`, err);
    // Retry once after 30 seconds
    await new Promise((r) => setTimeout(r, 30_000));
    try {
      const data = await readSageData();
      await pushToPlatform(data);
    } catch (retryErr) {
      console.error(`[${new Date().toISOString()}] Retry failed:`, retryErr);
    }
  }
}

console.log(`Elecnovatech Sage 50 Sync Agent starting — interval ${CONFIG.intervalMinutes}m`);
console.log(`Platform: ${CONFIG.platformUrl}`);

runSync();
setInterval(runSync, CONFIG.intervalMinutes * 60 * 1000);
