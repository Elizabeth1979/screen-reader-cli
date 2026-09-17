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

// --- #11: VoiceOver never entered the web area --------------------------
// Forward movement alone stops at the web-area boundary; interact() is the
// command that descends. A fake reader lets the decision logic be tested
// without taking the machine over with real VoiceOver.

function fakeBridge(readerName, phrases) {
  const calls = { next: 0, interact: 0 };
  return {
    readerName,
    calls,
    async next() {
      return phrases[calls.next++] ?? null;
    },
    async interact() {
      calls.interact++;
      return "entered";
    },
  };
}

// The real announcements from the issue, in order.
const CHROME_THEN_BOUNDARY = [
  "New Tab description, New tab button. You are currently on a button, inside of a group",
  "Search tabs menu pop up pop up button. You are currently on a pop up button",
  "toolbar item palette. You are currently on a toolbar item palette",
  "Test page web content. You are currently on a web content, inside of a group. To enter the web area, press Control-Option-Shift-Down Arrow.",
];

describe("enterWebArea", () => {
  it("steps inside once it reaches the web-area boundary", async () => {
    const { enterWebArea } = await import("../src/commands/live.js");
    const b = fakeBridge("voiceover", CHROME_THEN_BOUNDARY);
    const r = await enterWebArea(b);
    assert.equal(r.entered, true, "should report entering");
    assert.equal(b.calls.interact, 1, "interact() must be sent exactly once");
    assert.equal(r.skipped.length, 3, "the three browser-UI items are skipped");
  });

  it("does nothing for NVDA, which has no such boundary", async () => {
    const { enterWebArea } = await import("../src/commands/live.js");
    const b = fakeBridge("nvda", CHROME_THEN_BOUNDARY);
    const r = await enterWebArea(b);
    assert.equal(r.reason, "not-voiceover");
    assert.equal(b.calls.next, 0, "must not consume announcements");
    assert.equal(b.calls.interact, 0, "must not send a VoiceOver command");
  });

  it("hands phrases back when no boundary appears, rather than swallowing them", async () => {
    // The dangerous case: VoiceOver was already inside the page, so these are
    // real content. Discarding them would be the very bug being fixed.
    const { enterWebArea } = await import("../src/commands/live.js");
    const pageContent = ["heading level 1, Test page", "list 2 items", "First item"];
    const b = fakeBridge("voiceover", pageContent);
    const r = await enterWebArea(b);
    assert.equal(r.entered, false);
    assert.equal(b.calls.interact, 0, "must not interact when no boundary was found");
    assert.deepEqual(r.skipped, pageContent, "content is returned, not lost");
  });

  it("gives up after the probe budget instead of looping forever", async () => {
    const { enterWebArea } = await import("../src/commands/live.js");
    const endless = Array.from({ length: 100 }, (_, i) => `item ${i}`);
    const b = fakeBridge("voiceover", endless);
    const r = await enterWebArea(b, { maxProbe: 5 });
    assert.equal(r.entered, false);
    assert.equal(b.calls.next, 5, "stops at the budget");
  });
});
