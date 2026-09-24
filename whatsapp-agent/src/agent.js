// The Claude-powered agent: builds the prompt, runs the tool loop, returns reply text.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { loadBusiness, renderBusinessFacts } from "./business.js";
import { localParts } from "./dates.js";
import { toolsFor, runTool } from "./tools.js";

const MAX_TOOL_ROUNDS = 8;
const FALLBACK_REPLY = "Sorry, I couldn't process that right now. Please try again in a moment, or visit the Hotzonex counter for help.";

function systemPrompt(biz, { owner }) {
  const base = `You are the WhatsApp assistant for ${biz.name}, a WiFi hotspot business that sells internet access vouchers.

You help customers with: package prices and validity, how to buy and pay, how to connect, fixing connection problems, opening hours and location. Keep replies short and friendly — this is WhatsApp on a phone, so a few sentences, plain text, simple lists at most. WhatsApp formatting is *bold* and _italic_; do not use Markdown headings, tables or links in [brackets](...). Reply in the language the customer writes in when it is one of the listed languages, otherwise English.

Only state facts that appear in the reference information below. If something is marked "not provided", or a customer asks about anything not covered (custom plans, discounts, outages, refunds), say you will check with the team and use escalate_to_staff. Never invent prices, voucher codes, promotions or account details, and never promise refunds or free time. You cannot generate or look up vouchers yourself; customers buy them through the listed payment methods.

When a customer has a problem, walk through the relevant troubleshooting steps one or two at a time. If they have tried the steps and it still fails, or they report paying without receiving a code, escalate_to_staff with a clear summary and tell them staff will contact them.

Each user message starts with a bracketed line giving the local date/time and the sender's name; use it for "today"/"yesterday" but do not repeat it back.

<reference_information>
${renderBusinessFacts(biz)}
</reference_information>`;

  if (!owner) return base;
  return `${base}

<owner_mode>
This sender is the Hotzonex owner/staff. In addition to the above, you can read and update the business books (the "daily_entries" data shown in the Hotzonex dashboard) with get_financial_summary and record_daily_entry. Income is voucher sales; expenses are internet, power (power/fuel), feeding and wages. All amounts are SSP.
- When the owner reports figures ("sales today 45,000, fuel 8,000"), record them, then confirm what was saved and the day's profit in one short message.
- If the date or which field an amount belongs to is ambiguous, ask before writing.
- For reports, give totals first (income, expenses, profit, margin), then at most a few highlights.
</owner_mode>`;
}

export function createAgent({ client = new Anthropic(), business = loadBusiness(), runToolFn = runTool } = {}) {
  const prompts = {
    customer: systemPrompt(business, { owner: false }),
    owner: systemPrompt(business, { owner: true }),
  };

  // history: prior Anthropic messages for this phone. Returns { reply, history }.
  async function respond({ history, text, phone, name, owner }) {
    const now = localParts(new Date(), config.timezone);
    const header = `[${now.weekday} ${now.iso} ${now.time} · from ${name || "customer"}]`;
    const messages = [...history, { role: "user", content: `${header}\n${text}` }];
    const ctx = { phone, name, owner };
    const tools = toolsFor({ owner });

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: config.model,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // Cache the stable system prompt + tools; the conversation grows after it.
        system: [{ type: "text", text: owner ? prompts.owner : prompts.customer, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      });

      if (response.stop_reason === "refusal") {
        // Drop the refused turn so it doesn't poison later requests.
        return { reply: FALLBACK_REPLY, history };
      }

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "pause_turn") continue;

      const toolUses = response.content.filter((b) => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return { reply: reply || FALLBACK_REPLY, history: messages };
      }

      const results = await Promise.all(toolUses.map(async (tu) => {
        try {
          return { type: "tool_result", tool_use_id: tu.id, content: await runToolFn(tu.name, tu.input, ctx) };
        } catch (err) {
          console.error(`tool ${tu.name} failed:`, err.message);
          return { type: "tool_result", tool_use_id: tu.id, content: `Error: ${err.message}`, is_error: true };
        }
      }));
      messages.push({ role: "user", content: results });
    }

    // Tool loop didn't settle; don't keep a dangling tool_result turn in history.
    return { reply: FALLBACK_REPLY, history };
  }

  return { respond };
}
