import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";
import { runTool, toolsFor } from "../src/tools.js";
import { summarize } from "../src/supabase.js";
import { parseIsoDate } from "../src/dates.js";

const realFetch = globalThis.fetch;
let requests;
beforeEach(() => {
  requests = [];
  Object.assign(config.supabase, { url: "https://example.supabase.co", key: "k" });
  config.escalationNumber = "211999999999";
});
afterEach(() => { globalThis.fetch = realFetch; });

function mockFetch(body) {
  globalThis.fetch = async (url, opts = {}) => {
    requests.push({ url: String(url), ...opts });
    return new Response(JSON.stringify(typeof body === "function" ? body(url, opts) : body), { status: 200 });
  };
}

test("customers only see the escalation tool and cannot call owner tools", async () => {
  assert.deepEqual(toolsFor({ owner: false }).map((t) => t.name), ["escalate_to_staff"]);
  await assert.rejects(runTool("get_financial_summary", {}, { phone: "1", owner: false }), /only available to the owner/);
});

test("escalate_to_staff notifies the staff number", async () => {
  const sent = [];
  const out = await runTool("escalate_to_staff", { reason: "payment_issue", summary: "Paid 1500, no code" },
    { phone: "211900000001", name: "Deng", owner: false }, { sendText: async (to, text) => sent.push({ to, text }) });
  assert.match(out, /notified/);
  assert.equal(sent[0].to, "211999999999");
  assert.match(sent[0].text, /Deng \(\+211900000001\)/);
  assert.match(sent[0].text, /Paid 1500, no code/);
});

test("record_daily_entry upserts only the given fields", async () => {
  mockFetch((url, opts) => [{ year: 2026, month: "September", day: 24, ...JSON.parse(opts.body) }]);
  const out = JSON.parse(await runTool("record_daily_entry", { date: "2026-09-24", income: 45000, power: 8000 }, { phone: "1", owner: true }));
  assert.equal(requests[0].method, "POST");
  assert.match(requests[0].url, /\/rest\/v1\/daily_entries\?on_conflict=year,month,day$/);
  assert.deepEqual(JSON.parse(requests[0].body), { year: 2026, month: "September", day: 24, income: 45000, power: 8000 });
  assert.equal(out.day_totals.profit, 37000);
  await assert.rejects(runTool("record_daily_entry", { date: "2026-09-24" }, { owner: true }), /No amounts/);
});

test("get_financial_summary for a month returns totals and active days", async () => {
  mockFetch([
    { year: 2026, month: "September", day: 1, income: 10000, internet: 2000, power: 1000, feeding: 0, wages: 0 },
    { year: 2026, month: "September", day: 2, income: 0, internet: 0, power: 0, feeding: 0, wages: 0 },
    { year: 2026, month: "September", day: 3, income: 20000, internet: 0, power: 0, feeding: 500, wages: 3000 },
  ]);
  const out = JSON.parse(await runTool("get_financial_summary", { year: 2026, month: "September" }, { owner: true }));
  assert.match(requests[0].url, /year=eq\.2026&order=month\.asc%2Cday\.asc&month=eq\.September/);
  assert.equal(out.total.income, 30000);
  assert.equal(out.total.expenses, 6500);
  assert.equal(out.total.profit, 23500);
  assert.equal(out.days.length, 2);
});

test("summarize and parseIsoDate", () => {
  assert.deepEqual(summarize([]), { income: 0, internet: 0, power: 0, feeding: 0, wages: 0, expenses: 0, profit: 0, margin_pct: 0, days_recorded: 0 });
  assert.deepEqual(parseIsoDate("2028-02-29"), { year: 2028, month: "February", day: 29 });
  assert.throws(() => parseIsoDate("2026-02-30"), /Invalid date/);
  assert.throws(() => parseIsoDate("yesterday"), /Invalid date/);
});
