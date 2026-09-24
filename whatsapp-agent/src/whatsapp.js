// WhatsApp Cloud API: webhook verification, payload parsing and sending messages.
import crypto from "node:crypto";
import { config } from "./config.js";

const MAX_TEXT = 4096; // WhatsApp's limit for one text message body

// Meta signs each webhook POST with HMAC-SHA256 of the raw body using the app secret.
export function verifySignature(rawBody, signatureHeader, appSecret = config.whatsapp.appSecret) {
  if (!appSecret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = signatureHeader.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"));
}

// Handles the GET handshake Meta performs when you register the webhook URL.
export function verifyWebhook(query, verifyToken = config.whatsapp.verifyToken) {
  if (query.get("hub.mode") === "subscribe" && verifyToken && query.get("hub.verify_token") === verifyToken) {
    return query.get("hub.challenge") ?? "";
  }
  return null;
}

// Flattens a webhook payload into the incoming messages we care about.
// Status updates (sent/delivered/read) are ignored.
export function extractMessages(payload) {
  const out = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const names = Object.fromEntries((value.contacts || []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value.messages || []) {
        let text = null;
        if (m.type === "text") text = m.text?.body ?? "";
        else if (m.type === "button") text = m.button?.text ?? "";
        else if (m.type === "interactive") {
          text = m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
        }
        out.push({
          id: m.id,
          from: m.from,
          name: names[m.from] || null,
          timestamp: Number(m.timestamp) || Math.floor(Date.now() / 1000),
          type: m.type,
          text,
        });
      }
    }
  }
  return out;
}

// Splits long replies on paragraph/line boundaries so each part fits in one message.
export function chunkText(text, max = MAX_TEXT) {
  const parts = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function graph(body) {
  const { apiVersion, phoneNumberId, token } = config.whatsapp;
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...body }),
  });
  if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendText(to, text) {
  for (const body of chunkText(text)) {
    await graph({ recipient_type: "individual", to, type: "text", text: { body, preview_url: false } });
  }
}

// Blue ticks + typing indicator while Claude works on the reply.
export async function markReadWithTyping(messageId) {
  try {
    await graph({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });
  } catch (err) {
    console.warn("markRead failed:", err.message);
  }
}
