import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { scan } from "../services/scanner.js";
import { generateScanReport } from "../report/scan-report.js";
import { openReport } from "../report/open.js";
import { generateTests } from "../services/test-generator.js";
import {
  analyzeWithAI,
  resolveProviderAndModel,
} from "../services/ai-analyzer.js";
import {
  collectKeyValue,
  collectSelectorValue,
  DEVICE_NAMES,
  resolveDeviceOptions,
  resolveTarget,
} from "../util.js";

// Lower rank = more severe. --fail-on <s> fails when any violation's rank
// is <= the threshold's rank.
const SEVERITY_RANK = { critical: 0, moderate: 1, minor: 2 };

export function scanCommand() {
  return new Command("scan")
    .description(
      "Scan a page for screen reader issues (DOM order + violations + axe-core)",
    )
    .argument("<url>", "URL to scan")
    .option("--json", "Output as JSON")
    .option("--visual", "Open visual HTML report in browser")
    .option("--test", "Generate regression test file")
    .option(
      "--framework <name>",
      "Test framework: playwright (default) or vitest",
      "playwright",
    )
    .option("--output <path>", "Output path for generated test file")
    .option(
      "--ai",
      "Analyze results with AI (requires API key or local Ollama)",
    )
    .option(
      "--provider <name>",
      "AI provider: anthropic, openai, gemini, ollama",
    )
    .option("--model <name>", "AI model (e.g. sonnet, gpt-4o, flash, llama3)")
    .option(
      "--open <selector>",
      "Before scanning, click this selector to open an overlay (dropdown/menu/dialog). " +
        "Many ARIA violations (aria-required-parent, aria-required-children, nested-interactive) " +
        "only surface when the component is open. Comma-separate fallbacks; first match wins.",
    )
    .option(
      "--open-wait <ms>",
      "Milliseconds to wait after --open click before scanning",
      "900",
    )
    .option(
      "--open-target <selector>",
      "After --open, wait until this selector appears before scanning " +
        '(e.g. "[role=dialog]" for a modal, "[role=menu]" for a menu). ' +
        "Falls back to --open-wait on timeout or when omitted.",
    )
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
        "a dismissed banner) read this store, not localStorage. Repeatable.",
      collectKeyValue,
      [],
    )
    .option(
      "--type <selector=text>",
      "After --open, type text into a field. Components that render their " +
        "content only once a query exists (search, autocomplete, filters) are " +
        "otherwise unreachable: the overlay opens empty and scans clean. " +
        "Keys are sent one at a time so per-keystroke handlers fire. " +
        "Repeatable; '=' inside a selector is safe.",
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
      "--settle <ms>",
      "Extra wait after page load, for SPAs with multi-step client-side " +
        "auth redirects that outlast the default 2s render wait.",
    )
    .option(
      "--fail-on <severity>",
      "Exit with code 1 if violations at or above this severity are found: " +
        "critical, moderate, or minor (minor = fail on any violation). " +
        "For CI pipelines.",
    )
    .option(
      "--chrome-profile [path]",
      "Launch using a real Chrome user-data directory instead of a fresh " +
        "browser, so the scan reuses its cookies/login session. Defaults to " +
        "the OS default Chrome profile if no path is given. Chrome must be " +
        "fully quit first — it locks the profile directory while running.",
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
      // Validate before launching a browser so a typo fails fast.
      const deviceOpts = resolveDeviceOptions(opts);
      if (opts.failOn && !(opts.failOn in SEVERITY_RANK)) {
        throw new Error(
          `--fail-on must be one of critical, moderate, minor (got "${opts.failOn}")`,
        );
      }

      let browser = null;
      let context;
      if (opts.chromeProfile !== undefined) {
        const profileDir =
          typeof opts.chromeProfile === "string"
            ? opts.chromeProfile
            : defaultChromeProfileDir();
        // Only the user agent here, deliberately. A persistent context is a
        // real, visible browser window attached to a real profile, so forcing a
        // phone viewport and touch emulation onto it is a surprising side
        // effect — and it cannot be verified in this suite, which is headless.
        context = await chromium.launchPersistentContext(profileDir, {
          headless: false,
          userAgent: deviceOpts.userAgent,
        });
      } else {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
          // Defaults to a real Chrome UA, since some sites (e.g.
          // Cloudflare-protected staging environments) block Playwright's
          // headless default. --device / --user-agent override it.
          ...deviceOpts,
        });
      }
      if (opts.localStorage.length || opts.sessionStorage.length) {
        // One init script for both stores: it runs before any page script, so
        // a component reading either on boot sees the seeded value.
        await context.addInitScript(
          ({ local, session }) => {
            for (const [key, value] of local) {
              window.localStorage.setItem(key, value);
            }
            for (const [key, value] of session) {
              window.sessionStorage.setItem(key, value);
            }
          },
          { local: opts.localStorage, session: opts.sessionStorage },
        );
      }
      const page = await context.newPage();

      try {
        await page.goto(resolveTarget(url), {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        // Wait a bit for JS-rendered content
        await page.waitForTimeout(2000);
        // --settle: extra wait for SPAs with multi-step client-side auth
        // redirects (e.g. token exchange -> navigate) that outlast the
        // fixed 2s above.
        if (opts.settle) {
          await page.waitForTimeout(parseInt(opts.settle, 10));
        }

        // --open: click to reveal an overlay whose contents axe can't see while closed.
        if (opts.open) {
          await openAndSettle(page, opts);
        }

        // --type: send keystrokes into the now-open state. Runs after the open
        // settle so the field exists, and before the scan so what it renders is
        // part of what gets measured.
        if (opts.type.length) {
          await typeIntoFields(page, opts);
        }

        const results = await scan(page);

        // A scan is only meaningful against the conditions it ran under: "no
        // violations found" under a desktop user agent says nothing about the
        // page's phone branch. --chrome-profile applies the user agent only,
        // so say so rather than implying a full device emulation.
        results.device =
          opts.chromeProfile && opts.device
            ? `${opts.device} (user agent only)`
            : opts.device || "default";
        results.userAgent = deviceOpts.userAgent;

        // Run AI analysis first (if requested) so it can be included in reports
        let aiAnalysis = null;
        let aiMeta = null;
        if (opts.ai) {
          const { provider, model } = resolveProviderAndModel(
            opts.provider,
            opts.model,
          );
          aiMeta = { provider, model };
          if (!opts.visual)
            console.log(`\nAnalyzing with ${provider} (${model})...\n`);
          else
            process.stderr.write(`Analyzing with ${provider} (${model})...\n`);
          try {
            aiAnalysis = await analyzeWithAI(results, { provider, model });
          } catch (err) {
            console.error(`AI analysis failed: ${err.message}`);
          }
        }

        if (opts.json) {
          // Keep JSON lean for CI: drop the page screenshot and per-element
          // photos (those exist for the visual report).
          const { screenshot, ...jsonSafe } = results;
          jsonSafe.violations = jsonSafe.violations.map((v) => {
            if (!v.element?.screenshot) return v;
            const { screenshot: _shot, ...element } = v.element;
            return { ...v, element };
          });
          const output = aiAnalysis ? { ...jsonSafe, aiAnalysis } : jsonSafe;
          console.log(JSON.stringify(output, null, 2));
        } else if (opts.visual) {
          const html = generateScanReport(results, { aiAnalysis, aiMeta });
          const filePath = openReport(html);
          console.log(`Report opened: ${filePath}`);
        } else {
          printTextReport(results);
          if (aiAnalysis) {
            console.log("\n--- AI Analysis ---\n");
            if (aiAnalysis.summary) console.log(`  ${aiAnalysis.summary}\n`);
            if (aiAnalysis.score != null)
              console.log(`  Score: ${aiAnalysis.score}/10\n`);
            if (aiAnalysis.fixes?.length) {
              for (const f of aiAnalysis.fixes) {
                const v = results.violations[f.index];
                if (!v) continue;
                console.log(`  [${v.severity}] ${v.message}`);
                if (f.fix) console.log(`    Fix: ${f.fix}`);
                if (f.impact) console.log(`    Impact: ${f.impact}`);
                console.log();
              }
            }
          }
        }

        if (opts.test) {
          const testCode = generateTests(results, {
            framework: opts.framework,
          });
          if (testCode) {
            const outPath = opts.output || "a11y-regression.test.js";
            fs.writeFileSync(outPath, testCode, "utf-8");
            console.log(`\nTest file written: ${outPath}`);
          } else {
            console.log("\nNo violations found — no test file generated.");
          }
        }

        if (opts.failOn) {
          const threshold = SEVERITY_RANK[opts.failOn];
          const failing = results.violations.filter(
            (v) =>
              (SEVERITY_RANK[v.severity] ?? SEVERITY_RANK.moderate) <=
              threshold,
          ).length;
          if (failing > 0) {
            process.stderr.write(
              `\n--fail-on ${opts.failOn}: ${failing} violation(s) at or above "${opts.failOn}" severity.\n`,
            );
            process.exitCode = 1;
          }
        }
      } finally {
        await context.close();
        if (browser) await browser.close();
      }
    });
}

