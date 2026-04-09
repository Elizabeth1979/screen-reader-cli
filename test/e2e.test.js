import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");

function run(...args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 60_000,
  }).trim();
}

describe("e2e: real URL", () => {
  const url = "https://example.com";

  it("audits example.com and finds heading", () => {
    const output = run("audit", url, "--json");
    const data = JSON.parse(output);
    assert.ok(data.phrases.length > 3);
    assert.ok(
      data.phrases.some((p) => p.includes("Example Domain")),
      "should find 'Example Domain' heading"
    );
  });

  it("takes a screenshot of example.com", () => {
    const outPath = path.join(os.tmpdir(), "sr-e2e-screenshot.png");
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
    run("screenshot", "--url", url, "--full", "--output", outPath);
    assert.ok(fs.existsSync(outPath));
    assert.ok(fs.statSync(outPath).size > 1000);
    fs.unlinkSync(outPath);
  });

  it("finds a link on example.com", () => {
    const output = run("speak", "find", "Learn more", "--url", url, "--json");
    const data = JSON.parse(output);
    assert.ok(data.found, "should find 'Learn more' link");
  });
});
