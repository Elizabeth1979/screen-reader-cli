import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIOLATION_CHECKS } from "./violations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AXE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../node_modules/axe-core/axe.min.js"),
  "utf-8",
);

export async function scan(page) {
  // 1. DOM reading order
  const domOrder = await extractDomOrder(page);

  // 2. Page structure (heading outline + landmark count — axe doesn't provide this)
  const custom = await page.evaluate(VIOLATION_CHECKS);

  // 3. axe-core (the sole detection engine)
  const axe = await runAxe(page);

  // 4. Violations — axe only
  const merged = flattenAxeViolations(axe.violations);

  // 4b. axe "needs review" (incomplete) — not pass/fail, requires human judgment
  const needsReview = axe.incomplete.flatMap((rule) =>
    rule.nodes.map((node) =>
      mapAxeFinding(rule, node, { source: "axe-incomplete" }),
    ),
  );

  // 5. Screenshot for visual report
  const screenshot = await page.screenshot({ fullPage: true, type: "png" });

  const pageInfo = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
  }));

  return {
    url: pageInfo.url,
    title: pageInfo.title,
    domOrder,
    headings: custom.headings,
    violations: merged,
    needsReview,
    screenshot: screenshot.toString("base64"),
    stats: {
      domElements: domOrder.length,
      headingCount: custom.headings.length,
      landmarkCount: custom.landmarkCount,
      violationCount: merged.length,
      needsReviewCount: needsReview.length,
      critical: merged.filter((v) => v.severity === "critical").length,
      moderate: merged.filter((v) => v.severity === "moderate").length,
      minor: merged.filter((v) => v.severity === "minor").length,
    },
  };
}

async function extractDomOrder(page) {
  return page.evaluate(() => {
    const order = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          const style = window.getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") {
            return NodeFilter.FILTER_REJECT;
          }
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) {
            return NodeFilter.FILTER_SKIP;
          }
          // Only include elements a screen reader would announce
          const role = node.getAttribute("role") || "";
          const tag = node.tagName.toLowerCase();
          const interactive = [
            "a",
            "button",
            "input",
            "select",
            "textarea",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "img",
            "nav",
            "main",
            "header",
            "footer",
            "aside",
            "section",
            "article",
            "form",
            "table",
            "li",
          ];
          const ariaRoles = [
            "button",
            "link",
            "heading",
            "img",
            "navigation",
            "main",
            "banner",
            "contentinfo",
            "complementary",
            "search",
            "form",
            "region",
            "tab",
            "tabpanel",
            "dialog",
            "alert",
            "status",
            "listbox",
            "option",
            "checkbox",
            "radio",
            "switch",
            "combobox",
            "menu",
            "menuitem",
            "treeitem",
          ];
          if (interactive.includes(tag) || ariaRoles.includes(role)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          // Text nodes with content
          if (
            node.childNodes.length === 1 &&
            node.childNodes[0].nodeType === 3 &&
            node.textContent.trim()
          ) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      },
    );

    let index = 0;
    let node;
    while ((node = walker.nextNode())) {
      const rect = node.getBoundingClientRect();
      const role = node.getAttribute("role") || "";
      const tag = node.tagName.toLowerCase();
      const name =
        node.getAttribute("aria-label") ||
        node.alt ||
        node.textContent.trim().slice(0, 100) ||
        "";
      order.push({
        index: index++,
        tag,
        role: role || undefined,
        name,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }
    return order;
  });
}

async function runAxe(page) {
  await page.evaluate(AXE_SOURCE);
  const raw = await page.evaluate(async () => {
    const opts = {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    };
    const results = await window.axe.run(document, opts);
    const mapNode = (n) => ({
      html: n.html.slice(0, 300),
      target: n.target,
      failureSummary: n.failureSummary,
    });
    const mapRule = (v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: v.nodes.map(mapNode),
    });
    return {
      violations: results.violations.map(mapRule),
      incomplete: results.incomplete.map(mapRule),
    };
  });

  return raw;
}

const SEVERITY_MAP = {
  critical: "critical",
  serious: "critical",
  moderate: "moderate",
  minor: "minor",
};

// Shape one axe rule+node pair into our canonical finding object.
// Shared by the violations path (mergeResults) and the needs-review path,
// so the two tiers can never drift in field shape. `extras` adds tier-specific
// fields (e.g. `source`, `severity`).
function mapAxeFinding(rule, node, extras = {}) {
  return {
    id: rule.id,
    message: rule.help,
    wcag:
      rule.tags.find((t) => t.startsWith("wcag"))?.replace("wcag", "") || "",
    suggestion: node.failureSummary || rule.description,
    element: { selector: node.target?.[0] || "", html: node.html },
    helpUrl: rule.helpUrl,
    ...extras,
  };
}

// Flatten axe violations into our finding shape, sorted critical-first.
// (Detection is axe-only — the former hand-written custom rules were all
// redundant with axe and were removed 2026-06-04.)
function flattenAxeViolations(axeViolations) {
  const merged = [];

  for (const axe of axeViolations) {
    for (const node of axe.nodes) {
      merged.push(
        mapAxeFinding(axe, node, {
          source: "axe",
          severity: SEVERITY_MAP[axe.impact] || "moderate",
        }),
      );
    }
  }

  // Sort by severity: critical first
  const order = { critical: 0, moderate: 1, minor: 2 };
  merged.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  return merged;
}
