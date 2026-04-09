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

describe("page commands", () => {
  it("opens a page and shows info", () => {
    const output = run("page", "open", FIXTURE, "--json");
    const data = JSON.parse(output);
    assert.ok(data.url.includes("basic.html"));
    assert.equal(data.title, "Test Page");
  });
});
