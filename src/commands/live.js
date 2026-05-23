import path from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { createLiveBridge } from "../live-bridge.js";
import { readerLabel } from "../readers.js";

function readerOption(cmd) {
  return cmd.option(
    "--reader <name>",
    "Screen reader to use: voiceover or nvda (auto-detects OS by default)"
  );
}

export function liveCommand() {
  const live = new Command("live").description(
    "Drive a real screen reader (VoiceOver on Mac, NVDA on Windows)"
  );

  readerOption(
    live
      .command("open")
      .argument("<url>", "URL to open")
      .description("Open a URL and start the screen reader")
  ).action(async (url, opts) => {
    const bridge = await createLiveBridge(opts.reader);
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    const target =
      url.startsWith("http") || url.startsWith("file://")
        ? url
        : "file://" + path.resolve(url);

    await page.goto(target, { waitUntil: "domcontentloaded" });
    await bridge.start();

    console.log(`${readerLabel(bridge.readerName)} started on: ${target}`);
    console.log("Use the other live subcommands (next, previous, log) to navigate.");
    console.log("Press Ctrl+C to stop.\n");

    // Keep alive until user kills the process
    process.on("SIGINT", async () => {
      console.log("\nStopping screen reader...");
      await bridge.stop();
      await browser.close();
      process.exit(0);
    });

    // Block so the browser stays open
    await new Promise(() => {});
  });

  readerOption(
    live
      .command("read")
      .argument("<url>", "URL to read")
      .option("--steps <n>", "Max elements to traverse", "100")
      .option("--json", "Output as JSON")
      .description("Read the full page with a real screen reader and log what is announced")
  ).action(async (url, opts) => {
    const bridge = await createLiveBridge(opts.reader);
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    const target =
      url.startsWith("http") || url.startsWith("file://")
        ? url
        : "file://" + path.resolve(url);

    try {
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      await bridge.start();

      const maxSteps = parseInt(opts.steps, 10);
      const phrases = [];

      for (let i = 0; i < maxSteps; i++) {
        const phrase = await bridge.next();
        if (!phrase) break;
        phrases.push(phrase);

        // Some readers repeat when they hit the end
        if (phrases.length > 2) {
          const last3 = phrases.slice(-3);
          if (last3[0] === last3[1] && last3[1] === last3[2]) break;
        }
      }

      if (opts.json) {
        console.log(JSON.stringify({ url: target, phrases, count: phrases.length }, null, 2));
      } else {
        console.log(`\n${readerLabel(bridge.readerName)} reading of: ${target}\n`);
        phrases.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
        console.log(`\n(${phrases.length} announcements)`);
      }
    } finally {
      await bridge.stop();
      await browser.close();
    }
  });

  readerOption(
    live
      .command("test")
      .argument("<url>", "URL to test")
      .option("--json", "Output as JSON")
      .description("Run screen reader through the page and check for common issues")
  ).action(async (url, opts) => {
    const bridge = await createLiveBridge(opts.reader);
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    const target =
      url.startsWith("http") || url.startsWith("file://")
        ? url
        : "file://" + path.resolve(url);

    try {
      await page.goto(target, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1000);
      await bridge.start();

      const phrases = [];
      const issues = [];

      // Traverse the page
      for (let i = 0; i < 200; i++) {
        const phrase = await bridge.next();
        if (!phrase) break;
        phrases.push(phrase);

        // Detect blank/empty announcements (unlabelled elements)
        if (phrase.trim() === "" || phrase.trim() === "blank") {
          issues.push({
            type: "empty-announcement",
            index: i + 1,
            message: "Screen reader announced blank/empty content — element may be missing an accessible name",
          });
        }

        // Detect repeated phrases that may indicate focus traps
        if (phrases.length > 2) {
          const last3 = phrases.slice(-3);
          if (last3[0] === last3[1] && last3[1] === last3[2]) {
            issues.push({
              type: "possible-loop",
              index: i + 1,
              phrase: phrase,
              message: `Screen reader appears stuck, repeating: "${phrase}"`,
            });
            break;
          }
        }
      }

      // Check heading navigation
      let headingPhrase;
      try {
        headingPhrase = await bridge.perform("moveToNextHeading");
      } catch {
        // Some readers don't support this command or no headings exist
      }

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              url: target,
              reader: bridge.readerName,
              totalAnnouncements: phrases.length,
              issues,
              phrases,
            },
            null,
            2
          )
        );
      } else {
        console.log(`\n${readerLabel(bridge.readerName)} Test: ${target}`);
        console.log(`Announcements: ${phrases.length}`);

        if (issues.length === 0) {
          console.log("\nNo issues detected during screen reader traversal.");
        } else {
          console.log(`\nFound ${issues.length} potential issues:\n`);
          for (const issue of issues) {
            console.log(`  [${issue.type}] ${issue.message}`);
          }
        }

        console.log("\n--- Full Reading Log ---");
        phrases.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
      }
    } finally {
      await bridge.stop();
      await browser.close();
    }
  });

  return live;
}
