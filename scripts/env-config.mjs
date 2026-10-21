import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** @type {Record<string, { file: string; label: string }>} */
export const ENV_PROFILES = {
  development: { file: ".env.development", label: "Development" },
  demo: { file: ".env.demo", label: "Demo" },
  production: { file: ".env.production", label: "Production" },
};

export function resolveEnvProfile(name) {
  const profile = ENV_PROFILES[name];
  if (!profile) {
    const options = Object.keys(ENV_PROFILES).join(" | ");
    throw new Error(`Unknown env profile "${name}". Use: ${options}`);
  }
  return profile;
}

export function envFilePath(name) {
  return resolve(process.cwd(), resolveEnvProfile(name).file);
}

export function readProjectRef(name) {
  const path = envFilePath(name);
  if (!existsSync(path)) {
    throw new Error(`Missing ${resolveEnvProfile(name).file}`);
  }
  const match = readFileSync(path, "utf8").match(
    /NEXT_PUBLIC_SUPABASE_URL=https:\/\/([a-z0-9]+)\.supabase\.co/i
  );
  const ref = match?.[1];
  if (!ref) {
    throw new Error(`Could not read Supabase project ref from ${resolveEnvProfile(name).file}`);
  }
  return ref;
}

export function activateEnv(name) {
  const profile = resolveEnvProfile(name);
  const source = resolve(process.cwd(), profile.file);
  const dest = resolve(process.cwd(), ".env.local");
  if (!existsSync(source)) {
    throw new Error(`Missing ${profile.file} for ${profile.label} environment.`);
  }
  copyFileSync(source, dest);
  console.log(`Active env: ${profile.label} (${profile.file}) → .env.local`);
}
