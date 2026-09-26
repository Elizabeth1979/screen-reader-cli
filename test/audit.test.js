import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

// --- summary matched role words anywhere in a phrase -------------------------
// "Merge into main" produced a second main landmark and "share the link" a
// link, because the summary searched the whole phrase instead of its role.

const WORDS_FIXTURE = `file://${path.resolve(__dirname, "fixtures/landmark-words.html")}`;

describe("audit — summary counts roles, not words in text", () => {
  it("does not count the words 'main' or 'link' in text", () => {
    const data = JSON.parse(run("audit", WORDS_FIXTURE, "--summary", "--json"));
    assert.deepEqual(data.landmarks, ["main"]);
    assert.equal(data.summary.linkCount, 1, data.links.join(" | "));
    assert.equal(data.summary.headingCount, 1);
  });
});

// --- audit took only URLs; scan already took a plain file path ---------------

describe("audit — plain file path", () => {
  it("accepts a relative path like scan does", () => {
    const relative = path.relative(process.cwd(), path.resolve(__dirname, "fixtures/basic.html"));
    const data = JSON.parse(run("audit", relative, "--json", "--max", "5"));
    assert.equal(data.total, 5);
  });
});

// --- --record: watch the screen reader instead of reading its transcript ----

describe("audit --record", () => {
  it("writes a video and announces exactly what an unrecorded run does", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-record-test-"));
    const video = path.join(dir, "run.webm");
    try {
      const plain = JSON.parse(run("audit", FIXTURE, "--json", "--max", "8"));
      const recorded = JSON.parse(
        run("audit", FIXTURE, "--json", "--max", "8", "--record", video),
      );
      assert.deepEqual(recorded.phrases, plain.phrases, "overlay must not be announced");
      assert.ok(fs.statSync(video).size > 10_000, "video should have frames");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
