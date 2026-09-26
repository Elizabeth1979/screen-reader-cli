import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { startDaemon, connectBrowser, stopDaemon } from "../daemon.js";
import { createBridge } from "../bridge.js";
import {
  collectKeyValue,
  collectSelectorValue,
  DEVICE_NAMES,
  resolveDeviceOptions,
  toInt,
} from "../util.js";
import { openAndSettle, typeIntoFields } from "../page-state.js";
import { attachOverlay, recordVideoOptions, showStep } from "../recorder.js";

// The screen reader announces the role first ("link, Home"), so match it there.
// Matching anywhere counted the text "Knowledge link" as a link and
// <code>main</code> as a main landmark.
const LANDMARK = /^(navigation|banner|contentinfo|main|complementary|region)\b/;

export function auditCommand() {
  const audit = new Command("audit")
    .description("Full screen reader traversal of a page")
    .argument("<url>", "URL or local file to audit")
    .option("--summary", "Include heading structure and landmark summary")
    .option("--json", "Output as JSON")
    .option("--max <n>", "Maximum elements to traverse", toInt, 500)
    .option(
      "--local-storage <key=value>",
      "Seed localStorage before the page loads (e.g. an auth token an SPA " +
        "reads on boot). Repeatable.",
      collectKeyValue,
      [],
    )
    .option(
      "--session-storage <key=value>",
      "Seed sessionStorage before the page loads. Mirrors --local-storage; " +
        "components that gate content on prior-session data (recent searches, " +
        "a dismissed banner) read this store. Repeatable.",
      collectKeyValue,
      [],
    )
    .option(
      "--open <selector>",
      "Before traversing, click this selector to open an overlay " +
        "(dialog/dropdown/drawer/popover). Without it the traversal of a " +
        "closed component is just its trigger button and 'end of document' — " +
        "the content worth auditing is never reached. Comma-separate " +
        "fallbacks; first match wins.",
    )
    .option(
      "--open-wait <ms>",
      "Milliseconds to wait after the --open click before traversing",
      "900",
    )
    .option(
      "--open-target <selector>",
      "After --open, wait until this selector appears before traversing " +
        '(e.g. "[role=dialog]" for a modal, "[role=menu]" for a menu). ' +
        "Falls back to --open-wait on timeout or when omitted.",
    )
    .option(
      "--type <selector=text>",
      "After --open, type text into a field, for components that render " +
        "their content only once a query exists. Keys are sent one at a time " +
        "so per-keystroke handlers fire. Repeatable; '=' inside a selector " +
        "is safe.",
      collectSelectorValue,
      [],
    )
    .option(
      "--type-wait <ms>",
      "Milliseconds to wait after the last --type keystroke, for components " +
        "that debounce input or fetch results before rendering.",
      "600",
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
    .option(
      "--record <file>",
      "Record a video (.webm) of the traversal: a box around each element " +
        "as it is reached and a caption with what the screen reader says. " +
        "Watch the screen reader work instead of reading its transcript.",
    )
    .action(async (url, opts) => {
      // Fail before launching a browser if --device is misspelled.
      const deviceOpts = resolveDeviceOptions(opts);
      const videoDir = opts.record
        ? fs.mkdtempSync(path.join(os.tmpdir(), "sr-record-"))
        : null;
      await startDaemon();
      const browser = await connectBrowser();
      const bridge = await createBridge(browser, {
        localStorage: opts.localStorage,
        sessionStorage: opts.sessionStorage,
        device: opts.device,
        userAgent: opts.userAgent,
        ...(videoDir
          ? { recordVideo: recordVideoOptions(videoDir, deviceOpts.viewport) }
          : {}),
      });

      try {
        await bridge.openPage(url);

        // Put the component into the state worth traversing. Safe to do after
        // the screen reader has started: it tracks the live DOM, so nodes that
        // appear now are announced like any other.
        if (opts.open) {
          await openAndSettle(bridge.getPage(), opts);
        }
        if (opts.type.length) {
          await typeIntoFields(bridge.getPage(), opts);
        }
        if (videoDir) await attachOverlay(bridge.getPage());

        const phrases = [];
        const headings = [];
        const landmarks = [];
        const links = [];
        const max = opts.max || 500;

        for (let i = 0; i < max; i++) {
          const phrase = await bridge.next();
          phrases.push(phrase);
          if (videoDir) await showStep(bridge.getPage(), i + 1, phrase);

          if (opts.summary) {
            const lower = phrase.toLowerCase();
            if (lower.startsWith("heading,")) headings.push(phrase);
            // Text that is exactly "main" is announced exactly like the
            // landmark, so confirm the screen reader is on an element.
            if (
              LANDMARK.test(lower) &&
              (await bridge.activeNodeInfo()).tagName !== "#text"
            ) {
              landmarks.push(phrase);
            }
            if (lower.startsWith("link,")) links.push(phrase);
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
        const video = videoDir ? bridge.getPage()?.video() : null;
        await bridge.close();
        // The video is only complete once its context is closed.
        if (video) {
          await video.saveAs(path.resolve(opts.record));
          console.error(`Recording saved: ${path.resolve(opts.record)}`);
        }
        await browser.close();
        await stopDaemon();
        if (videoDir) fs.rmSync(videoDir, { recursive: true, force: true });
      }
    });

  return audit;
}
