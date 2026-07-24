import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Command } from "commander";
import { chromium } from "playwright";
import { scan } from "../services/scanner.js";
import { generateScanReport } from "../report/scan-report.js";
import { openExternal } from "../report/open.js";
import { CHROME_UA, resolveTarget } from "../util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE = fs.readFileSync(
  path.resolve(__dirname, "../dashboard/index.html"),
  "utf-8",
);

// Keep the newest reports in memory; the dashboard is a local, single-user
// tool, so a small bounded history is enough.
const MAX_REPORTS = 50;

async function runScan(url) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: CHROME_UA });
  const page = await context.newPage();
  try {
    await page.goto(resolveTarget(url), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    // Wait a bit for JS-rendered content, mirroring the scan command
    await page.waitForTimeout(2000);
    return await scan(page);
  } finally {
    await context.close();
    await browser.close();
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// Exported for tests: returns the server plus the report store.
export function createDashboardServer() {
  const reports = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/scans") {
      const list = [...reports.values()]
        .map(({ html, ...meta }) => meta)
        .reverse();
      sendJSON(res, 200, { scans: list });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/scan") {
      let target;
      try {
        const body = JSON.parse((await readBody(req)) || "{}");
        target = typeof body.url === "string" ? body.url.trim() : "";
      } catch {
        sendJSON(res, 400, { error: "Body must be JSON: {\"url\": \"…\"}" });
        return;
      }
      if (!target) {
        sendJSON(res, 400, { error: "Enter a page address to scan." });
        return;
      }
      try {
        const results = await runScan(target);
        const id = randomUUID();
        const html = generateScanReport(results, {});
        reports.set(id, {
          id,
          html,
          url: results.url,
          title: results.title,
          stats: results.stats,
          when: new Date().toISOString(),
        });
        while (reports.size > MAX_REPORTS) {
          reports.delete(reports.keys().next().value);
        }
        const { html: _, ...meta } = reports.get(id);
        sendJSON(res, 200, meta);
      } catch (err) {
        sendJSON(res, 502, {
          error: `Could not scan that page: ${err.message?.split("\n")[0] || err}`,
        });
      }
      return;
    }

    const reportMatch = url.pathname.match(/^\/report\/([0-9a-f-]{36})$/);
    if (req.method === "GET" && reportMatch) {
      const entry = reports.get(reportMatch[1]);
      if (!entry) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Report not found — it may have been evicted from history.");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(entry.html);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  return { server, reports };
}

export function dashboardCommand() {
  return new Command("dashboard")
    .description(
      "Open a local dashboard — run scans from your browser, no terminal needed after launch",
    )
    .option("--port <n>", "Port to listen on", "4747")
    .action((opts) => {
      const { server } = createDashboardServer();
      const port = parseInt(opts.port, 10);
      server.listen(port, "127.0.0.1", () => {
        const address = `http://localhost:${port}`;
        console.log(`Dashboard running at ${address}`);
        console.log("Leave this window open. Press Ctrl+C to stop.");
        if (!process.env.SR_NO_OPEN) {
          try {
            openExternal(address);
          } catch {
            console.log(`Open ${address} in your browser to get started.`);
          }
        }
      });
      server.on("error", (err) => {
        console.error(
          err.code === "EADDRINUSE"
            ? `Port ${port} is busy — try: screenreader dashboard --port ${port + 1}`
            : `Dashboard error: ${err.message}`,
        );
        process.exit(1);
      });
    });
}
