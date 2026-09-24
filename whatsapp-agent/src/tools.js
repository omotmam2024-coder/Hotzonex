// Tools Claude can call. Customers get escalation only; owners also get the books.
import { config } from "./config.js";
import { localParts, parseIsoDate } from "./dates.js";
import { MONTHS, EXPENSE_FIELDS, fetchEntries, upsertEntry, summarize } from "./supabase.js";
import { sendText } from "./whatsapp.js";

const amount = (description) => ({ type: "number", minimum: 0, description });

const escalateTool = {
  name: "escalate_to_staff",
  description:
    "Hand the conversation to a human at Hotzonex. Use when the customer asks for a person, reports a payment " +
    "or voucher problem you cannot solve from the reference info (e.g. paid but got no code, code rejected after " +
    "troubleshooting), wants a refund, complains, or asks about something not covered. Staff are notified on WhatsApp " +
    "and reply to the customer directly.",
  input_schema: {
    type: "object",
    properties: {
      reason: { type: "string", enum: ["payment_issue", "voucher_issue", "connection_issue", "complaint", "sales_inquiry", "other"] },
      summary: { type: "string", description: "One or two sentences for staff: what the customer needs, with any voucher code, amount or time they gave." },
    },
    required: ["reason", "summary"],
    additionalProperties: false,
  },
};

const summaryTool = {
  name: "get_financial_summary",
  description:
    "Read income/expense totals from the Hotzonex books (the same data as the dashboard). " +
    "Give just a year for the annual total with a per-month breakdown, a year+month for that month with per-day rows, " +
    "or a full date for one day. Amounts are in SSP.",
  input_schema: {
    type: "object",
    properties: {
      year: { type: "integer", minimum: 2000, maximum: 2100 },
      month: { type: "string", enum: MONTHS },
      date: { type: "string", description: "A single day as YYYY-MM-DD. Overrides year/month." },
    },
    additionalProperties: false,
  },
};

const recordTool = {
  name: "record_daily_entry",
  description:
    "Write one day's figures to the Hotzonex books. Only the fields you pass are changed; other fields for that day " +
    "keep their current values. Values REPLACE what is stored — if the owner says to add to an amount, read the day " +
    "first with get_financial_summary and write the new total. Pass 0 to clear a field.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "YYYY-MM-DD in the business's local timezone. Defaults to today." },
      income: amount("Total voucher sales / income for the day"),
      internet: amount("Internet (ISP / bundle) expense"),
      power: amount("Power / fuel / generator expense"),
      feeding: amount("Feeding expense"),
      wages: amount("Wages expense"),
    },
    additionalProperties: false,
  },
};

export function toolsFor({ owner }) {
  return owner ? [escalateTool, summaryTool, recordTool] : [escalateTool];
}

// Runs one tool call. `ctx` is { phone, name, owner }. Returns a string for the tool_result.
export async function runTool(name, input, ctx, deps = { sendText }) {
  if (name === "escalate_to_staff") {
    if (!config.escalationNumber) return "No staff number is configured. Ask the customer to visit the counter.";
    if (config.escalationNumber === ctx.phone) return "You are the staff contact; nothing to escalate.";
    const who = ctx.name ? `${ctx.name} (+${ctx.phone})` : `+${ctx.phone}`;
    await deps.sendText(
      config.escalationNumber,
      `🔔 Hotzonex support request\nFrom: ${who}\nReason: ${input.reason}\n\n${input.summary}\n\nReply to them at https://wa.me/${ctx.phone}`,
    );
    return "Staff have been notified and will reply to the customer on WhatsApp.";
  }

  if (!ctx.owner) throw new Error(`Tool ${name} is only available to the owner.`);

  if (name === "get_financial_summary") {
    const today = localParts(new Date(), config.timezone);
    if (input.date) {
      const { year, month, day } = parseIsoDate(input.date);
      const rows = (await fetchEntries({ year, month })).filter((r) => Number(r.day) === day);
      return JSON.stringify({ date: input.date, ...summarize(rows) });
    }
    const year = input.year ?? today.year;
    const rows = await fetchEntries({ year, month: input.month });
    if (input.month) {
      const days = rows
        .filter((r) => ["income", ...EXPENSE_FIELDS].some((f) => Number(r[f])))
        .map((r) => ({ day: r.day, ...summarize([r]) }));
      return JSON.stringify({ year, month: input.month, total: summarize(rows), days });
    }
    const months = MONTHS
      .map((m) => ({ month: m, ...summarize(rows.filter((r) => r.month === m)) }))
      .filter((m) => m.days_recorded > 0);
    return JSON.stringify({ year, total: summarize(rows), months });
  }

  if (name === "record_daily_entry") {
    const iso = input.date || localParts(new Date(), config.timezone).iso;
    const key = parseIsoDate(iso);
    const fields = {};
    for (const f of ["income", ...EXPENSE_FIELDS]) {
      if (input[f] !== undefined) fields[f] = Number(input[f]);
    }
    if (!Object.keys(fields).length) throw new Error("No amounts given; nothing was recorded.");
    const [row] = await upsertEntry({ ...key, ...fields });
    return JSON.stringify({ saved: true, date: iso, row: row ?? { ...key, ...fields }, day_totals: summarize([row ?? fields]) });
  }

  throw new Error(`Unknown tool: ${name}`);
}
