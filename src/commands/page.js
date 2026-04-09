import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";

async function withBridge(fn) {
  await startDaemon();
  const browser = await connectBrowser();
  const bridge = await createBridge(browser);
  try {
    return await fn(bridge);
  } finally {
    await bridge.close();
    await browser.close();
    await stopDaemon();
  }
}

export function pageCommand() {
  const page = new Command("page").description("Page navigation commands");

  page
    .command("open <url>")
    .description("Open a URL or local HTML file")
    .option("--json", "Output as JSON")
    .action(async (url, opts) => {
      const result = await withBridge(async (bridge) => {
        await bridge.openPage(url);
        return bridge.pageInfo();
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Opened: ${result.title} (${result.url})`);
      }
    });

  page
    .command("info")
    .description("Show current page info")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const result = await withBridge(async (bridge) => {
        return bridge.pageInfo();
      });
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`${result.title} — ${result.url}`);
      }
    });

  return page;
}
