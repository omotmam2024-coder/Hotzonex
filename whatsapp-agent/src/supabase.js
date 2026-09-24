// Server-side access to the dashboard's `daily_entries` table (Supabase REST).
import { config } from "./config.js";

export const MONTHS = ["January","February","March","April","May","June",
  "July","August","September","October","November","December"];
export const FIELDS = ["income", "internet", "power", "feeding", "wages"];
export const EXPENSE_FIELDS = ["internet", "power", "feeding", "wages"];

export function supabaseConfigured() {
  return Boolean(config.supabase.url && config.supabase.key);
}

async function sb(pathAndQuery, opts = {}) {
  if (!supabaseConfigured()) throw new Error("Supabase is not configured (SUPABASE_URL / SUPABASE_KEY).");
  const { key, url } = config.supabase;
  const res = await fetch(`${url}/rest/v1${pathAndQuery}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

export function fetchEntries({ year, month }) {
  const q = new URLSearchParams({ year: `eq.${year}`, order: "month.asc,day.asc" });
  if (month) q.set("month", `eq.${month}`);
  return sb(`/daily_entries?${q}`);
}

// Only the fields passed are written; other columns on that day keep their values.
export function upsertEntry({ year, month, day, ...fields }) {
  return sb("/daily_entries?on_conflict=year,month,day", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ year, month, day, ...fields }),
  });
}

export function summarize(rows) {
  const n = (v) => Number(v) || 0;
  const totals = { income: 0, internet: 0, power: 0, feeding: 0, wages: 0 };
  for (const r of rows) for (const f of FIELDS) totals[f] += n(r[f]);
  const expenses = EXPENSE_FIELDS.reduce((s, f) => s + totals[f], 0);
  const profit = totals.income - expenses;
  return {
    ...totals,
    expenses,
    profit,
    margin_pct: totals.income > 0 ? Number(((profit / totals.income) * 100).toFixed(1)) : 0,
    days_recorded: rows.filter((r) => FIELDS.some((f) => n(r[f]) !== 0)).length,
  };
}
