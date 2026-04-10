import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");
const CLEAN_FIXTURE = `file://${path.resolve(__dirname, "fixtures/basic.html")}`;
const VIOLATIONS_FIXTURE = `file://${path.resolve(__dirname, "fixtures/violations.html")}`;

function run(...args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 60_000,
  }).trim();
}

describe("scan command — text output", () => {
  it("reports no violations on clean page", () => {
    const output = run("scan", CLEAN_FIXTURE);
    assert.ok(output.includes("Screen Reader Scan:"), "should show scan header");
  });

  it("finds violations on bad page", () => {
    const output = run("scan", VIOLATIONS_FIXTURE);
    assert.ok(output.includes("issues"), "should report issues found");
    assert.ok(
      output.includes("CRITICAL") || output.includes("MODERATE") || output.includes("MINOR"),
      "should show severity labels"
    );
  });

  it("detects heading skip", () => {
    const output = run("scan", VIOLATIONS_FIXTURE);
    assert.ok(
      output.toLowerCase().includes("heading"),
      "should flag heading hierarchy issue"
    );
  });

  it("detects missing alt text", () => {
    const output = run("scan", VIOLATIONS_FIXTURE);
    assert.ok(
      output.toLowerCase().includes("alt"),
      "should flag missing alt text"
    );
  });
});

describe("scan command — JSON output", () => {
  it("returns valid JSON with --json", () => {
    const output = run("scan", VIOLATIONS_FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(data.url, "should have url");
    assert.ok(data.title, "should have title");
    assert.ok(Array.isArray(data.violations), "should have violations array");
    assert.ok(Array.isArray(data.domOrder), "should have domOrder array");
    assert.ok(Array.isArray(data.headings), "should have headings array");
    assert.ok(data.stats, "should have stats object");
  });

  it("includes violation details in JSON", () => {
    const output = run("scan", VIOLATIONS_FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(data.violations.length > 0, "should find violations");

    const v = data.violations[0];
    assert.ok(v.id, "violation should have id");
    assert.ok(v.message, "violation should have message");
    assert.ok(v.severity, "violation should have severity");
    assert.ok(v.source, "violation should have source (custom or axe-core)");
  });

  it("returns stats with counts", () => {
    const output = run("scan", VIOLATIONS_FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.equal(typeof data.stats.violationCount, "number");
    assert.equal(typeof data.stats.critical, "number");
    assert.equal(typeof data.stats.moderate, "number");
    assert.equal(typeof data.stats.minor, "number");
    assert.equal(typeof data.stats.domElements, "number");
    assert.equal(typeof data.stats.headingCount, "number");
    assert.equal(typeof data.stats.landmarkCount, "number");
  });

  it("clean page returns zero violations", () => {
    const output = run("scan", CLEAN_FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.equal(data.stats.violationCount, 0, "clean page should have 0 violations");
    assert.equal(data.violations.length, 0);
  });
});

describe("scan command — test generation", () => {
  it("generates Playwright test file with --test", () => {
    const outPath = path.join(os.tmpdir(), "sr-test-a11y.test.js");
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    run("scan", VIOLATIONS_FIXTURE, "--test", "--output", outPath);
    assert.ok(fs.existsSync(outPath), "test file should be created");

    const content = fs.readFileSync(outPath, "utf-8");
    assert.ok(content.includes("@playwright/test"), "should import from playwright");
    assert.ok(content.includes("test("), "should contain test cases");
    assert.ok(content.includes("test.describe("), "should have a describe block");
    assert.ok(content.includes("test.beforeEach"), "should have beforeEach with goto");

    fs.unlinkSync(outPath);
  });

  it("generates Vitest test file with --framework vitest", () => {
    const outPath = path.join(os.tmpdir(), "sr-test-a11y-vitest.test.js");
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    run("scan", VIOLATIONS_FIXTURE, "--test", "--framework", "vitest", "--output", outPath);
    assert.ok(fs.existsSync(outPath), "test file should be created");

    const content = fs.readFileSync(outPath, "utf-8");
    assert.ok(content.includes("vitest"), "should import from vitest");
    assert.ok(content.includes("test.todo("), "should contain todo stubs");

    fs.unlinkSync(outPath);
  });

  it("does not generate test file for clean page", () => {
    const outPath = path.join(os.tmpdir(), "sr-test-clean.test.js");
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    const output = run("scan", CLEAN_FIXTURE, "--test", "--output", outPath);
    assert.ok(!fs.existsSync(outPath), "should not create file when no violations");
    assert.ok(output.includes("No violations"), "should say no violations found");
  });
});

describe("scan command — visual report", () => {
  it("generates HTML report with --visual", () => {
    // We can't easily test that it opens in browser, but we can verify
    // it doesn't crash and produces output mentioning the report
    const output = run("scan", VIOLATIONS_FIXTURE, "--visual");
    assert.ok(output.includes("Report opened:"), "should confirm report was opened");
    assert.ok(output.includes(".html"), "should mention HTML file path");
  });
});

describe("scan command — local file paths", () => {
  it("accepts relative file path without file:// prefix", () => {
    const relativePath = path.relative(
      process.cwd(),
      path.resolve(__dirname, "fixtures/violations.html")
    );
    const output = run("scan", relativePath, "--json");
    const data = JSON.parse(output);
    assert.ok(data.violations.length > 0, "should find violations from relative path");
  });
});