// OS default Chrome user-data directory, used when --chrome-profile is given
// without an explicit path.
function defaultChromeProfileDir() {
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library/Application Support/Google/Chrome/Default");
  }
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"),
      "Google/Chrome/User Data/Default",
    );
  }
  return path.join(home, ".config/google-chrome/Default");
}

function printTextReport(results) {
  console.log(`\nScreen Reader Scan: ${results.title}`);
  console.log(`URL: ${results.url}`);
  console.log(
    `Device: ${results.device ?? "default"} | User agent: ${results.userAgent ?? "(not recorded)"}`,
  );
  const needsReviewCount = results.stats.needsReviewCount ?? 0;
  console.log(
    `DOM elements: ${results.stats.domElements} | Headings: ${results.stats.headingCount} | Landmarks: ${results.stats.landmarkCount} | Needs review: ${needsReviewCount}`,
  );
  console.log();

  if (results.violations.length === 0) {
    console.log("No screen reader violations found.");
  } else {
    console.log(
      `Found ${results.stats.violationCount} issues (${results.stats.critical} critical, ${results.stats.moderate} moderate, ${results.stats.minor} minor)\n`,
    );

    for (const v of results.violations) {
      const sev =
        v.severity === "critical"
          ? "CRITICAL"
          : v.severity === "moderate"
            ? "MODERATE"
            : "MINOR";
      console.log(`  [${sev}] ${v.message}`);
      if (v.element?.selector)
        console.log(`    Element: ${v.element.selector}`);
      if (v.wcag) console.log(`    WCAG: ${v.wcag}`);
      if (v.suggestion) console.log(`    Fix: ${v.suggestion}`);
      console.log();
    }
  }

  // axe "needs review" — flagged even when there are zero hard violations,
  // so a needs-review-only page is never reported as fully clean.
  if (needsReviewCount > 0) {
    console.log(
      `\n--- Needs Review (${needsReviewCount}) — axe could not auto-decide; verify manually ---\n`,
    );
    for (const r of results.needsReview) {
      console.log(`  [REVIEW] ${r.message}`);
      if (r.element?.selector)
        console.log(`    Element: ${r.element.selector}`);
      if (r.wcag) console.log(`    WCAG: ${r.wcag}`);
      console.log();
    }
  }

  console.log("--- Heading Structure ---");
  for (const h of results.headings) {
    console.log(
      `${"  ".repeat(h.level - 1)}h${h.level}: ${h.text.slice(0, 80)}`,
    );
  }
}

