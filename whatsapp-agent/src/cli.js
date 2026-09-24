// Chat with the agent in the terminal, without WhatsApp. Needs ANTHROPIC_API_KEY.
//   npm run chat            → as a customer
//   npm run chat -- --owner → as the owner (bookkeeping tools enabled)
import readline from "node:readline/promises";
import { createAgent } from "./agent.js";
import { runTool } from "./tools.js";

const owner = process.argv.includes("--owner");
const phone = "000000000000";

// Print escalations instead of sending them to WhatsApp.
const agent = createAgent({
  runToolFn: (name, input, ctx) =>
    runTool(name, input, ctx, { sendText: async (to, text) => console.log(`\n[would send to +${to}]\n${text}\n`) }),
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`Hotzonex agent (${owner ? "owner" : "customer"} mode). Ctrl+C to quit.\n`);
let history = [];
for (;;) {
  const text = await rl.question("you> ");
  if (!text.trim()) continue;
  const res = await agent.respond({ history, text, phone, name: owner ? "Owner" : "Test customer", owner });
  history = res.history;
  console.log(`\nbot> ${res.reply}\n`);
}
