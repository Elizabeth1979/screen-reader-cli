import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { attachOverlay } from "../src/recorder.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const CLI = path.join(REPO, "bin/cli.js");

// The strictest policy a page can send: no scripts at all, from anywhere. The
// virtual screen reader must still read such a page — it is loaded as a plain
// script over the DevTools protocol, which the page's policy does not govern,
// the same way @axe-core/playwright loads axe. Imported as an ES module instead,
// it is refused here and the reader never starts.
const STRICT_CSP = "default-src 'none'; script-src 'none'";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head><title>Strict policy</title></head>
<body>
  <main>
    <h1>Locked-down page</h1>
    <p>Nothing on this page may run a script.</p>
    <button><img src="x.png"></button>
  </main>
</body>
</html>`;

// Async, never execFileSync: the server below lives in this process and
// cannot answer while the event loop is blocked waiting for the CLI.
const execFileAsync = promisify(execFile);
async function run(...args) {
  try {
    const { stdout } = await execFileAsync("node", [CLI, ...args], {
      encoding: "utf-8",
      timeout: 60_000,
      env: { ...process.env, SR_NO_OPEN: "1" },
    });
    return stdout.trim();
  } catch (err) {
    // scan exits non-zero when it finds violations; its output is still the
    // report. Anything without output is a real failure.
    if (err.stdout) return err.stdout.trim();
    throw err;
  }
}

describe("a page whose Content-Security-Policy forbids every script", () => {
  let server;
  let url;

  before(async () => {
    server = http.createServer((req, res) => {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": STRICT_CSP,
      });
      res.end(PAGE);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${server.address().port}/`;
  });

  after(() => new Promise((resolve) => server.close(resolve)));

  it("is actually served with that policy", async () => {
    const res = await fetch(url);
    assert.equal(res.headers.get("content-security-policy"), STRICT_CSP);
  });

  it("audit reads the page", async () => {
    const { phrases } = JSON.parse(await run("audit", url, "--json"));
    const log = phrases.join(" | ");
    assert.ok(phrases.includes("main"), log);
    assert.ok(phrases.includes("heading, Locked-down page, level 1"), log);
    assert.ok(phrases.includes("Nothing on this page may run a script."), log);
    assert.ok(phrases.includes("button"), log);
  });

  it("scan attaches what the screen reader says to each finding", async () => {
    const report = JSON.parse(await run("scan", url, "--json"));
    const buttonName = report.violations.find((v) => v.id === "button-name");
    assert.ok(buttonName, "the nameless button should be a finding");
    assert.equal(buttonName.element.announcement, "button");
  });

  it("--record still draws its overlay", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(url);
      await attachOverlay(page);
      const position = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector("#__sr-record [data-caption]"))
            .position,
      );
      assert.equal(position, "fixed", "the caption bar lost its styles");
    } finally {
      await browser.close();
    }
  });
});

// The policy is honoured, not switched off: nothing in the repo may ask
// Playwright to ignore a page's Content-Security-Policy. (Spelled in two
// halves here so this file does not match itself.)
describe("no code switches off a page's Content-Security-Policy", () => {
  it("nothing in the repo uses Playwright's CSP bypass", () => {
    const SKIP = new Set([".git", "node_modules", "dist"]);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(c|m)?js$|\.(html|md|json|ya?ml)$/.test(entry.name)) {
          if (fs.readFileSync(full, "utf-8").includes("bypass" + "CSP")) {
            offenders.push(path.relative(REPO, full));
          }
        }
      }
    };
    walk(REPO);
    assert.deepEqual(offenders, []);
  });
});

// guidepup/virtual-screen-reader#250: from 0.33.0, start() opens a persistent
// user-event session (userEvent.setup) that can break later typing in a React
// input. This tool reads people's real pages, so the version is pinned to
// 0.32.1, and the shipped script is checked for the call itself.
describe("the shipped virtual screen reader script", () => {
  const script = fs.readFileSync(
    path.join(REPO, "dist/guidepup-virtual-screen-reader.js"),
    "utf-8",
  );

  it("is Guidepup's virtual screen reader 0.32.1", () => {
    assert.match(script, /^\/\* @guidepup\/virtual-screen-reader 0\.32\.1,/);
  });

  it("never opens a persistent user-event session", () => {
    assert.doesNotMatch(script, /\.setup\(/);
  });

  it("ships with Guidepup's licence beside it", () => {
    const licence = fs.readFileSync(
      path.join(REPO, "dist/guidepup-virtual-screen-reader.LICENSE"),
      "utf-8",
    );
    assert.match(licence, /MIT License/);
  });
});
