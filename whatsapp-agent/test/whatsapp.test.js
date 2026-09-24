import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifySignature, verifyWebhook, extractMessages, chunkText } from "../src/whatsapp.js";

test("verifySignature accepts a valid Meta signature and rejects others", () => {
  const body = Buffer.from('{"hello":"world"}');
  const sig = "sha256=" + crypto.createHmac("sha256", "secret").update(body).digest("hex");
  assert.equal(verifySignature(body, sig, "secret"), true);
  assert.equal(verifySignature(body, sig, "other-secret"), false);
  assert.equal(verifySignature(body, "sha256=abcd", "secret"), false);
  assert.equal(verifySignature(body, undefined, "secret"), false);
  assert.equal(verifySignature(body, sig, ""), false);
});

test("verifyWebhook returns the challenge only for the right token", () => {
  const q = new URLSearchParams({ "hub.mode": "subscribe", "hub.verify_token": "tok", "hub.challenge": "42" });
  assert.equal(verifyWebhook(q, "tok"), "42");
  assert.equal(verifyWebhook(q, "nope"), null);
  assert.equal(verifyWebhook(q, ""), null);
});

test("extractMessages pulls text, buttons and non-text messages, skips statuses", () => {
  const payload = {
    entry: [{ changes: [{ value: {
      contacts: [{ wa_id: "211900000001", profile: { name: "Deng" } }],
      messages: [
        { id: "m1", from: "211900000001", timestamp: "1700000000", type: "text", text: { body: "price?" } },
        { id: "m2", from: "211900000001", timestamp: "1700000001", type: "image", image: {} },
        { id: "m3", from: "211900000001", timestamp: "1700000002", type: "interactive", interactive: { button_reply: { title: "Yes" } } },
      ],
    } }, { value: { statuses: [{ id: "s1", status: "read" }] } }] }],
  };
  const msgs = extractMessages(payload);
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs[0], { id: "m1", from: "211900000001", name: "Deng", timestamp: 1700000000, type: "text", text: "price?" });
  assert.equal(msgs[1].text, null);
  assert.equal(msgs[2].text, "Yes");
  assert.deepEqual(extractMessages({}), []);
});

test("chunkText keeps each part within the limit", () => {
  const text = Array.from({ length: 50 }, (_, i) => `Paragraph ${i} ` + "x".repeat(150)).join("\n\n");
  const parts = chunkText(text, 1000);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(p.length <= 1000);
  assert.equal(parts.join("").replace(/\s/g, ""), text.replace(/\s/g, ""));
  assert.deepEqual(chunkText("short"), ["short"]);
});
