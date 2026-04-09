import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";

async function withBridge(url, fn) {
  await startDaemon();
  const browser = await connectBrowser();
  const bridge = await createBridge(browser);
  try {
    if (url) await bridge.openPage(url);
    return await fn(bridge);
  } finally {
    await bridge.close();
    await browser.close();
    await stopDaemon();
  }
}

export function speakCommand() {
  const speak = new Command("speak").description("Query spoken phrases");

  speak
    .command("last")
    .description("Get the last spoken phrase")
    .option("--url <url>", "Open this URL first")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const result = await withBridge(opts.url, async (bridge) => {
        const phrase = await bridge.lastSpokenPhrase();
        return { phrase };
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.phrase);
      }
    });

  speak
    .command("log")
    .description("Get the full spoken phrase log")
    .option("--url <url>", "Open this URL first")
    .option("--steps <n>", "Navigate N steps forward first", parseInt)
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const result = await withBridge(opts.url, async (bridge) => {
        const steps = opts.steps || 0;
        for (let i = 0; i < steps; i++) {
          await bridge.next();
        }
        const log = await bridge.spokenPhraseLog();
        return { log, count: log.length };
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        result.log.forEach((phrase, i) => console.log(`${i + 1}. ${phrase}`));
      }
    });

  speak
    .command("find <text>")
    .description("Navigate forward until spoken phrase contains text")
    .option("--url <url>", "Open this URL first")
    .option("--max <n>", "Maximum steps to search", parseInt, 100)
    .option("--json", "Output as JSON")
    .action(async (text, opts) => {
      const result = await withBridge(opts.url, async (bridge) => {
        const max = opts.max || 100;
        for (let i = 0; i < max; i++) {
          const phrase = await bridge.next();
          if (phrase.toLowerCase().includes(text.toLowerCase())) {
            const nodeInfo = await bridge.activeNodeInfo();
            return { found: true, phrase, step: i + 1, node: nodeInfo };
          }
        }
        return { found: false, phrase: null, step: null, node: null };
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else if (result.found) {
        console.log(`Found at step ${result.step}: ${result.phrase}`);
      } else {
        console.log(`"${text}" not found in first ${opts.max || 100} elements`);
      }
    });

  return speak;
}
