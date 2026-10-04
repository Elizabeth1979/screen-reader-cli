// MCP server over stdio, so AI coding assistants (Claude Code, Cursor, …) can
// check a page's screen reader experience while they write the code.
//
// Hand-rolled rather than built on the MCP SDK: the stdio transport is
// newline-delimited JSON-RPC and this server needs four methods, while the
// SDK would add 17 dependencies (express, hono, …) to a CLI.
//
// It speaks the `initialize` handshake (protocol 2024-11-05 → 2025-11-25),
// which every client in use supports. Clients of the stateless 2026-07-28
// revision probe with `server/discover` first; that returns "method not
// found", which the spec defines as the signal to fall back to `initialize`.
//
// stdout carries protocol messages only. Anything else written there breaks
// the client, so console.log is pointed at stderr for the whole process.

import readline from "node:readline";
import { chromium } from "playwright";
import { createBridge } from "./bridge.js";
import { scanUrl } from "./services/scanner.js";
import { announcementText, DEVICE_NAMES, groupByRule } from "./util.js";

const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_LISTED = 5;

const TOOLS = [
  {
    name: "scan_page",
    description:
      "Scan a web page or local HTML file for screen reader accessibility " +
      "issues (axe-core, WCAG 2.0–2.2 A/AA). Each issue lists the failing " +
      "elements and what a screen reader actually announces there — e.g. a " +
      'button with no name is read as just "button". Use after changing UI ' +
      "to check the change, before calling it done.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description:
            "http(s) URL (e.g. a local dev server) or a path to an HTML file",
        },
        device: {
          type: "string",
          enum: DEVICE_NAMES,
          description:
            "Emulate a device, for markup that only renders on phones",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "read_page",
    description:
      "Read a page top to bottom with a virtual screen reader and return " +
      "every announcement in order — what a blind user hears. Use to check " +
      "reading order, headings, landmarks and labels by listening, not only " +
      "by rule.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "http(s) URL or a path to an HTML file",
        },
        max: {
          type: "integer",
          minimum: 1,
          maximum: 2000,
          description: "Stop after this many announcements (default 300)",
        },
      },
      required: ["url"],
    },
  },
];

// Compact, model-friendly text: one block per rule, each element next to
// what the screen reader says there.
export function formatScan(results) {
  const lines = [`Page: ${results.title} (${results.url})`];
  const groups = groupByRule(results.violations);
  if (groups.length === 0) {
    lines.push("No accessibility violations found.");
  } else {
    lines.push(
      `${results.violations.length} issues in ${groups.length} rules:`,
      "",
    );
    for (const g of groups) {
      lines.push(
        `[${g.severity}] ${g.message} (${g.id}${g.wcag ? `, WCAG ${g.wcag}` : ""})`,
      );
      for (const v of g.instances.slice(0, MAX_LISTED)) {
        const heard = announcementText(v.element);
        lines.push(
          `  - ${v.element?.selector || "(page)"}${heard ? ` → ${heard}` : ""}`,
        );
        if (v.element?.html) lines.push(`    ${v.element.html.slice(0, 160)}`);
      }
      if (g.instances.length > MAX_LISTED)
        lines.push(`  - +${g.instances.length - MAX_LISTED} more`);
      if (g.helpUrl) lines.push(`  How to fix: ${g.helpUrl}`);
      lines.push("");
    }
  }
  const review = results.needsReview?.length || 0;
  if (review) {
    lines.push(
      `${review} more need a human check (axe could not decide, e.g. contrast over images).`,
    );
  }
  if (results.headings?.length) {
    lines.push("", "Heading outline:");
    for (const h of results.headings)
      lines.push(`${"  ".repeat(h.level - 1)}h${h.level} ${h.text.slice(0, 80)}`);
  }
  return lines.join("\n");
}

async function readPage(url, max = 300) {
  const browser = await chromium.launch({ headless: true });
  try {
    const bridge = await createBridge(browser);
    await bridge.openPage(url);
    const phrases = [];
    for (let i = 0; i < max; i++) {
      const phrase = await bridge.next();
      phrases.push(phrase);
      if (phrase === "end of document") break;
    }
    await bridge.close();
    return phrases.map((p, i) => `${i + 1}. ${p}`).join("\n");
  } finally {
    await browser.close();
  }
}

const RUNNERS = {
  scan_page: async (args) =>
    formatScan(await scanUrl(args.url, { device: args.device })),
  read_page: (args) => readPage(args.url, args.max),
};

// Returns the JSON-RPC result for a request, or throws { code, message }.
export async function handle(method, params = {}, serverInfo) {
  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo,
        instructions:
          "Use scan_page after changing UI to see accessibility issues with " +
          "what a screen reader announces at each one; use read_page to hear " +
          "a whole page in reading order.",
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const run = RUNNERS[params.name];
      if (!run) throw { code: -32602, message: `Unknown tool: ${params.name}` };
      const args = params.arguments || {};
      if (typeof args.url !== "string" || !args.url) {
        throw { code: -32602, message: "url is required" };
      }
      // A failed scan (bad URL, page error) is a tool result the model can
      // read and act on, not a protocol error.
      try {
        return { content: [{ type: "text", text: await run(args) }], isError: false };
      } catch (err) {
        return {
          // First line only: Playwright appends a coloured call log.
          content: [
            {
              type: "text",
              text: `Error: ${String(err?.message || err).split("\n")[0]}`,
            },
          ],
          isError: true,
        };
      }
    }
    default:
      throw { code: -32601, message: `Method not found: ${method}` };
  }
}

export function startMcpServer({ version }) {
  console.log = (...args) => console.error(...args);
  const serverInfo = { name: "screen-reader-cli", version };
  const send = (msg) =>
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

  // One browser at a time: tool calls run in arrival order.
  let queue = Promise.resolve();
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      send({ id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    // Notifications (no id) need no reply; none change what this server does.
    if (msg.id === undefined || msg.id === null) return;
    queue = queue.then(async () => {
      try {
        send({ id: msg.id, result: await handle(msg.method, msg.params, serverInfo) });
      } catch (err) {
        send({
          id: msg.id,
          error: {
            code: err?.code ?? -32603,
            message: err?.message || String(err),
          },
        });
      }
    });
  });
  // Exit once the client closes stdin and in-flight calls have answered.
  rl.on("close", () => queue.then(() => process.exit(0)));
}
