import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";
import { collectKeyValue, DEVICE_NAMES, resolveDeviceOptions } from "../util.js";

export function auditCommand() {
  const audit = new Command("audit")
    .description("Full screen reader traversal of a page")
    .argument("<url>", "URL or local file to audit")
    .option("--summary", "Include heading structure and landmark summary")
    .option("--json", "Output as JSON")
    .option("--max <n>", "Maximum elements to traverse", parseInt, 500)
    .option(
      "--local-storage <key=value>",
      "Seed localStorage before the page loads (e.g. an auth token an SPA " +
        "reads on boot). Repeatable.",
      collectKeyValue,
      [],
    )
    .option(
      "--device <name>",
      `Emulate a device: ${DEVICE_NAMES.join(" | ")}. Sets the user agent, ` +
        "viewport and touch emulation, so markup gated on any of them is " +
        "rendered. Without this, a mobile-only defect is invisible and the " +
        "traversal looks clean.",
    )
    .option(
      "--user-agent <ua>",
      "Exact user agent string to send. Overrides --device's user agent, " +
        "keeping its viewport.",
    )
    .action(async (url, opts) => {
      // Fail before launching a browser if --device is misspelled.
      const deviceOpts = resolveDeviceOptions(opts);
      await startDaemon();
      const browser = await connectBrowser();
      const bridge = await createBridge(browser, {
        localStorage: opts.localStorage,
        device: opts.device,
        userAgent: opts.userAgent,
      });

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
            if (
              lower.includes("heading,") ||
              lower.match(/heading.*level \d/)
            ) {
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
            // A traversal is only meaningful against the conditions it ran
            // under; without these a false clean looks identical to a real one.
            device: opts.device || "default",
            userAgent: deviceOpts.userAgent,
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
            console.log(`Device: ${opts.device || "default"}`);
            console.log(`User agent: ${deviceOpts.userAgent}`);
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
