import path from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { createLiveBridge, detectReader } from "../live-bridge.js";

function readerOption(cmd) {
  return cmd.option(
    "--reader <name>",
    "Screen reader to use: voiceover or nvda (auto-detects OS by default)"
  );
}

// VoiceOver treats a web page as a sealed container. Stepping forward walks the
// browser's own chrome and then stops at the web-area boundary, where it
// announces "to enter the web area, press Control-Option-Shift-Down Arrow" —
// and says it literally, because forward movement alone will not descend. Every
// traversal therefore read Chrome's toolbar, stalled on that boundary, and the
// repeat-detector bailed once the same line came back three times. Zero page
// content, in both `read` and `test` (#11).
//
// `interact()` sends that command. NVDA has no equivalent boundary, so this is
// VoiceOver-only and a no-op elsewhere.
const WEB_AREA = /\bweb (?:content|area)\b|\bhtml content\b/i;

/**
 * Walk to the web-area boundary and step inside it.
 *
 * Returns { entered, skipped, boundary }. `skipped` holds whatever was
 * announced on the way — browser chrome, normally.
 *
 * On failure it hands those phrases back rather than swallowing them, because
 * the two failure modes are opposite: the boundary may be absent because
 * VoiceOver was *already* inside the page, in which case `skipped` is real page
 * content and discarding it would be the bug this function exists to fix.
 * The caller uses it as the start of the traversal instead.
 */
export async function enterWebArea(bridge, { maxProbe = 15 } = {}) {
  if (bridge.readerName !== "voiceover") {
    return { entered: false, skipped: [], reason: "not-voiceover" };
  }
  const skipped = [];
  for (let i = 0; i < maxProbe; i++) {
    const phrase = await bridge.next();
    if (!phrase) break;
    if (WEB_AREA.test(phrase)) {
      await bridge.interact();
      return { entered: true, skipped, boundary: phrase };
    }
    skipped.push(phrase);
  }
  return { entered: false, skipped, reason: "boundary-not-found" };
}

function reportEntry(entry, readerLabel) {
  if (entry.reason === "not-voiceover") return;
  if (entry.entered) {
    if (entry.skipped.length) {
      process.stderr.write(
        `(skipped ${entry.skipped.length} ${readerLabel} browser-UI item(s) before entering the page)\n`,
      );
    }
    return;
  }
  process.stderr.write(
    `\u26a0 Never reached the web-area boundary in ${entry.skipped.length} step(s). ` +
      `Reading from wherever the cursor started — output may include browser UI, ` +
      `or the page may already have been entered.\n`,
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

    const readerLabel = bridge.readerName === "voiceover" ? "VoiceOver" : "NVDA";
    console.log(`${readerLabel} started on: ${target}`);
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

      const readerLabel0 =
        bridge.readerName === "voiceover" ? "VoiceOver" : "NVDA";
      const entry = await enterWebArea(bridge);
      reportEntry(entry, readerLabel0);

      const maxSteps = parseInt(opts.steps, 10);
      // On a failed entry the probe phrases are the start of the traversal, not
      // browser chrome to throw away — see enterWebArea.
      const phrases = entry.entered ? [] : [...entry.skipped];

      for (let i = phrases.length; i < maxSteps; i++) {
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
        const readerLabel = bridge.readerName === "voiceover" ? "VoiceOver" : "NVDA";
        console.log(`\n${readerLabel} reading of: ${target}\n`);
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

      const entry = await enterWebArea(bridge);
      reportEntry(
        entry,
        bridge.readerName === "voiceover" ? "VoiceOver" : "NVDA",
      );

      const phrases = entry.entered ? [] : [...entry.skipped];
      const issues = [];

      // Traverse the page
      for (let i = phrases.length; i < 200; i++) {
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
        const readerLabel = bridge.readerName === "voiceover" ? "VoiceOver" : "NVDA";
        console.log(`\n${readerLabel} Test: ${target}`);
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
