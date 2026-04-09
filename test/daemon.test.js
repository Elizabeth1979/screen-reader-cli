import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { startDaemon, stopDaemon, connectBrowser, STATE_FILE } from "../src/daemon.js";
import fs from "node:fs";

describe("daemon", () => {
  after(async () => {
    await stopDaemon();
  });

  it("starts a browser and writes state file", async () => {
    const info = await startDaemon();
    assert.ok(info.wsEndpoint, "should have wsEndpoint");
    assert.ok(fs.existsSync(STATE_FILE), "state file should exist");

    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    assert.equal(state.wsEndpoint, info.wsEndpoint);
  });

  it("connects to running browser", async () => {
    const browser = await connectBrowser();
    assert.ok(browser, "should return a browser instance");
    assert.ok(browser.isConnected(), "browser should be connected");
  });

  it("stops the daemon and cleans up", async () => {
    await stopDaemon();
    assert.ok(!fs.existsSync(STATE_FILE), "state file should be removed");
  });
});
