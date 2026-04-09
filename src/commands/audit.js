import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";

export function auditCommand() {
  const audit = new Command("audit")
    .description("Full screen reader traversal of a page")
    .argument("<url>", "URL or local file to audit")
    .option("--summary", "Include heading structure and landmark summary")
    .option("--json", "Output as JSON")
    .option("--max <n>", "Maximum elements to traverse", parseInt, 500)
    .action(async (url, opts) => {
      await startDaemon();
      const browser = await connectBrowser();
      const bridge = await createBridge(browser);

      try {
        await bridge.openPage(url);
        const phrases = [];
        const headings = [];
        const landmarks = [];
        const links = [];
        const max = opts.max || 500;

        for (let i = 0; i < max; i++) {
          const phrase = await bridge.next();
          phrases.push(phrase);

          if (opts.summary) {
            const lower = phrase.toLowerCase();
            if (lower.includes("heading,") || lower.match(/heading.*level \d/)) {
              headings.push(phrase);
            }
            if (
              lower.includes("navigation") ||
              lower.includes("banner") ||
              lower.includes("contentinfo") ||
              lower.includes("main") ||
              lower.includes("complementary") ||
              lower.includes("region")
            ) {
              if (!lower.startsWith("end of")) {
                landmarks.push(phrase);
              }
            }
            if (lower.includes("link")) {
              links.push(phrase);
            }
          }

          if (phrase === "end of document") break;
        }

        const result = { phrases, total: phrases.length };
        if (opts.summary) {
          result.headings = headings;
          result.landmarks = landmarks;
          result.links = links;
          result.summary = {
            totalElements: phrases.length,
            headingCount: headings.length,
            landmarkCount: landmarks.length,
            linkCount: links.length,
          };
        }

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          phrases.forEach((p) => console.log(p));
          if (opts.summary) {
            console.log("\n--- Summary ---");
            console.log(`Elements: ${phrases.length}`);
            console.log(`Headings (${headings.length}):`);
            headings.forEach((h) => console.log(`  ${h}`));
            console.log(`Landmarks (${landmarks.length}):`);
            landmarks.forEach((l) => console.log(`  ${l}`));
            console.log(`Links: ${links.length}`);
          }
        }
      } finally {
        await bridge.close();
        await browser.close();
        await stopDaemon();
      }
    });

  return audit;
}
