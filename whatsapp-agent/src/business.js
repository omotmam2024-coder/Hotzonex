// Loads business.json and renders it as reference text for the system prompt.
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";

const PLACEHOLDER = /EDIT ME/i;

export function loadBusiness(file = path.join(ROOT, "business.json")) {
  return JSON.parse(readFileSync(file, "utf8"));
}

// Lists fields still holding template values, so the server can warn at startup.
export function unfinishedFields(biz) {
  const out = [];
  const walk = (v, p) => {
    if (typeof v === "string" && PLACEHOLDER.test(v)) out.push(p);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], p ? `${p}.${k}` : k);
  };
  walk(biz, "");
  (biz.packages || []).forEach((p, i) => {
    if (!(Number(p.price) > 0)) out.push(`packages[${i}].price`);
  });
  return out;
}

// Only confirmed facts reach the model: placeholders and unpriced packages are
// dropped, so the agent says "please ask staff" instead of quoting a wrong price.
export function renderBusinessFacts(biz) {
  const ok = (s) => typeof s === "string" && s.trim() && !PLACEHOLDER.test(s);
  const list = (arr) => (arr || []).filter(ok).map((s) => `- ${s}`).join("\n") || "- (not provided — refer the customer to staff)";
  const field = (s) => (ok(s) ? s : "(not provided — refer the customer to staff)");

  const packages = (biz.packages || [])
    .filter((p) => ok(p.name) && Number(p.price) > 0)
    .map((p) => `- ${p.name}: ${Number(p.price).toLocaleString("en-US")} ${biz.currency} — valid ${p.validity}${p.notes ? ` (${p.notes})` : ""}`)
    .join("\n") || "- (prices not provided — refer the customer to staff)";

  return [
    `Business name: ${biz.name}`,
    `Location: ${field(biz.location)}`,
    `Opening hours: ${field(biz.hours)}`,
    `WiFi network name: ${field(biz.network_name)}`,
    `Currency: ${biz.currency}`,
    "",
    "Packages / vouchers:",
    packages,
    "",
    "Payment methods:",
    list(biz.payment_methods),
    "",
    "How to connect:",
    list(biz.how_to_connect),
    "",
    "Troubleshooting:",
    list(biz.troubleshooting),
    "",
    "Policies:",
    list(biz.policies),
    "",
    `Languages you may reply in: ${(biz.languages || ["English"]).join(", ")}`,
  ].join("\n");
}
