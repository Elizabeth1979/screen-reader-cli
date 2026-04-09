import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");
const FIXTURE = `file://${path.resolve(__dirname, "fixtures/basic.html")}`;

function run(...args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

describe("audit command", () => {
  it("produces a full traversal log", () => {
    const output = run("audit", FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(Array.isArray(data.phrases), "should have phrases array");
    assert.ok(data.phrases.length > 5, `should have many phrases, got ${data.phrases.length}`);
    assert.ok(data.phrases.some((p) => p.includes("Welcome")), "should contain heading text");
  });

  it("produces a summary with heading structure", () => {
    const output = run("audit", FIXTURE, "--summary", "--json");
    const data = JSON.parse(output);
    assert.ok(data.headings, "should have headings");
    assert.ok(data.headings.length >= 2, "should find at least 2 headings");
    assert.ok(data.landmarks, "should have landmarks");
  });
});