// Click the --open selector to reveal an overlay, then settle before scanning.
// Settle = wait for --open-target to appear (portal/overlay safe); fall back to
// the fixed --open-wait on timeout or when no target is given. Exported for tests.
export async function openAndSettle(page, opts) {
  let opened = false;
  for (const sel of (opts.open || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.click({ timeout: 4000 }).catch(() => {});
      opened = true;
      break;
    }
  }
  if (!opened) {
    process.stderr.write(
      `⚠ --open: no element matched "${opts.open}" — scanning closed state\n`,
    );
  }
  if (opts.openTarget) {
    try {
      await page.waitForSelector(opts.openTarget, { timeout: 5000 });
      return;
    } catch {
      process.stderr.write(
        `⚠ --open-target "${opts.openTarget}" not found in 5s — falling back to fixed wait\n`,
      );
    }
  }
  await page.waitForTimeout(parseInt(opts.openWait, 10) || 900);
}

// Type into one or more fields after the overlay has opened, then settle.
//
// pressSequentially, not fill(): fill() sets the value and dispatches a single
// input event, which is enough for a synchronous handler but misses components
// that branch on keydown/keyup (most command palettes and comboboxes do). Keys
// are sent one at a time so those handlers run, same as a person typing.
//
// A selector that matches nothing warns and continues rather than throwing —
// the same contract as --open, so a stale selector degrades to a weaker scan
// instead of no scan at all. Exported for tests.
export async function typeIntoFields(page, opts) {
  for (const [selector, text] of opts.type) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) {
      process.stderr.write(
        `⚠ --type: no element matched "${selector}" — skipping\n`,
      );
      continue;
    }
    try {
      await loc.click({ timeout: 4000 });
      await loc.fill("");
      await loc.pressSequentially(text, { delay: 20, timeout: 10000 });
    } catch (err) {
      process.stderr.write(
        `⚠ --type: could not type into "${selector}" (${err.message}) — skipping\n`,
      );
    }
  }
  await page.waitForTimeout(parseInt(opts.typeWait, 10) || 600);
}
