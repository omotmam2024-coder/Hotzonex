// In-memory conversation history per WhatsApp number.
// Swap for Redis/Supabase if you run more than one server instance.

const MAX_MESSAGES = 40;              // cap sent to Claude per request
const IDLE_RESET_MS = 12 * 60 * 60e3; // start fresh after 12h of silence

export class ConversationStore {
  constructor({ maxMessages = MAX_MESSAGES, idleResetMs = IDLE_RESET_MS } = {}) {
    this.maxMessages = maxMessages;
    this.idleResetMs = idleResetMs;
    this.convos = new Map();
    this.locks = new Map();
  }

  get(phone) {
    const c = this.convos.get(phone);
    if (!c || Date.now() - c.updatedAt > this.idleResetMs) return [];
    return c.messages;
  }

  set(phone, messages) {
    this.convos.set(phone, { messages: trimHistory(messages, this.maxMessages), updatedAt: Date.now() });
  }

  reset(phone) {
    this.convos.delete(phone);
  }

  // Serializes work per phone so two quick messages don't race on the same history.
  async withLock(phone, fn) {
    const prev = this.locks.get(phone) || Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => {});
    this.locks.set(phone, tail);
    try {
      return await run;
    } finally {
      if (this.locks.get(phone) === tail) this.locks.delete(phone);
    }
  }
}

// Keeps the most recent messages, but always starts on a plain user message:
// a history that opens with an assistant turn or an orphaned tool_result is rejected by the API.
export function trimHistory(messages, max) {
  if (messages.length <= max) return messages;
  let start = messages.length - max;
  while (start < messages.length && !isPlainUserTurn(messages[start])) start++;
  return messages.slice(start);
}

function isPlainUserTurn(m) {
  if (m.role !== "user") return false;
  if (typeof m.content === "string") return true;
  return !m.content.some((b) => b.type === "tool_result");
}

// WhatsApp redelivers webhooks it thinks failed; remember recent message ids.
export class SeenIds {
  constructor(limit = 5000) {
    this.limit = limit;
    this.ids = new Set();
  }
  // Returns true the first time an id is seen.
  add(id) {
    if (this.ids.has(id)) return false;
    this.ids.add(id);
    if (this.ids.size > this.limit) this.ids.delete(this.ids.values().next().value);
    return true;
  }
}
