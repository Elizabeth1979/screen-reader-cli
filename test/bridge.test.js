import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startDaemon, stopDaemon, connectBrowser } from "../src/daemon.js";
import { createBridge } from "../src/bridge.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = `file://${path.resolve(__dirname, "fixtures/basic.html")}`;

describe("bridge", () => {
  let browser, bridge;

  before(async () => {
    await startDaemon();
    browser = await connectBrowser();
    bridge = await createBridge(browser);
  });

  after(async () => {
    await bridge.close();
    await browser.close();
    await stopDaemon();
  });

  it("opens a page and starts the screen reader", async () => {
    await bridge.openPage(FIXTURE);
    const info = await bridge.pageInfo();
    assert.ok(info.url.includes("basic.html"), "should be on basic.html");
    assert.equal(info.title, "Test Page");
  });

  it("navigates next and returns spoken phrase", async () => {
    const phrase = await bridge.next();
    assert.ok(phrase.length > 0, "should return a spoken phrase");
  });

  it("returns the spoken phrase log", async () => {
    const log = await bridge.spokenPhraseLog();
    assert.ok(Array.isArray(log), "should be an array");
    assert.ok(log.length > 0, "should have entries");
  });

  it("navigates to next heading", async () => {
    const phrase = await bridge.perform("moveToNextHeading");
    assert.ok(phrase.toLowerCase().includes("heading") || phrase.toLowerCase().includes("welcome"),
      `should speak a heading, got: "${phrase}"`);
  });

  it("gets the last spoken phrase", async () => {
    const phrase = await bridge.lastSpokenPhrase();
    assert.ok(phrase.length > 0, "should have a last spoken phrase");
  });

  it("gets the active node tag name", async () => {
    const tagName = await bridge.activeNodeInfo();
    assert.ok(tagName.tagName, "should have tagName");
  });
});
