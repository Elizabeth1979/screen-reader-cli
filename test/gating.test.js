import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { countAtOrAbove, evaluateGate } from "../src/services/gating.js";

const stats = { critical: 2, moderate: 3, minor: 5 };

describe("gating — countAtOrAbove", () => {
  it("counts only critical at the critical level", () => {
    assert.equal(countAtOrAbove(stats, "critical"), 2);
  });

  it("counts critical + moderate at the moderate level", () => {
    assert.equal(countAtOrAbove(stats, "moderate"), 5);
  });

  it("counts everything at the minor level", () => {
    assert.equal(countAtOrAbove(stats, "minor"), 10);
  });

  it("treats missing buckets as zero", () => {
    assert.equal(countAtOrAbove({ critical: 1 }, "minor"), 1);
  });

  it("throws on an invalid severity", () => {
    assert.throws(() => countAtOrAbove(stats, "blocker"), /Invalid severity/);
  });
});

describe("gating — evaluateGate", () => {
  it("fails when count exceeds threshold", () => {
    assert.deepEqual(evaluateGate(stats, { failOn: "critical", threshold: 0 }), {
      count: 2,
      failed: true,
    });
  });

  it("passes when count is within threshold", () => {
    assert.deepEqual(evaluateGate(stats, { failOn: "critical", threshold: 2 }), {
      count: 2,
      failed: false,
    });
  });

  it("passes a clean page", () => {
    const clean = { critical: 0, moderate: 0, minor: 0 };
    assert.deepEqual(evaluateGate(clean, { failOn: "minor" }), {
      count: 0,
      failed: false,
    });
  });

  it("defaults to failing on any critical", () => {
    assert.equal(evaluateGate(stats).failed, true);
  });
});
