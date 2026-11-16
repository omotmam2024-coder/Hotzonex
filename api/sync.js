// Copies income and expenses from Hotzonex Cloud into the tracker.
//
// Called every 15 minutes by the tracker database (pg_cron) with the sync
// secret, or by an admin/manager from the app ("Sync now"). It is safe to run
// any number of times: each run recalculates the days in its window.
//
// Environment (Vercel): SUPABASE_SERVICE_ROLE_KEY (tracker), CLOUD_FEED_KEY,
// SYNC_SECRET.
const TRACKER_URL = "https://prxumouufckubwioywuz.supabase.co";
const TRACKER_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeHVtb3V1ZmNrdWJ3aW95d3V6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNDc2NTIsImV4cCI6MjA5NTgyMzY1Mn0.RpK8UmfzQhXVVuuVhsj5QH3HDhwT6RAm0ID0o_MqR7U";
const CLOUD_FEED_URL = "https://tyiwnaxdejtsdofgnuow.supabase.co/rest/v1/rpc/tracker_feed";
const CLOUD_PUBLISHABLE = "sb_publishable_UtwnOzZGGj05E--SWZoEUA_BBpi6KpQ";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const COST_KEYS = ["internet", "power", "feeding", "wages"];
// Cloud expense category -> tracker running-cost column. Anything else is a purchase.
const RUNNING = { internet: "internet", power: "power", feeding: "feeding", salaries: "wages", wages: "wages" };
const CATEGORY_LABEL = { repairs: "Maintenance", equipment: "Equipment / Hardware", other: "Other" };
const HISTORY_FROM = "2026-01-01";

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const service = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

