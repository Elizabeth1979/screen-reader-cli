import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareToBaseline,
  createBaseline,
  readBaseline,
} from "../src/services/baseline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, "../bin/cli.js");
const VIOLATIONS = path.resolve(__dirname, "fixtures/violations.html");

const finding = (id, selector, html) => ({
  id,
  message: `${id} message`,
  element: { selector, html },
});
const results = (...violations) => ({ url: "https://x.test/", violations });

describe("baseline matching", () => {
  it("an unchanged page has nothing new", () => {
    const before = results(
      finding("image-alt", "img", "<img>"),
      finding("button-name", "button", "<button></button>"),
    );
    const now = results(
      finding("image-alt", "img", "<img>"),
      finding("button-name", "button", "<button></button>"),
    );
    const s = compareToBaseline(now, createBaseline(before));
    assert.deepEqual([s.new, s.known, s.fixed.length], [0, 2, 0]);
  });

  it("keeps a finding known when it moves (selector changes, markup same)", () => {
    const before = results(finding("button-name", "body > button", "<button><svg>"));
    const now = results(
      finding("button-name", "button:nth-child(4)", "<button><svg>"),
    );
    const s = compareToBaseline(now, createBaseline(before));
    assert.equal(s.new, 0);
    assert.equal(now.violations[0].baseline, "known");
  });

  it("keeps a finding known when its markup is edited in place", () => {
    const before = results(finding("label", "#email", '<input id="email">'));
    const now = results(
      finding("label", "#email", '<input id="email" type="email">'),
    );
    assert.equal(compareToBaseline(now, createBaseline(before)).new, 0);
  });

  it("counts: a fourth copy of a known finding is new", () => {
    const img = () => finding("image-alt", "img", "<img>");
    const s = compareToBaseline(
      results(img(), img(), img(), img()),
      createBaseline(results(img(), img(), img())),
    );
    assert.deepEqual([s.new, s.known], [1, 3]);
  });

  it("reports what the baseline had that the page no longer has", () => {
    const s = compareToBaseline(
      results(),
      createBaseline(results(finding("image-alt", "img", "<img>"))),
    );
    assert.equal(s.fixed.length, 1);
    assert.equal(s.fixed[0].id, "image-alt");
  });

  it("writes a stable, sorted file", () => {
    const a = createBaseline(
      results(finding("label", "b", ""), finding("image-alt", "a", "")),
    );
    const b = createBaseline(
      results(finding("image-alt", "a", ""), finding("label", "b", "")),
    );
    assert.deepEqual(a, b);
    assert.deepEqual(
      a.findings.map((f) => f.id),
      ["image-alt", "label"],
    );
  });

  it("refuses a missing or foreign file instead of treating it as empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-baseline-"));
    assert.throws(() => readBaseline(path.join(dir, "none.json")), /not found/);
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, '{"findings": "nope"}');
    assert.throws(() => readBaseline(bad), /unknown format/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("scan --baseline (CLI)", () => {
  const scan = (...args) =>
    spawnSync("node", [CLI, "scan", ...args], {
      encoding: "utf-8",
      timeout: 60_000,
      env: { ...process.env, SR_NO_OPEN: "1" },
    });

  it("gates CI on new findings only", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sr-baseline-"));
    const page = path.join(dir, "page.html");
    const file = path.join(dir, "a11y-baseline.json");
    fs.copyFileSync(VIOLATIONS, page);

    // No baseline yet: fail loudly, never pass by accident.
    assert.notEqual(scan(page, "--baseline", file).status, 0);

    // Accept today's findings; the same page now passes the strictest gate.
    assert.equal(
      scan(page, "--baseline", file, "--update-baseline").status,
      0,
    );
    const same = scan(page, "--baseline", file, "--fail-on", "minor");
    assert.equal(same.status, 0, same.stderr);
    assert.match(same.stdout, /0 new, \d+ known/);

    // Add one nameless button: exactly that fails, even though it shifts the
    // known button's selector.
    fs.writeFileSync(
      page,
      fs
        .readFileSync(VIOLATIONS, "utf-8")
        .replace("</body>", "<button></button>\n</body>"),
    );
    const worse = scan(page, "--baseline", file, "--fail-on", "critical");
    assert.equal(worse.status, 1);
    assert.match(worse.stdout, /1 new,/);
    assert.match(worse.stderr, /1 new violation/);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
