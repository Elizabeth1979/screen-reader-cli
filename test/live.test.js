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

function fakeBridge(readerName, phrases, interactPhrase = "entered") {
  const calls = { next: 0, interact: 0 };
  return {
    readerName,
    calls,
    async next() {
      return phrases[calls.next++] ?? null;
    },
    async interact() {
      calls.interact++;
      return interactPhrase;
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

  it("returns the element interact() lands on, so the page's first element is not skipped", async () => {
    // Caught only by a real VoiceOver run: interact() lands the cursor ON the
    // first element inside the web area and announces it, so stepping with
    // next() from there skips it. The page's h1 was missing from every
    // traversal while every unit test passed.
    const { enterWebArea } = await import("../src/commands/live.js");
    const b = fakeBridge(
      "voiceover",
      CHROME_THEN_BOUNDARY,
      "In Test page web content heading level 1 Test page",
    );
    const r = await enterWebArea(b);
    assert.equal(r.entered, true);
    assert.match(
      r.firstPhrase,
      /heading level 1/,
      "the first element inside the web area must be captured, not stepped past",
    );
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

// --- #23: backward traversal ------------------------------------------------
// The bug class this exists for is asymmetry: a focus guard that catches focus
// without direction awareness looks perfect going forward and misbehaves only
// in reverse. The issue describes it as a *wrap* — swiping back out of a dialog
// jumps to the first menu item instead of stopping at the boundary — and a wrap
// is structurally detectable, unlike a phrasing difference.

function directionalBridge(forward, backward) {
  let fi = 0;
  let bi = 0;
  return {
    readerName: "voiceover",
    async next() {
      return forward[fi++] ?? null;
    },
    async previous() {
      return backward[bi++] ?? null;
    },
    async interact() {
      return forward[fi++] ?? null;
    },
  };
}

describe("walkBackward", () => {
  it("stops when it runs out of announcements", async () => {
    const { walkBackward } = await import("../src/commands/live.js");
    const b = directionalBridge([], ["c", "b", "a"]);
    const r = await walkBackward(b, { maxSteps: 50 });
    assert.deepEqual(r.phrases, ["c", "b", "a"]);
    assert.equal(r.wrapped, false);
  });

  it("flags a wrap when an element is revisited", async () => {
    // The real defect: reverse navigation loops instead of stopping at the
    // boundary, so the same element comes round again.
    const { walkBackward } = await import("../src/commands/live.js");
    const b = directionalBridge([], ["c", "b", "a", "c", "b", "a"]);
    const r = await walkBackward(b, { maxSteps: 50 });
    assert.equal(r.wrapped, true, "revisiting an element is a wrap");
    assert.match(r.reason, /repeat/i);
  });

  it("stops when it steps back out of the web area", async () => {
    // Going backward past the top can leave the page and re-enter the browser's
    // own chrome. Those announcements are not the page and must not be logged.
    const { walkBackward } = await import("../src/commands/live.js");
    const b = directionalBridge(
      [],
      ["c", "b", "a", "Test page web content. You are currently on a web content"],
    );
    const r = await walkBackward(b, { maxSteps: 50 });
    assert.deepEqual(r.phrases, ["c", "b", "a"], "browser chrome is not part of the page log");
    assert.match(r.reason, /web area|boundary/i);
  });

  it("respects the step budget", async () => {
    const { walkBackward } = await import("../src/commands/live.js");
    const endless = Array.from({ length: 200 }, (_, i) => `item ${i}`);
    const b = directionalBridge([], endless);
    const r = await walkBackward(b, { maxSteps: 7 });
    assert.equal(r.phrases.length, 7);
  });
});

describe("compareDirections", () => {
  it("reports a clean mirror when the same elements appear both ways", async () => {
    const { compareDirections } = await import("../src/commands/live.js");
    const r = compareDirections(
      ["heading, Title", "list 2 items", "First item", "Second item"],
      ["Second item", "First item", "end of list", "heading, Title"],
    );
    assert.equal(r.onlyBackward.length, 0, "nothing appears only in reverse");
  });

  it("names an element reached only in reverse — the reported bug's signature", async () => {
    const { compareDirections } = await import("../src/commands/live.js");
    const r = compareDirections(
      ["Close button", "Dialog heading"],
      ["Dialog heading", "Close button", "First menu item"],
    );
    assert.deepEqual(r.onlyBackward, ["First menu item"]);
  });

  it("ignores VoiceOver's coaching text, which differs by direction", async () => {
    // "You are currently on…" and "To move between items…" are added by the
    // reader, not the page, and they differ going each way. Comparing raw
    // phrases would report a mismatch on every single element.
    const { compareDirections } = await import("../src/commands/live.js");
    const r = compareDirections(
      ["list 2 items. You are currently on a list, inside of web content."],
      ["list 2 items. To move between items in this list, press Control-Option-Right Arrow."],
    );
    assert.equal(r.onlyForward.length, 0);
    assert.equal(r.onlyBackward.length, 0);
  });
});
