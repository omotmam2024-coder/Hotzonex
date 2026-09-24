// Central place for environment configuration.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

// Minimal .env loader so the agent runs without extra dependencies.
// Real environment variables always win over values in the file.
function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let [, key, val] = m;
    val = val.replace(/\s+#.*$/, "").replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv(path.join(ROOT, ".env"));

const env = process.env;
const digits = (s) => String(s || "").replace(/\D/g, "");
const ownerNumbers = String(env.OWNER_NUMBERS || "")
  .split(",").map(digits).filter(Boolean);

export const config = {
  port: Number(env.PORT) || 3000,
  model: env.CLAUDE_MODEL || "claude-opus-5",
  timezone: env.BUSINESS_TIMEZONE || "Africa/Juba",
  whatsapp: {
    token: env.WHATSAPP_TOKEN || "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN || "",
    appSecret: env.WHATSAPP_APP_SECRET || "",
    apiVersion: env.WHATSAPP_API_VERSION || "v21.0",
  },
  ownerNumbers,
  escalationNumber: digits(env.ESCALATION_NUMBER) || ownerNumbers[0] || "",
  supabase: {
    url: (env.SUPABASE_URL || "").replace(/\/+$/, ""),
    key: env.SUPABASE_KEY || "",
  },
};

export function isOwner(phone) {
  return config.ownerNumbers.includes(digits(phone));
}

export function missingServerConfig() {
  const missing = [];
  if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN) missing.push("ANTHROPIC_API_KEY");
  if (!config.whatsapp.token) missing.push("WHATSAPP_TOKEN");
  if (!config.whatsapp.phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!config.whatsapp.verifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (!config.whatsapp.appSecret) missing.push("WHATSAPP_APP_SECRET");
  return missing;
}
