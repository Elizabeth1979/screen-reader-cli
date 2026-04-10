import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");

function run(...args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
}

describe("live command — CLI registration", () => {
  it("shows help for live command", () => {
    const output = run("live", "--help");
    assert.ok(output.includes("Drive a real screen reader"), "should show live description");
    assert.ok(output.includes("open"), "should list open subcommand");
    assert.ok(output.includes("read"), "should list read subcommand");
    assert.ok(output.includes("test"), "should list test subcommand");
  });

  it("shows help for live open subcommand", () => {
    const output = run("live", "open", "--help");
    assert.ok(output.includes("--reader"), "should show reader option");
    assert.ok(output.includes("voiceover"), "should mention voiceover");
    assert.ok(output.includes("nvda"), "should mention nvda");
  });

  it("shows help for live read subcommand", () => {
    const output = run("live", "read", "--help");
    assert.ok(output.includes("--steps"), "should show steps option");
    assert.ok(output.includes("--json"), "should show json option");
    assert.ok(output.includes("--reader"), "should show reader option");
  });

  it("shows help for live test subcommand", () => {
    const output = run("live", "test", "--help");
    assert.ok(output.includes("--json"), "should show json option");
    assert.ok(output.includes("--reader"), "should show reader option");
  });
});

describe("live-bridge module", () => {
  it("exports detectReader and createLiveBridge", async () => {
    const mod = await import("../src/live-bridge.js");
    assert.equal(typeof mod.detectReader, "function");
    assert.equal(typeof mod.createLiveBridge, "function");
  });

  it("detectReader returns voiceover on macOS", async () => {
    const { detectReader } = await import("../src/live-bridge.js");
    if (process.platform === "darwin") {
      assert.equal(detectReader(), "voiceover");
    } else if (process.platform === "win32") {
      assert.equal(detectReader(), "nvda");
    }
    // On other platforms it would throw — that's correct behavior
  });

  it("createLiveBridge rejects unknown reader name", async () => {
    const { createLiveBridge } = await import("../src/live-bridge.js");
    await assert.rejects(
      () => createLiveBridge("jaws"),
      /Unknown screen reader/,
      "should reject unsupported reader"
    );
  });
});
