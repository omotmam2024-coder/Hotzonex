import { supabase } from "./supabase";
import { ALL_SITES } from "./locations";
import { MONTHS, rowDate } from "./dates";

const TABLES = { daily: "daily_entries", purchases: "other_expenses", usd: "usd_savings" };

function check({ data, error }) {
  if (error) throw new Error(error.message || "The database didn't respond. Check your connection and try again.");
  return data ?? [];
}

// Rows of one table for a site (or all sites) between two dates, inclusive.
async function fetchRange(table, loc, from, to) {
  const out = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    const first = y === from.getFullYear() ? from.getMonth() : 0;
    const last = y === to.getFullYear() ? to.getMonth() : 11;
    let q = supabase.from(table).select("*").eq("year", y).in("month", MONTHS.slice(first, last + 1));
    if (loc !== ALL_SITES) q = q.eq("location", loc);
    out.push(...check(await q.order("day").limit(5000)));
  }
  return out
    .filter((r) => { const d = rowDate(r); return d >= from && d <= to; })
    .sort((a, b) => rowDate(a) - rowDate(b) || (a.id ?? 0) - (b.id ?? 0));
}

export async function fetchLedger(loc, from, to) {
  const [daily, purchases, usd] = await Promise.all([
    fetchRange(TABLES.daily, loc, from, to),
    fetchRange(TABLES.purchases, loc, from, to),
    fetchRange(TABLES.usd, loc, from, to),
  ]);
  return { daily, purchases, usd };
}

export const fetchDaily = (loc, from, to) => fetchRange(TABLES.daily, loc, from, to);
export const fetchPurchases = (loc, from, to) => fetchRange(TABLES.purchases, loc, from, to);
export const fetchUsd = (loc, from, to) => fetchRange(TABLES.usd, loc, from, to);

// One row per site per day. Update when we know the row, otherwise insert,
// and fall back to updating if someone else saved the same day meanwhile.
export async function saveTakings(fields, existingId) {
  if (existingId) return check(await supabase.from(TABLES.daily).update(fields).eq("id", existingId).select());
  const res = await supabase.from(TABLES.daily).insert(fields).select();
  if (res.error?.code === "23505") {
    const found = check(await supabase.from(TABLES.daily).select("id")
      .match({ year: fields.year, month: fields.month, day: fields.day, location: fields.location }));
    if (found.length) return check(await supabase.from(TABLES.daily).update(fields).eq("id", found[0].id).select());
  }
  return check(res);
}

export async function saveRow(kind, fields, id) {
  const t = supabase.from(TABLES[kind]);
  return check(id ? await t.update(fields).eq("id", id).select() : await t.insert(fields).select());
}

export async function deleteRow(kind, id) {
  const rows = check(await supabase.from(TABLES[kind]).delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("Nothing was deleted. Only an admin can delete records.");
}

// Sites, fixed costs and the Hotzonex Cloud sync
export async function fetchSites() {
  return check(await supabase.from("sites").select("*").order("sort"));
}
export async function fetchFixedCosts() {
  return check(await supabase.from("fixed_costs").select("*"));
}
export async function saveFixedCosts(rows) {
  return check(await supabase.from("fixed_costs").upsert(rows, { onConflict: "site_id,cost_key" }).select());
}
export async function fetchSyncStatus() {
  return check(await supabase.from("sync_status").select("*").eq("id", 1))[0] ?? null;
}
// Ask the server to pull from Hotzonex Cloud now (admin or manager).
export async function syncNow(options = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify(options),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `The sync didn't respond (error ${res.status}).`);
  return body;
}

// A day's running costs set by hand. Income is never sent: it only comes from Hotzonex Cloud.
export async function saveDayCosts(fields, existingId) {
  const t = supabase.from(TABLES.daily);
  if (existingId) return check(await t.update({ ...fields, costs_edited: true }).eq("id", existingId).select());
  return check(await t.insert({ ...fields, income: 0, costs_edited: true }).select());
}
export async function resetDayCosts(id) {
  return check(await supabase.from(TABLES.daily).update({ costs_edited: false }).eq("id", id).select());
}

// Dollar wallet: exchanges (usd_savings) in, spending (usd_spending) out
export async function fetchUsdSpending() {
  return check(await supabase.from("usd_spending").select("*").order("spent_on").order("id").limit(5000));
}
export async function saveUsdSpending(fields, id) {
  const t = supabase.from("usd_spending");
  return check(id ? await t.update(fields).eq("id", id).select() : await t.insert(fields).select());
}
export async function deleteUsdSpending(id) {
  const rows = check(await supabase.from("usd_spending").delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("Nothing was deleted. Only an admin can delete records.");
}

// Profiles
export async function fetchMyProfile(userId) {
  const rows = check(await supabase.from("profiles").select("*").eq("id", userId));
  return rows[0] ?? null;
}
export async function fetchProfiles() {
  return check(await supabase.from("profiles").select("*").order("name"));
}

// Admin actions go through the server function, which holds the service key.
export async function teamAction(action, payload) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `The team service didn't respond (error ${res.status}).`);
  return body;
}
