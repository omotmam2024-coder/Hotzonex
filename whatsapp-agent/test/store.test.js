import { test } from "node:test";
import assert from "node:assert/strict";
import { ConversationStore, SeenIds, trimHistory } from "../src/store.js";

test("trimHistory never starts on an assistant turn or a tool_result", () => {
  const msgs = [
    { role: "user", content: "hi" },
    { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "x", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
    { role: "assistant", content: [{ type: "text", text: "done" }] },
    { role: "user", content: "next" },
    { role: "assistant", content: [{ type: "text", text: "sure" }] },
  ];
  assert.deepEqual(trimHistory(msgs, 4), msgs.slice(4));
  assert.deepEqual(trimHistory(msgs, 10), msgs);
});

test("ConversationStore forgets idle conversations", () => {
  const store = new ConversationStore({ idleResetMs: 0 });
  store.set("1", [{ role: "user", content: "hi" }]);
  store.convos.get("1").updatedAt -= 1;
  assert.deepEqual(store.get("1"), []);
});

test("withLock runs work for one phone in order", async () => {
  const store = new ConversationStore();
  const order = [];
  const slow = store.withLock("1", async () => { await new Promise((r) => setTimeout(r, 20)); order.push("a"); });
  const fast = store.withLock("1", async () => { order.push("b"); });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ["a", "b"]);
  await assert.rejects(store.withLock("1", async () => { throw new Error("boom"); }));
  await store.withLock("1", async () => order.push("c"));
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("SeenIds deduplicates", () => {
  const seen = new SeenIds(2);
  assert.equal(seen.add("a"), true);
  assert.equal(seen.add("a"), false);
  seen.add("b"); seen.add("c");
  assert.equal(seen.add("a"), true); // evicted
});
