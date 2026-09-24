# Hotzonex WhatsApp AI Agent

A WhatsApp assistant for Hotzonex WiFi, powered by Claude. It uses the official
WhatsApp Cloud API webhooks and the Anthropic SDK.

**For customers** it answers questions about packages, prices, payment, how to connect,
troubleshooting, hours and location. When it can't solve something (for example "I paid
but got no code", a complaint or a refund request), it passes the chat to staff over WhatsApp.

**For the owner and staff** (numbers listed in `OWNER_NUMBERS`) it can also read and write the
same `daily_entries` table that the Hotzonex dashboard (`../index.jsx`) uses:

> *"Sales today 45,000, fuel 8,000, wages 5,000"* → recorded, with the day's profit sent back
> *"How did we do in August?"* → income, expenses, profit and margin for the month

## Setup

1. **Fill in `business.json`.** Add your real prices, location, hours, network name and
   payment methods. Any field still marked `EDIT ME`, and any package with price `0`, is
   hidden from the AI. It sends customers to staff for those instead of guessing.
2. **Create a WhatsApp app.** In [Meta for Developers](https://developers.facebook.com/),
   create an app, add the WhatsApp product, and note these values:
   - the **Phone number ID** and a **permanent access token** (from a System User)
   - the **App secret** (App settings → Basic)
3. **Configure** the agent: `cp .env.example .env` and fill it in (Anthropic key, WhatsApp values,
   `OWNER_NUMBERS`, Supabase URL and key). Use a Supabase **service-role** key. It never
   leaves the server.
4. **Run** it:
   ```bash
   npm install
   npm start          # listens on $PORT (default 3000)
   ```
5. **Register the webhook.** In the Meta app, go to WhatsApp → Configuration → Webhook:
   - Callback URL: `https://<your-host>/webhook`
   - Verify token: the same value as `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.

   Any HTTPS host that runs Node 20+ will work (Render, Railway, Fly.io, a VPS). For local testing,
   expose port 3000 with `ngrok http 3000`.

## Try it without WhatsApp

```bash
npm run chat              # talk to it as a customer
npm run chat -- --owner   # talk to it as the owner (writes to Supabase!)
```

In this mode, messages to staff are printed in the terminal instead of sent.

## How it works

| File | Purpose |
|---|---|
| `src/server.js` | HTTP server: `GET /webhook` handshake, `POST /webhook` (signature-checked), `GET /health` |
| `src/whatsapp.js` | Signature check, payload parsing, sending messages (long replies are split to fit WhatsApp's limit), read receipt and typing indicator |
| `src/handler.js` | Removes duplicate deliveries, runs one message at a time per number, handles `reset`, and calls the agent |
| `src/agent.js` | System prompt and the Claude tool loop (`claude-opus-5`, adaptive thinking, server-side refusal fallback) |
| `src/tools.js` | `escalate_to_staff` for everyone; `get_financial_summary` and `record_daily_entry` for owners only |
| `src/supabase.js` | Reads and writes the dashboard's `daily_entries` table |
| `src/store.js` | Chat history kept in memory (last 40 messages; cleared after 12 hours of silence) |

- **Owner check:** customers are only offered the escalation tool, and the bookkeeping tools
  check the sender's number again before they run.
- **Starting over:** a customer can send `reset` to clear their chat history.
- **Message types:** the agent reads text only. For images and voice notes it asks the sender to type instead.
- **History storage:** history is kept in memory. That is fine for one server instance, but
  history is lost when the server restarts. If you run more than one instance, move `ConversationStore` to Redis or Supabase.
- **Upserts:** record upserts use `on_conflict=year,month,day`. This needs the unique constraint
  on those columns that the dashboard's upsert already depends on.

## Tests

```bash
npm test
```