async function tracker(path, { method = "GET", body, prefer, token } = {}) {
  const key = service();
  const res = await fetch(`${TRACKER_URL}${path}`, {
    method,
    headers: { apikey: token ? TRACKER_ANON : key, Authorization: `Bearer ${token ?? key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, `Tracker database: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Today's date in Juba, as YYYY-MM-DD.
function jubaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Juba", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
const parts = (iso) => { const [y, m, d] = iso.split("-").map(Number); return { year: y, month: MONTHS[m - 1], day: d }; };
const keyOf = (site, iso) => `${site}|${iso}`;
const rowIso = (r) => `${r.year}-${String(MONTHS.indexOf(r.month) + 1).padStart(2, "0")}-${String(r.day).padStart(2, "0")}`;

async function authorise(req) {
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!auth) throw new HttpError(401, "Sign in again, then retry.");
  if (process.env.SYNC_SECRET && auth === process.env.SYNC_SECRET) return "schedule";
  // Otherwise it must be a signed-in admin or manager.
  const user = await tracker("/auth/v1/user", { token: auth }).catch(() => { throw new HttpError(401, "Sign in again, then retry."); });
  const [me] = await tracker(`/rest/v1/profiles?id=eq.${user.id}&select=role,active`);
  if (!me || !me.active || !["admin", "manager"].includes(me.role)) throw new HttpError(403, "Only an admin or manager can sync.");
  return "person";
}

export async function runSync({ from, to }) {
  const feedKey = process.env.CLOUD_FEED_KEY;
  if (!feedKey) throw new HttpError(500, "The connection to Hotzonex Cloud isn't set up: the feed key is missing.");

  // 1. Ask Hotzonex Cloud for the window.
  const res = await fetch(CLOUD_FEED_URL, {
    method: "POST",
    headers: { apikey: CLOUD_PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ p_key: feedKey, p_from: from, p_to: to }),
  });
  if (!res.ok) throw new HttpError(502, `Hotzonex Cloud didn't answer (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const feed = await res.json();

  // 2. Sites: mirror Cloud, newest last.
  const sites = feed.sites.map((s, i) => ({ id: s.id, name: s.name, active: s.active !== false, sort: i + 1, synced_at: new Date().toISOString() }));
  if (sites.length) await tracker("/rest/v1/sites?on_conflict=id", { method: "POST", body: sites, prefer: "resolution=merge-duplicates,return=minimal" });
  const siteIds = new Set(sites.map((s) => s.id));

  // 3. Build each site-day: income, Cloud running costs, fixed costs.
  const fixed = await tracker("/rest/v1/fixed_costs?select=site_id,cost_key,amount");
  const fixedBySite = {};
  for (const f of fixed) (fixedBySite[f.site_id] ??= {})[f.cost_key] = Number(f.amount) || 0;

  const days = new Map(); // key -> { site, iso, income, costs }
  const day = (site, iso) => {
    const k = keyOf(site, iso);
    if (!days.has(k)) days.set(k, { site, iso, income: 0, costs: Object.fromEntries(COST_KEYS.map((c) => [c, 0])) });
    return days.get(k);
  };
  for (const r of feed.income) if (siteIds.has(r.site_id)) day(r.site_id, r.day).income += Number(r.ssp) || 0;

  const purchases = [];
  for (const e of feed.expenses) {
    if (!e.site_id || !siteIds.has(e.site_id)) continue; // expenses not tied to a site can't be placed
    const col = RUNNING[String(e.category).toLowerCase()];
    if (col) day(e.site_id, e.day).costs[col] += Number(e.amount) || 0;
    else purchases.push(e);
  }
  for (const d of days.values()) {
    if (d.income > 0) for (const [k, v] of Object.entries(fixedBySite[d.site] ?? {})) d.costs[k] += v;
  }

  // 4. Existing tracker rows in the window (to respect hand-adjusted costs).
  const fromP = parts(from), toP = parts(to);
  const existing = await tracker(`/rest/v1/daily_entries?select=id,year,month,day,location,costs_edited,from_cloud&year=gte.${fromP.year}&year=lte.${toP.year}`);
  const inWindow = existing.filter((r) => { const iso = rowIso(r); return iso >= from && iso <= to; });
  const byKey = new Map(inWindow.map((r) => [keyOf(r.location, rowIso(r)), r]));

  const now = new Date().toISOString();
  const fullRows = [], incomeOnly = [];
  for (const d of days.values()) {
    const ex = byKey.get(keyOf(d.site, d.iso));
    const base = { ...parts(d.iso), location: d.site, income: d.income, from_cloud: true, synced_at: now };
    if (ex?.costs_edited) incomeOnly.push({ id: ex.id, income: d.income });
    else fullRows.push({ ...base, ...d.costs, costs_edited: false });
  }
  if (fullRows.length) {
    for (let i = 0; i < fullRows.length; i += 500) {
      await tracker("/rest/v1/daily_entries?on_conflict=year,month,day,location",
        { method: "POST", body: fullRows.slice(i, i + 500), prefer: "resolution=merge-duplicates,return=minimal" });
    }
  }
  for (const r of incomeOnly) {
    await tracker(`/rest/v1/daily_entries?id=eq.${r.id}`, { method: "PATCH", body: { income: r.income, from_cloud: true, synced_at: now }, prefer: "return=minimal" });
  }
  // Days Cloud no longer has anything for (e.g. a voided sale or deleted expense).
  const stale = inWindow.filter((r) => r.from_cloud && !r.costs_edited && !days.has(keyOf(r.location, rowIso(r))));
  for (const r of stale) await tracker(`/rest/v1/daily_entries?id=eq.${r.id}`, { method: "DELETE", prefer: "return=minimal" });

  // 5. Cloud purchases (repairs, equipment, other) mirror into other_expenses.
  const purchaseRows = purchases.map((e) => ({
    ...parts(e.day), location: e.site_id, cloud_expense_id: e.id, amount: Number(e.amount) || 0,
    category: CATEGORY_LABEL[String(e.category).toLowerCase()] ?? "Other",
    description: (e.note && String(e.note).trim()) || `${e.category} (Hotzonex Cloud)`, notes: "From Hotzonex Cloud",
  }));
  if (purchaseRows.length) {
    await tracker("/rest/v1/other_expenses?on_conflict=cloud_expense_id",
      { method: "POST", body: purchaseRows, prefer: "resolution=merge-duplicates,return=minimal" });
  }
  const keepIds = new Set(purchaseRows.map((p) => p.cloud_expense_id));
  const linked = await tracker(`/rest/v1/other_expenses?select=id,year,month,day,cloud_expense_id&cloud_expense_id=not.is.null&year=gte.${fromP.year}&year=lte.${toP.year}`);
  for (const p of linked) {
    const iso = rowIso(p);
    if (iso >= from && iso <= to && !keepIds.has(p.cloud_expense_id)) {
      await tracker(`/rest/v1/other_expenses?id=eq.${p.id}`, { method: "DELETE", prefer: "return=minimal" });
    }
  }

  return { from, to, sites: sites.length, days: fullRows.length + incomeOnly.length, removed: stale.length, purchases: purchaseRows.length };
}

async function setStatus(fields) {
  await tracker("/rest/v1/sync_status?id=eq.1", { method: "PATCH", body: fields, prefer: "return=minimal" }).catch(() => {});
}

export default async function handler(req, res) {
  let window;
  try {
    if (!["POST", "GET"].includes(req.method)) throw new HttpError(405, "Use POST.");
    if (!service()) throw new HttpError(500, "The server is missing its Supabase key.");
    await authorise(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const today = jubaToday();
    // Every run re-reads the current and previous month in full, so expenses
    // entered late in Hotzonex Cloud for earlier days (or corrected, or
    // deleted) still come through. A nightly run, or an admin, can ask for all.
    const startOfLastMonth = (() => { const [y, m] = today.split("-").map(Number); return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`; })();
    const from = body.all ? HISTORY_FROM : /^\d{4}-\d{2}-\d{2}$/.test(body.from ?? "") ? body.from : startOfLastMonth;
    window = { from, to: today };
    await setStatus({ last_run_at: new Date().toISOString(), window_from: from, window_to: today });
    const result = await runSync(window);
    await setStatus({ last_ok_at: new Date().toISOString(), last_error: null, rows_written: result.days });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    if (window) await setStatus({ last_error: String(err.message || err).slice(0, 300) });
    return res.status(err.status || 500).json({ error: err.status ? err.message : "The sync failed on the server. Try again." });
  }
}
