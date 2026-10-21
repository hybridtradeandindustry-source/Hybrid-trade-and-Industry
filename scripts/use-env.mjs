import { activateEnv, ENV_PROFILES } from "./env-config.mjs";

const target = process.argv[2];
if (!target || !ENV_PROFILES[target]) {
  console.error(`Usage: node scripts/use-env.mjs <${Object.keys(ENV_PROFILES).join("|")}>`);
  process.exit(1);
}

try {
  activateEnv(target);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
