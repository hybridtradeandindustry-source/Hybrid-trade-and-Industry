import { execSync } from "node:child_process";
import { ENV_PROFILES, readProjectRef, resolveEnvProfile } from "./env-config.mjs";

const target = process.argv[2];
const command = process.argv[3] ?? "push";

if (!target || !ENV_PROFILES[target]) {
  console.error(
    `Usage: node scripts/db-env.mjs <${Object.keys(ENV_PROFILES).join("|")}> [push|status]`
  );
  process.exit(1);
}

try {
  const profile = resolveEnvProfile(target);
  const ref = readProjectRef(target);
  console.log(`${command === "status" ? "Checking" : "Pushing"} migrations → ${profile.label} (${ref})`);
  execSync(`npx supabase link --project-ref ${ref}`, { stdio: "inherit" });
  execSync(
    command === "status" ? "npx supabase migration list" : "npx supabase db push",
    { stdio: "inherit" }
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
