import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIOLATION_CHECKS } from "./violations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AXE_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../node_modules/axe-core/axe.min.js"),
  "utf-8"
);

export async function scan(page) {
  // 1. DOM reading order
  const domOrder = await extractDomOrder(page);

  // 2. Custom violation checks
  const custom = await page.evaluate(VIOLATION_CHECKS);

  // 3. axe-core
  const axeResults = await runAxe(page);

  // 4. Merge — deduplicate overlapping findings
  const merged = mergeResults(custom.violations, axeResults);

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
    screenshot: screenshot.toString("base64"),
    stats: {
      domElements: domOrder.length,
      headingCount: custom.headings.length,
      landmarkCount: custom.landmarkCount,
      violationCount: merged.length,
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
            "a", "button", "input", "select", "textarea",
            "h1", "h2", "h3", "h4", "h5", "h6",
            "img", "nav", "main", "header", "footer", "aside",
            "section", "article", "form", "table", "li",
          ];
          const ariaRoles = [
            "button", "link", "heading", "img", "navigation",
            "main", "banner", "contentinfo", "complementary",
            "search", "form", "region", "tab", "tabpanel",
            "dialog", "alert", "status", "listbox", "option",
            "checkbox", "radio", "switch", "combobox", "menu",
            "menuitem", "treeitem",
          ];
          if (interactive.includes(tag) || ariaRoles.includes(role)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          // Text nodes with content
          if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3 && node.textContent.trim()) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        },
      }
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
    const results = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
      },
    });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodes: v.nodes.map((n) => ({
        html: n.html.slice(0, 300),
        target: n.target,
        failureSummary: n.failureSummary,
      })),
    }));
  });

  return raw;
}

const SEVERITY_MAP = {
  critical: "critical",
  serious: "critical",
  moderate: "moderate",
  minor: "minor",
};

function mergeResults(customViolations, axeViolations) {
  const merged = [];

  // Add all custom violations
  for (const v of customViolations) {
    merged.push({
      source: "custom",
      id: v.id,
      severity: v.severity,
      message: v.message,
      wcag: v.wcag,
      suggestion: v.suggestion,
      element: v.element,
    });
  }

  // Add axe violations, skipping duplicates
  const customIds = new Set(customViolations.map((v) => v.id));
  const AXE_TO_CUSTOM = {
    "heading-order": "heading-skip",
    "image-alt": "missing-alt",
    "button-name": "missing-button-name",
    "link-name": "missing-link-name",
    "label": "missing-form-label",
    "landmark-one-main": "missing-main-landmark",
    "aria-hidden-focus": "hidden-focusable",
  };

  for (const axe of axeViolations) {
    const mappedId = AXE_TO_CUSTOM[axe.id];
    if (mappedId && customIds.has(mappedId)) continue; // already caught by custom check

    for (const node of axe.nodes) {
      merged.push({
        source: "axe",
        id: axe.id,
        severity: SEVERITY_MAP[axe.impact] || "moderate",
        message: axe.help,
        wcag: axe.tags.find((t) => t.startsWith("wcag"))?.replace("wcag", "") || "",
        suggestion: node.failureSummary || axe.description,
        element: {
          selector: node.target?.[0] || "",
          html: node.html,
        },
        helpUrl: axe.helpUrl,
      });
    }
  }

  // Sort by severity: critical first
  const order = { critical: 0, moderate: 1, minor: 2 };
  merged.sort((a, b) => (order[a.severity] ?? 3) - (order[b.severity] ?? 3));

  return merged;
}
