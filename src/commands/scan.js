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
import { CHROME_UA, collectKeyValue } from "../util.js";

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
    .action(async (url, opts) => {
      // Validate before launching a browser so a typo fails fast.
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
        context = await chromium.launchPersistentContext(profileDir, {
          headless: false,
          userAgent: CHROME_UA,
        });
      } else {
        browser = await chromium.launch({ headless: true });
        context = await browser.newContext({
          // Some sites (e.g. Cloudflare-protected staging environments) block
          // Playwright's default headless user agent; mimic a real Chrome UA.
          userAgent: CHROME_UA,
        });
      }
      if (opts.localStorage.length) {
        await context.addInitScript((entries) => {
          for (const [key, value] of entries) {
            window.localStorage.setItem(key, value);
          }
        }, opts.localStorage);
      }
      const page = await context.newPage();

      try {
        const target =
          url.startsWith("http") || url.startsWith("file://")
            ? url
            : "file://" + path.resolve(url);
        await page.goto(target, {
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

        const results = await scan(page);

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
          const { screenshot, ...jsonSafe } = results;
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
            const outPath =
              opts.output ||
              "a11y-regression.test.js";
            fs.writeFileSync(outPath, testCode, "utf-8");
            console.log(`\nTest file written: ${outPath}`);
          } else {
            console.log("\nNo violations found — no test file generated.");
          }
        }

        if (opts.failOn) {
          const threshold = SEVERITY_RANK[opts.failOn];
          const failing = results.violations.filter(
            (v) => (SEVERITY_RANK[v.severity] ?? SEVERITY_RANK.moderate) <= threshold,
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
