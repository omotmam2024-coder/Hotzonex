// Glue between incoming WhatsApp messages, the conversation store and the agent.
import { isOwner } from "./config.js";

const RESET_WORDS = new Set(["reset", "/reset", "restart", "start over"]);

export function createHandler({ agent, store, seen, send, markRead = async () => {} }) {
  return async function handleMessage(msg) {
    if (!seen.add(msg.id)) return; // duplicate delivery
    // Ignore messages older than 10 minutes (e.g. redelivered after downtime).
    if (Date.now() / 1000 - msg.timestamp > 600) return;

    await store.withLock(msg.from, async () => {
      if (msg.text == null || !msg.text.trim()) {
        await send(msg.from, "Sorry, I can only read text messages. Please type your question. 🙂");
        return;
      }
      if (RESET_WORDS.has(msg.text.trim().toLowerCase())) {
        store.reset(msg.from);
        await send(msg.from, "Okay, starting fresh. How can I help you with Hotzonex WiFi today?");
        return;
      }

      await markRead(msg.id);
      const { reply, history } = await agent.respond({
        history: store.get(msg.from),
        text: msg.text,
        phone: msg.from,
        name: msg.name,
        owner: isOwner(msg.from),
      });
      store.set(msg.from, history);
      await send(msg.from, reply);
    });
  };
}
