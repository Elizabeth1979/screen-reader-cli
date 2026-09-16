import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHROME_UA,
  DEVICE_PRESETS,
  resolveDeviceOptions,
} from "../src/util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");
const FIXTURE = `file://${path.resolve(__dirname, "fixtures/user-agent.html")}`;

function run(...args) {
  return execFileSync("node", [CLI, ...args], {
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, SR_NO_OPEN: "1" },
  }).trim();
}

describe("resolveDeviceOptions", () => {
  it("defaults to the desktop Chrome UA and sets no viewport", () => {
    const o = resolveDeviceOptions({});
    assert.equal(o.userAgent, CHROME_UA);
    assert.equal(o.viewport, undefined, "should not force a viewport");
  });

  it("a device preset sets both the user agent and the viewport", () => {
    const o = resolveDeviceOptions({ device: "iphone" });
    assert.match(o.userAgent, /iPhone/);
    assert.deepEqual(o.viewport, DEVICE_PRESETS.iphone.viewport);
    assert.equal(o.isMobile, true);
  });

  it("--user-agent overrides the preset's UA but keeps its viewport", () => {
    const o = resolveDeviceOptions({
      device: "iphone",
      userAgent: "Custom/1.0",
    });
    assert.equal(o.userAgent, "Custom/1.0");
    assert.deepEqual(o.viewport, DEVICE_PRESETS.iphone.viewport);
  });

  it("rejects an unknown device by name", () => {
    assert.throws(
      () => resolveDeviceOptions({ device: "tablet" }),
      /--device must be one of/,
    );
  });
});

describe("audit --device / --user-agent", () => {
  // The regression this guards: without a user-agent override, a page whose
  // markup differs on phones is traversed as desktop and reports a clean run,
  // which is indistinguishable from the page genuinely being clean.
  it("misses mobile-only markup by default", () => {
    const out = run("audit", FIXTURE);
    assert.ok(
      out.includes("Always present"),
      "should traverse the shared markup",
    );
    assert.ok(
      !out.includes("Mobile only heading"),
      "desktop default must not render the mobile branch",
    );
  });

  it("finds mobile-only markup with --device iphone", () => {
    const out = run("audit", FIXTURE, "--device", "iphone");
    assert.ok(
      out.includes("Mobile only heading"),
      "the mobile branch should be rendered and traversed",
    );
  });

  it("finds mobile-only markup with an explicit --user-agent", () => {
    const out = run(
      "audit",
      FIXTURE,
      "--user-agent",
      DEVICE_PRESETS.android.userAgent,
    );
    assert.ok(
      out.includes("Mobile only heading"),
      "an explicit UA should work too",
    );
  });

  it("--summary records the conditions the traversal ran under", () => {
    const out = run("audit", FIXTURE, "--device", "iphone", "--summary");
    assert.match(out, /Device: iphone/, "should name the device");
    assert.match(
      out,
      /User agent: .*iPhone/,
      "should print the UA actually sent",
    );
  });

  it("reports an unknown device without launching a browser", () => {
    assert.throws(
      () => run("audit", FIXTURE, "--device", "tablet"),
      /--device must be one of/,
    );
  });
});
