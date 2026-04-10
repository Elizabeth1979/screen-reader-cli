import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { chromium } from "playwright";
import { scan } from "../services/scanner.js";
import { generateScanReport } from "../report/scan-report.js";
import { openReport } from "../report/open.js";
import { generateTests } from "../services/test-generator.js";
import { analyzeWithAI, resolveProviderAndModel } from "../services/ai-analyzer.js";

export function scanCommand() {
  return new Command("scan")
    .description("Scan a page for screen reader issues (DOM order + violations + axe-core)")
    .argument("<url>", "URL to scan")
    .option("--json", "Output as JSON")
    .option("--visual", "Open visual HTML report in browser")
    .option("--test", "Generate regression test file")
    .option("--framework <name>", "Test framework: playwright (default) or vitest", "playwright")
    .option("--output <path>", "Output path for generated test file")
    .option("--ai", "Analyze results with AI (requires API key or local Ollama)")
    .option("--provider <name>", "AI provider: anthropic, openai, gemini, ollama")
    .option("--model <name>", "AI model (e.g. sonnet, gpt-4o, flash, llama3)")
    .action(async (url, opts) => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        const target = url.startsWith("http") || url.startsWith("file://") ? url : "file://" + path.resolve(url);
        await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
        // Wait a bit for JS-rendered content
        await page.waitForTimeout(2000);

        const results = await scan(page);

        if (opts.json) {
          const { screenshot, ...jsonSafe } = results;
          console.log(JSON.stringify(jsonSafe, null, 2));
        } else if (opts.visual) {
          const html = generateScanReport(results);
          const filePath = openReport(html);
          console.log(`Report opened: ${filePath}`);
        } else {
          printTextReport(results);
        }

        if (opts.ai) {
          const { provider, model } = resolveProviderAndModel(opts.provider, opts.model);
          console.log(`\nAnalyzing with ${provider} (${model})...\n`);
          try {
            const analysis = await analyzeWithAI(results, { provider, model });
            if (opts.json) {
              const { screenshot, ...jsonSafe } = results;
              // Re-output JSON with analysis included
              console.log(JSON.stringify({ ...jsonSafe, aiAnalysis: analysis }, null, 2));
            } else {
              console.log("--- AI Analysis ---\n");
              console.log(analysis);
              console.log();
            }
          } catch (err) {
            console.error(`AI analysis failed: ${err.message}`);
          }
        }

        if (opts.test) {
          const testCode = generateTests(results, { framework: opts.framework });
          if (testCode) {
            const outPath = opts.output || `a11y-regression.test.${opts.framework === "vitest" ? "js" : "js"}`;
            fs.writeFileSync(outPath, testCode, "utf-8");
            console.log(`\nTest file written: ${outPath}`);
          } else {
            console.log("\nNo violations found — no test file generated.");
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
  console.log(`DOM elements: ${results.stats.domElements} | Headings: ${results.stats.headingCount} | Landmarks: ${results.stats.landmarkCount}`);
  console.log();

  if (results.violations.length === 0) {
    console.log("No screen reader violations found.");
    return;
  }

  console.log(`Found ${results.stats.violationCount} issues (${results.stats.critical} critical, ${results.stats.moderate} moderate, ${results.stats.minor} minor)\n`);

  for (const v of results.violations) {
    const sev = v.severity === "critical" ? "CRITICAL" : v.severity === "moderate" ? "MODERATE" : "MINOR";
    console.log(`  [${sev}] ${v.message}`);
    if (v.element?.selector) console.log(`    Element: ${v.element.selector}`);
    if (v.wcag) console.log(`    WCAG: ${v.wcag}`);
    if (v.suggestion) console.log(`    Fix: ${v.suggestion}`);
    console.log();
  }

  console.log("--- Heading Structure ---");
  for (const h of results.headings) {
    console.log(`${"  ".repeat(h.level - 1)}h${h.level}: ${h.text.slice(0, 80)}`);
  }
}
