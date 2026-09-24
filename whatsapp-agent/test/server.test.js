import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { config } from "../src/config.js";
import { createServer } from "../src/server.js";
import { createHandler } from "../src/handler.js";
import { ConversationStore, SeenIds } from "../src/store.js";

config.whatsapp.appSecret = "app-secret";
config.whatsapp.verifyToken = "verify-me";

async function withServer(handleMessage, fn) {
  const server = createServer({ handleMessage }).listen(0);
  await new Promise((r) => server.once("listening", r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

const sign = (body) => "sha256=" + crypto.createHmac("sha256", "app-secret").update(body).digest("hex");
const payload = (id, text) => JSON.stringify({ entry: [{ changes: [{ value: {
  messages: [{ id, from: "211900000001", timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
} }] }] });

test("webhook verification handshake", async () => {
  await withServer(async () => {}, async (base) => {
    const ok = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=abc`);
    assert.equal(ok.status, 200);
    assert.equal(await ok.text(), "abc");
    const bad = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc`);
    assert.equal(bad.status, 403);
  });
});

test("unsigned posts are rejected; signed ones reach the handler once", async () => {
  const replies = [];
  const agent = { respond: async ({ history, text }) => ({ reply: `echo: ${text}`, history: [...history, { role: "user", content: text }] }) };
  const store = new ConversationStore();
  const handleMessage = createHandler({ agent, store, seen: new SeenIds(), send: async (to, text) => replies.push({ to, text }) });

  await withServer(handleMessage, async (base) => {
    const body = payload("wamid.1", "hello");
    assert.equal((await fetch(`${base}/webhook`, { method: "POST", body })).status, 401);
    for (let i = 0; i < 2; i++) { // second is a redelivery
      const res = await fetch(`${base}/webhook`, { method: "POST", body, headers: { "x-hub-signature-256": sign(body) } });
      assert.equal(res.status, 200);
    }
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(replies, [{ to: "211900000001", text: "echo: hello" }]);
    assert.equal(store.get("211900000001").length, 1);

    const reset = payload("wamid.2", "reset");
    await fetch(`${base}/webhook`, { method: "POST", body: reset, headers: { "x-hub-signature-256": sign(reset) } });
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(store.get("211900000001"), []);
    assert.match(replies.at(-1).text, /starting fresh/);
  });
});
