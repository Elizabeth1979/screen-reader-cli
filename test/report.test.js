import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { generateScanReport } from "../src/report/scan-report.js";
import { scan } from "../src/services/scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fakeResults() {
  const v = (id, severity, selector, extra = {}) => ({
    id,
    message:
      id === "image-alt"
        ? "Images must have alternate text"
        : "Buttons must have discernible text",
    severity,
    wcag: "2aa",
    source: "axe",
    suggestion: "Fix it",
    helpUrl: "https://dequeuniversity.com/rules/axe/4.11/" + id,
    element: { selector, html: `<div id="x">…</div>`, ...extra },
  });
  const violations = [
    v("image-alt", "critical", "#a", { screenshot: "Zm FrZQ==".replace(" ", "") }),
    v("image-alt", "critical", "#b"),
    v("image-alt", "critical", "#c"),
    v("image-alt", "critical", "#d"),
    v("button-name", "critical", "#e"),
  ];
  return {
    url: "https://example.test/",
    title: "Fake Page",
    domOrder: [],
    headings: [],
    violations,
    needsReview: [
      {
        id: "color-contrast",
        message: "Elements must meet minimum color contrast ratio thresholds",
        wcag: "2aa",
        source: "axe-incomplete",
        suggestion: "Check manually",
        element: { selector: "#f", html: "<p>hi</p>" },
      },
    ],
    screenshot: "aGVsbG8=",
    stats: {
      domElements: 5,
      headingCount: 0,
      landmarkCount: 0,
      violationCount: violations.length,
      needsReviewCount: 1,
      critical: 5,
      moderate: 0,
      minor: 0,
    },
  };
}

describe("visual report — grouped issues", () => {
  const html = generateScanReport(fakeResults(), {});

  it("groups repeated rules into one card with an element count", () => {
    const titleCount = (
      html.match(/Images must have alternate text/g) || []
    ).length;
    assert.equal(titleCount, 1, "rule title rendered once, not per element");
    assert.ok(html.includes("4 elements"), "count chip shows element total");
  });

  it("summarizes distinct issues vs affected elements in the header", () => {
    assert.ok(html.includes("2 distinct issues"), "distinct rule count shown");
    assert.ok(html.includes("across 5 elements"), "element total shown");
  });

  it("collapses instances beyond the first three", () => {
    assert.ok(
      html.includes("Show 1 more element"),
      "overflow instances go into a details block",
    );
  });

  it("embeds element screenshots when present", () => {
    assert.ok(
      html.includes("data:image/jpeg;base64,ZmFrZQ=="),
      "element screenshot rendered as data URI",
    );
  });

  it("links to the axe documentation for each rule", () => {
    assert.ok(html.includes("dequeuniversity.com/rules/axe"), "helpUrl kept");
  });

  it("renders a grouped needs-review section", () => {
    assert.ok(html.includes("Needs manual review"), "review section present");
    assert.ok(
      html.includes("minimum color contrast ratio thresholds"),
      "review rule rendered",
    );
  });
});

test("scan captures element screenshots for violations (capped per rule)", async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext().then((c) => c.newPage());
  try {
    const file =
      "file://" + path.resolve(__dirname, "fixtures/violations.html");
    await page.goto(file, { waitUntil: "domcontentloaded" });
    const results = await scan(page);
    const withShots = results.violations.filter(
      (v) => typeof v.element?.screenshot === "string" &&
        v.element.screenshot.length > 50,
    );
    assert.ok(withShots.length > 0, "at least one element photographed");
    for (const [id, count] of Object.entries(
      withShots.reduce((m, v) => ((m[v.id] = (m[v.id] || 0) + 1), m), {}),
    )) {
      assert.ok(count <= 3, `${id} respects the per-rule screenshot cap`);
    }
  } finally {
    await browser.close();
  }
});
