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

// --- #13: audit could not reach an overlay's open state ---------------------
// scan could click a component open before measuring it; audit could not, so a
// traversal of a modal saw the trigger button and "end of document" and never
// the dialog's own content.

const PORTAL_FIXTURE = `file://${path.resolve(__dirname, "fixtures/portal-delayed.html")}`;
const PALETTE_FIXTURE = `file://${path.resolve(__dirname, "fixtures/palette.html")}`;

describe("audit — reaching an overlay's open state", () => {
  it("traverses only the trigger without --open (baseline)", () => {
    const data = JSON.parse(run("audit", PORTAL_FIXTURE, "--json"));
    const log = data.phrases.join(" | ");
    assert.ok(
      !log.includes("Delayed dialog"),
      `baseline should not reach the dialog, got: ${log}`,
    );
  });

  it("traverses the dialog's content with --open and --open-target", () => {
    const data = JSON.parse(
      run(
        "audit",
        PORTAL_FIXTURE,
        "--json",
        "--open",
        "#open",
        "--open-target",
        "[role=dialog]",
      ),
    );
    const log = data.phrases.join(" | ");
    assert.ok(
      log.includes("Delayed dialog"),
      `expected the dialog in the traversal, got: ${log}`,
    );
    assert.ok(
      log.includes("Inside"),
      `expected the dialog's button in the traversal, got: ${log}`,
    );
  });

  it("reaches a typed-input state with --type", () => {
    const data = JSON.parse(
      run(
        "audit",
        PALETTE_FIXTURE,
        "--json",
        "--open",
        "#open",
        "--open-target",
        "[role=dialog]",
        "--type",
        "#q=invoice",
      ),
    );
    const log = data.phrases.join(" | ");
    assert.ok(
      log.includes("option"),
      `expected option rows announced, got: ${log}`,
    );
  });

  it("reaches a sessionStorage-gated state with --session-storage", () => {
    const data = JSON.parse(
      run(
        "audit",
        PALETTE_FIXTURE,
        "--json",
        "--open",
        "#open",
        "--open-target",
        "[role=dialog]",
        "--session-storage",
        'recent=["invoice","vendor"]',
      ),
    );
    const log = data.phrases.join(" | ");
    assert.ok(
      log.includes("option") && log.includes("vendor"),
      `expected seeded option rows announced, got: ${log}`,
    );
  });
});
