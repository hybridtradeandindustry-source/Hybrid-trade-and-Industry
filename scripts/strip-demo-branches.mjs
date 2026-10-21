import fs from "fs";
import path from "path";

const root = path.resolve(import.meta.dirname, "..");

function removeDemoIfBlocks(source) {
  const marker = "if (!isSupabaseConfigured())";
  let s = source;
  let idx = 0;
  while ((idx = s.indexOf(marker, idx)) !== -1) {
    const start = idx;
    const braceStart = s.indexOf("{", start);
    if (braceStart === -1) break;
    let depth = 0;
    let i = braceStart;
    for (; i < s.length; i++) {
      if (s[i] === "{") depth++;
      if (s[i] === "}") depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
    s = s.slice(0, start) + s.slice(i);
    idx = start;
  }
  return s;
}

function stripFile(relPath) {
  const filePath = path.join(root, relPath);
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  const original = content;

  content = content.replace(/^import \{ getDemoStore \} from "@\/lib\/data\/demo-store";\n/gm, "");
  content = content.replace(/^import \{ isSupabaseConfigured(?:, APP_CONFIG)? \} from "@\/lib\/config";\n/gm, (m) =>
    m.includes("APP_CONFIG") ? 'import { APP_CONFIG, requireSupabase } from "@/lib/config";\n' : 'import { requireSupabase } from "@/lib/config";\n'
  );
  content = content.replace(/import \{ isSupabaseConfigured, APP_CONFIG \} from "@\/lib\/config";/g, 'import { APP_CONFIG, requireSupabase } from "@/lib/config";');
  content = content.replace(/import \{ APP_CONFIG, isSupabaseConfigured \} from "@\/lib\/config";/g, 'import { APP_CONFIG, requireSupabase } from "@/lib/config";');

  content = removeDemoIfBlocks(content);

  content = content.replace(/\n{3,}/g, "\n\n");

  if (content !== original) {
    fs.writeFileSync(filePath, content);
    console.log("stripped:", relPath);
  }
}

const files = [
  "src/lib/services/index.ts",
  "src/lib/services/inventory-catalog.ts",
  "src/lib/services/admin-rbac.ts",
  "src/lib/services/notifications.ts",
  "src/lib/services/audit.ts",
  "src/lib/services/finance-data-access.ts",
  "src/lib/reports/build-finance-reports.ts",
  "src/lib/reports/build-module-report.ts",
];

for (const f of files) stripFile(f);
