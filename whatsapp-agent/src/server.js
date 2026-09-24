// HTTP server exposing the WhatsApp webhook.
import http from "node:http";
import { config, missingServerConfig } from "./config.js";
import { loadBusiness, unfinishedFields } from "./business.js";
import { supabaseConfigured } from "./supabase.js";
import { createAgent } from "./agent.js";
import { createHandler } from "./handler.js";
import { ConversationStore, SeenIds } from "./store.js";
import { verifySignature, verifyWebhook, extractMessages, sendText, markReadWithTyping } from "./whatsapp.js";

const MAX_BODY = 1024 * 1024;

export function createServer({ handleMessage }) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (url.pathname !== "/webhook") {
      res.writeHead(404);
      return res.end();
    }

    if (req.method === "GET") {
      const challenge = verifyWebhook(url.searchParams);
      res.writeHead(challenge === null ? 403 : 200, { "Content-Type": "text/plain" });
      return res.end(challenge ?? "Forbidden");
    }

    if (req.method !== "POST") {
      res.writeHead(405);
      return res.end();
    }

    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413);
        return res.end();
      }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks);

    if (!verifySignature(raw, req.headers["x-hub-signature-256"])) {
      res.writeHead(401);
      return res.end();
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8"));
    } catch {
      res.writeHead(400);
      return res.end();
    }

    // Acknowledge immediately; Meta retries if we take too long.
    res.writeHead(200);
    res.end();

    for (const msg of extractMessages(payload)) {
      handleMessage(msg).catch(async (err) => {
        console.error(`failed to handle message ${msg.id} from ${msg.from}:`, err);
        try {
          await sendText(msg.from, "Sorry, something went wrong on our side. Please try again shortly.");
        } catch {}
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const missing = missingServerConfig();
  if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")} (see .env.example)`);
    process.exit(1);
  }
  const business = loadBusiness();
  const todo = unfinishedFields(business);
  if (todo.length) console.warn(`business.json still has placeholder values (the agent will refer customers to staff for these): ${todo.join(", ")}`);
  if (!config.ownerNumbers.length) console.warn("OWNER_NUMBERS is empty: nobody can use the bookkeeping tools.");
  if (!supabaseConfigured()) console.warn("SUPABASE_URL/SUPABASE_KEY not set: bookkeeping tools will return errors.");

  const handleMessage = createHandler({
    agent: createAgent({ business }),
    store: new ConversationStore(),
    seen: new SeenIds(),
    send: sendText,
    markRead: markReadWithTyping,
  });
  createServer({ handleMessage }).listen(config.port, () => {
    console.log(`Hotzonex WhatsApp agent listening on :${config.port} (webhook: /webhook, model: ${config.model})`);
  });
}
