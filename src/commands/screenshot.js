import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";
import path from "node:path";

export function screenshotCommand() {
  const screenshot = new Command("screenshot")
    .description("Screenshot the current element or full page")
    .option("--url <url>", "Open this URL first")
    .option("--full", "Take a full page screenshot instead of current element")
    .option("--output <path>", "Output file path", "screenshot.png")
    .option("--navigate <n>", "Navigate N steps forward before screenshotting", parseInt, 0)
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      await startDaemon();
      const browser = await connectBrowser();
      const bridge = await createBridge(browser);

      try {
        if (opts.url) await bridge.openPage(opts.url);

        for (let i = 0; i < (opts.navigate || 0); i++) {
          await bridge.next();
        }

        const outPath = path.resolve(opts.output);
        let result;
        if (opts.full) {
          await bridge.screenshotFullPage(outPath);
          result = { type: "full-page", path: outPath };
        } else {
          await bridge.screenshotActiveNode(outPath);
          const phrase = await bridge.lastSpokenPhrase();
          const nodeInfo = await bridge.activeNodeInfo();
          result = { type: "element", path: outPath, phrase, node: nodeInfo };
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Screenshot saved: ${outPath}`);
          if (result.phrase) console.log(`Element: ${result.phrase}`);
        }
      } finally {
        await bridge.close();
        await browser.close();
        await stopDaemon();
      }
    });

  return screenshot;
}
