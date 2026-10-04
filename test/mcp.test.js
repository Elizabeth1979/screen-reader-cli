import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "../src/mcp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");
const VIOLATIONS = path.resolve(__dirname, "fixtures/violations.html");

// Run the server as a client would: one JSON message per line in, one per
// line out. Resolves with every stdout line, parsed.
function session(messages) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI, "mcp"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("mcp server did not finish in time"));
    }, 90_000);
    child.on("close", () => {
      clearTimeout(timer);
      // Every stdout line must be a protocol message: JSON.parse throws if not.
      resolve(out.trim().split("\n").map((l) => JSON.parse(l)));
    });
    for (const m of messages) child.stdin.write(JSON.stringify(m) + "\n");
    child.stdin.end();
  });
}

describe("mcp server", () => {
  it("handshakes, lists tools, scans and reads a page over stdio", async () => {
    const replies = await session([
      { jsonrpc: "2.0", id: 0, method: "server/discover", params: {} },
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18", capabilities: {} },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "scan_page", arguments: { url: VIOLATIONS } },
      },
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "read_page", arguments: { url: VIOLATIONS } },
      },
    ]);
    const byId = Object.fromEntries(replies.map((r) => [r.id, r]));

    // A 2026-07-28 client probes server/discover first; "method not found"
    // is its cue to fall back to initialize.
    assert.equal(byId[0].error.code, -32601);
    assert.equal(byId[1].result.protocolVersion, "2025-06-18");
    assert.deepEqual(
      byId[2].result.tools.map((t) => t.name),
      ["scan_page", "read_page"],
    );

    const scan = byId[3].result;
    assert.equal(scan.isError, false);
    assert.match(scan.content[0].text, /button-name/);
    assert.match(scan.content[0].text, /screen reader says "button"/);

    const read = byId[4].result.content[0].text;
    assert.match(read, /1\. heading, Welcome, level 1/);
    assert.match(read, /end of document/);
  });

  it("reports a page that fails to load as a tool error, not a crash", async () => {
    const [reply] = await session([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "scan_page",
          arguments: { url: path.join(__dirname, "fixtures/missing.html") },
        },
      },
    ]);
    assert.equal(reply.result.isError, true);
    assert.match(reply.result.content[0].text, /^Error: /);
  });
});

describe("mcp handle()", () => {
  const info = { name: "screen-reader-cli", version: "0" };

  it("answers an unknown protocol version with its newest", async () => {
    const r = await handle("initialize", { protocolVersion: "1999-01-01" }, info);
    assert.equal(r.protocolVersion, "2025-11-25");
  });

  it("rejects unknown tools and a missing url as invalid params", async () => {
    await assert.rejects(handle("tools/call", { name: "nope" }), { code: -32602 });
    await assert.rejects(
      handle("tools/call", { name: "scan_page", arguments: {} }),
      { code: -32602 },
    );
  });
});
