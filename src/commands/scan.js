import fs from "node:fs";
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
import { evaluateGate, GATE_SEVERITIES } from "../services/gating.js";

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
      "--fail-on <severity>",
      `Exit non-zero for CI when violations at/above this severity exceed --threshold (${GATE_SEVERITIES.join(", ")})`,
    )
    .option(
      "--threshold <n>",
      "Max allowed violations at/above --fail-on before failing",
      "0",
    )
    .action(async (url, opts) => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
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

        // --open: click to reveal an overlay whose contents axe can't see while closed.
        if (opts.open) {
          let opened = false;
          for (const sel of opts.open
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
          await page.waitForTimeout(parseInt(opts.openWait, 10) || 900);
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
              `a11y-regression.test.${opts.framework === "vitest" ? "js" : "js"}`;
            fs.writeFileSync(outPath, testCode, "utf-8");
            console.log(`\nTest file written: ${outPath}`);
          } else {
            console.log("\nNo violations found — no test file generated.");
          }
        }

        // CI gating: set a non-zero exit code without polluting stdout (so
        // `--json` output stays machine-parseable). Summary goes to stderr.
        if (opts.failOn) {
          if (!GATE_SEVERITIES.includes(opts.failOn)) {
            process.stderr.write(
              `Invalid --fail-on "${opts.failOn}". Use one of: ${GATE_SEVERITIES.join(", ")}.\n`,
            );
            process.exitCode = 2;
            return;
          }
          const threshold = parseInt(opts.threshold, 10) || 0;
          const { count, failed } = evaluateGate(results.stats, {
            failOn: opts.failOn,
            threshold,
          });
          if (failed) {
            process.exitCode = 1;
            process.stderr.write(
              `\n✖ ${count} violation(s) at or above "${opts.failOn}" (threshold ${threshold}) — failing.\n`,
            );
          } else {
            process.stderr.write(
              `\n✓ ${count} violation(s) at or above "${opts.failOn}" (threshold ${threshold}) — passing.\n`,
            );
          }
        }
      } finally {
        await context.close();
        await browser.close();
      }
    });
}

function printTextReport(results) {
  console.log(`\nScreen Reader Scan: ${results.title}`);
  console.log(`URL: ${results.url}`);
  console.log(
    `DOM elements: ${results.stats.domElements} | Headings: ${results.stats.headingCount} | Landmarks: ${results.stats.landmarkCount}`,
  );
  console.log();

  if (results.violations.length === 0) {
    console.log("No screen reader violations found.");
    return;
  }

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
    if (v.element?.selector) console.log(`    Element: ${v.element.selector}`);
    if (v.wcag) console.log(`    WCAG: ${v.wcag}`);
    if (v.suggestion) console.log(`    Fix: ${v.suggestion}`);
    console.log();
  }

  console.log("--- Heading Structure ---");
  for (const h of results.headings) {
    console.log(
      `${"  ".repeat(h.level - 1)}h${h.level}: ${h.text.slice(0, 80)}`,
    );
  }
}
