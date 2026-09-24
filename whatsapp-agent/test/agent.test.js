import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../src/agent.js";

const business = { name: "Hotzonex WiFi", currency: "SSP", packages: [{ name: "1 Day", price: 1500, validity: "24 hours" }] };

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (params) => { calls.push(structuredClone(params)); return responses.shift(); } } },
  };
}

test("plain reply: returns text and appends the turn to history", async () => {
  const client = fakeClient([{ stop_reason: "end_turn", content: [{ type: "text", text: "A day pass is 1,500 SSP." }] }]);
  const agent = createAgent({ client, business });
  const { reply, history } = await agent.respond({ history: [], text: "price?", phone: "211", name: "Deng", owner: false });
  assert.equal(reply, "A day pass is 1,500 SSP.");
  assert.equal(history.length, 2);
  assert.match(history[0].content, /^\[.+ · from Deng\]\nprice\?$/);
  const req = client.calls[0];
  assert.deepEqual(req.tools.map((t) => t.name), ["escalate_to_staff"]);
  assert.match(req.system[0].text, /1 Day: 1,500 SSP/);
  assert.doesNotMatch(req.system[0].text, /owner_mode/);
  assert.equal(req.fallbacks, "default");
});

test("owner gets bookkeeping tools; tool results are fed back", async () => {
  const client = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "record_daily_entry", input: { income: 45000 } }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Saved." }] },
  ]);
  const ran = [];
  const agent = createAgent({ client, business, runToolFn: async (name, input, ctx) => { ran.push({ name, input, ctx }); return "{\"saved\":true}"; } });
  const { reply, history } = await agent.respond({ history: [], text: "sales 45000", phone: "211", name: "Boss", owner: true });
  assert.equal(reply, "Saved.");
  assert.deepEqual(ran, [{ name: "record_daily_entry", input: { income: 45000 }, ctx: { phone: "211", name: "Boss", owner: true } }]);
  assert.deepEqual(client.calls[0].tools.map((t) => t.name), ["escalate_to_staff", "get_financial_summary", "record_daily_entry"]);
  assert.match(client.calls[0].system[0].text, /owner_mode/);
  assert.deepEqual(client.calls[1].messages.at(-1).content, [{ type: "tool_result", tool_use_id: "t1", content: "{\"saved\":true}" }]);
  assert.equal(history.length, 4);
});

test("tool errors are reported to Claude with is_error", async () => {
  const client = fakeClient([
    { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "get_financial_summary", input: {} }] },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Couldn't reach the books." }] },
  ]);
  const agent = createAgent({ client, business, runToolFn: async () => { throw new Error("Supabase down"); } });
  await agent.respond({ history: [], text: "report", phone: "211", owner: true });
  assert.deepEqual(client.calls[1].messages.at(-1).content[0], { type: "tool_result", tool_use_id: "t1", content: "Error: Supabase down", is_error: true });
});

test("refusal keeps the previous history untouched", async () => {
  const prior = [{ role: "user", content: "hi" }, { role: "assistant", content: [{ type: "text", text: "hello" }] }];
  const client = fakeClient([{ stop_reason: "refusal", content: [] }]);
  const agent = createAgent({ client, business });
  const { reply, history } = await agent.respond({ history: prior, text: "...", phone: "211", owner: false });
  assert.match(reply, /Sorry/);
  assert.equal(history, prior);
});
