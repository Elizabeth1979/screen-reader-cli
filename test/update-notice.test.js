import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isNewer, shouldCheck, renderNotice } from "../src/update-notice.js";

// The risk in an update notice is not the message — it is speaking when it
// should stay quiet. A line printed into piped output corrupts --json results
// and pollutes CI logs, and a slow check delays every single command.

describe("isNewer", () => {
  it("detects a newer patch, minor and major", () => {
    assert.equal(isNewer("0.4.0", "0.4.1"), true);
    assert.equal(isNewer("0.4.0", "0.5.0"), true);
    assert.equal(isNewer("0.4.0", "1.0.0"), true);
  });

  it("is false for same or older", () => {
    assert.equal(isNewer("0.4.0", "0.4.0"), false);
    assert.equal(isNewer("0.4.0", "0.3.9"), false);
    assert.equal(isNewer("1.0.0", "0.9.9"), false);
  });

  it("compares numerically, not as text", () => {
    // "10" sorts before "9" as a string — the classic version-compare bug.
    assert.equal(isNewer("0.9.0", "0.10.0"), true);
    assert.equal(isNewer("0.10.0", "0.9.0"), false);
  });

  it("ignores prerelease suffixes rather than throwing", () => {
    assert.equal(isNewer("0.4.0", "0.5.0-beta.1"), true);
    assert.equal(isNewer("0.4.0-rc.1", "0.4.0"), false);
  });

  it("returns false on anything unparseable, so a bad value never nags", () => {
    assert.equal(isNewer("0.4.0", "not-a-version"), false);
    assert.equal(isNewer("", "0.5.0"), false);
    assert.equal(isNewer("0.4.0", undefined), false);
  });
});

describe("shouldCheck — when to stay silent", () => {
  const base = { isTTY: true, env: {}, lastCheck: 0, now: 86_400_000 * 10 };

  it("checks in a real terminal with no reason to stay quiet", () => {
    assert.equal(shouldCheck(base), true);
  });

  it("stays silent when output is not a terminal", () => {
    // This is the Claude Code / pipe / --json case.
    assert.equal(shouldCheck({ ...base, isTTY: false }), false);
  });

  it("stays silent in CI", () => {
    assert.equal(shouldCheck({ ...base, env: { CI: "true" } }), false);
    assert.equal(shouldCheck({ ...base, env: { GITHUB_ACTIONS: "true" } }), false);
  });

  it("honours an explicit opt-out", () => {
    assert.equal(shouldCheck({ ...base, env: { NO_UPDATE_NOTIFIER: "1" } }), false);
  });

  it("does not check again within a day of the last check", () => {
    const now = 86_400_000 * 10;
    assert.equal(shouldCheck({ ...base, now, lastCheck: now - 1000 }), false);
    assert.equal(shouldCheck({ ...base, now, lastCheck: now - 86_400_000 - 1 }), true);
  });
});

describe("renderNotice", () => {
  const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

  it("leads with the version change, before any decoration", () => {
    const first = strip(renderNotice("0.3.0", "0.4.0")).split("\n")[0];
    assert.match(first, /Update available/);
    assert.match(first, /0\.3\.0/);
    assert.match(first, /0\.4\.0/);
  });

  it("gives the exact command to run", () => {
    assert.match(strip(renderNotice("0.3.0", "0.4.0")), /npm install -g screen-reader-cli/);
  });

  it("puts decoration last, so a screen reader hears the point first", () => {
    const lines = strip(renderNotice("0.3.0", "0.4.0")).trim().split("\n");
    assert.match(lines.at(-1), /[▁▃▅▇]/, "the waveform is the final line");
    assert.ok(lines.length <= 3, `keep it short, got ${lines.length} lines`);
  });
});
