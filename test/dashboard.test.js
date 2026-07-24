import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createDashboardServer,
  listenWithFallback,
} from "../src/commands/dashboard.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, "fixtures/violations.html");
const CLEAN = path.resolve(__dirname, "fixtures/basic.html");

describe("dashboard server", () => {
  let server;
  let base;

  before(async () => {
    ({ server } = createDashboardServer());
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
  });

  it("serves the dashboard page", async () => {
    const res = await fetch(base + "/");
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes("Scan a page"), "dashboard UI served");
    assert.ok(html.includes("scan-form"), "has the scan form");
  });

  it("scans a page and serves its report", async () => {
    const res = await fetch(base + "/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: FIXTURE }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.id, "scan gets an id");
    assert.ok(data.stats.violationCount > 0, "violations fixture has issues");
    assert.ok(!("html" in data), "report html not inlined in the API response");

    const report = await fetch(`${base}/report/${data.id}`);
    assert.equal(report.status, 200);
    const html = await report.text();
    assert.ok(html.toLowerCase().includes("<html"), "serves full report page");
  });

  it("lists past scans in history", async () => {
    await fetch(base + "/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: CLEAN }),
    });
    const res = await fetch(base + "/api/scans");
    assert.equal(res.status, 200);
    const { scans } = await res.json();
    assert.ok(scans.length >= 2, "history accumulates scans");
    assert.ok(scans[0].when, "entries carry a timestamp");
  });

  it("rejects a missing url with a clear message", async () => {
    const res = await fetch(base + "/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("address"), "message is human-readable");
  });

  it("rejects malformed JSON", async () => {
    const res = await fetch(base + "/api/scan", {
      method: "POST",
      body: "not json at all",
    });
    assert.equal(res.status, 400);
  });

  it("returns a friendly error for an unreachable page", async () => {
    const res = await fetch(base + "/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "/tmp/definitely-not-a-real-file-xyz.html" }),
    });
    assert.equal(res.status, 502);
    const data = await res.json();
    assert.ok(data.error.startsWith("Could not scan"), "explains the failure");
  });

  it("404s for an unknown report id", async () => {
    const res = await fetch(
      base + "/report/00000000-0000-0000-0000-000000000000",
    );
    assert.equal(res.status, 404);
  });

  it("falls back to the next port when the preferred one is busy", async () => {
    const busyPort = server.address().port;
    const { server: second } = createDashboardServer();
    try {
      const boundPort = await listenWithFallback(
        second,
        busyPort,
        "127.0.0.1",
      );
      assert.notEqual(boundPort, busyPort, "picked a different port");
      assert.equal(boundPort, second.address().port, "reports the real port");
      const res = await fetch(`http://127.0.0.1:${boundPort}/`);
      assert.equal(res.status, 200, "fallback server actually serves");
    } finally {
      second.close();
    }
  });
});
