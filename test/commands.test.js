import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");
const FIXTURE = `file://${path.resolve(__dirname, "fixtures/basic.html")}`;

function run(...args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

describe("page commands", () => {
  it("opens a page and shows info", () => {
    const output = run("page", "open", FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(data.url.includes("basic.html"));
    assert.equal(data.title, "Test Page");
  });
});

describe("nav commands", () => {
  it("navigates next and returns spoken phrase", () => {
    const output = run("nav", "next", "--url", FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(data.phrase, "should have a phrase");
    assert.ok(data.phrase.length > 0);
  });

  it("navigates to next heading", () => {
    const output = run("nav", "heading", "--url", FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(
      data.phrase.toLowerCase().includes("heading") || data.phrase.toLowerCase().includes("welcome"),
      `should speak a heading, got: "${data.phrase}"`
    );
  });
});

describe("speak commands", () => {
  it("returns spoken phrase log after traversal", () => {
    const output = run("speak", "log", "--url", FIXTURE, "--steps", "3", "--json");
    const data = JSON.parse(output);
    assert.ok(Array.isArray(data.log));
    assert.ok(data.log.length >= 3, `expected >=3 entries, got ${data.log.length}`);
  });
});

describe("screenshot command", () => {
  it("takes a full page screenshot", () => {
    const outPath = path.join(os.tmpdir(), "sr-test-screenshot.png");
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

    run("screenshot", "--url", FIXTURE, "--full", "--output", outPath);
    assert.ok(fs.existsSync(outPath), "screenshot file should exist");
    const stat = fs.statSync(outPath);
    assert.ok(stat.size > 1000, `screenshot should be >1KB, got ${stat.size}`);
    fs.unlinkSync(outPath);
  });
});
