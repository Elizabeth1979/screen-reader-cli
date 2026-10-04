import fs from "node:fs";
import { VIOLATION_CHECKS } from "./violations.js";
import { resolveBundledAsset } from "../util.js";
import { injectVirtualScreenReader } from "../bridge.js";

const AXE_SOURCE = fs.readFileSync(
  resolveBundledAsset("axe-core/axe.min.js"),
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

  // 4c. Photograph failing elements so reports can show the thing, not just
  // its selector. Capped per rule and in total to keep reports light.
  await captureElementShots(page, merged);

  // 4d. What a screen reader user hears at each failing element. Runs last so
  // the screen reader cannot affect what axe or the photos saw.
  await attachAnnouncements(page, merged);

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

// Screenshot the first few elements of each rule (jpeg, small) and attach
// them as `element.screenshot` (base64). Failures are silently skipped — a
// hidden or detached element just doesn't get a picture. Every wait here is
// bounded twice: playwright's own timeout AND a wall-clock race, because a
// wedged screenshot call must never hang the whole scan.
const SHOTS_PER_RULE = 3;
const SHOTS_TOTAL = 30;
const SHOT_HARD_TIMEOUT_MS = 4000;
const SHOTS_TOTAL_BUDGET_MS = 15000;

async function captureElementShots(page, violations) {
  const perRule = new Map();
  let total = 0;
  const deadline = Date.now() + SHOTS_TOTAL_BUDGET_MS;

  for (const v of violations) {
    if (total >= SHOTS_TOTAL || Date.now() > deadline) break;
    const taken = perRule.get(v.id) || 0;
    if (taken >= SHOTS_PER_RULE) continue;
    const selector = v.element?.selector;
    if (!selector) continue;

    try {
      // element.screenshot scrolls the element into view itself.
      const shot = page
        .locator(selector)
        .first()
        .screenshot({ timeout: 2500, type: "jpeg", quality: 60 });
      shot.catch(() => {}); // late rejection after the race must not surface
      const buf = await Promise.race([
        shot,
        new Promise((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("screenshot deadline")),
            SHOT_HARD_TIMEOUT_MS,
          );
          t.unref?.();
        }),
      ]);
      v.element.screenshot = buf.toString("base64");
      perRule.set(v.id, taken + 1);
      total++;
    } catch {
      // Element not visible / gone / selector too exotic — skip its photo.
    }
  }
}

// One forward walk of the page with the Virtual Screen Reader, recording the
// first phrase spoken on or inside each failing element:
//   element.announcement = "button"   what the listener hears there
//     + element.announcedWithin       never reached itself, but an ancestor
//                                     was read as one item ("button" for an
//                                     <img> inside a <button>) — that phrase
//   element.announcement = null       the walk finished and never reached it
//   (absent)                          unknown: page-level target, walk cut
//                                     short, or the screen reader failed
// Bounded twice, like the photos: a step and time budget inside the page,
// and a wall-clock race outside it in case the evaluate itself hangs.
const ANNOUNCE_MAX_STEPS = 2000;
const ANNOUNCE_BUDGET_MS = 15_000;
const ANNOUNCE_HARD_TIMEOUT_MS = 20_000;

async function attachAnnouncements(page, violations) {
  const selectors = [
    ...new Set(violations.map((v) => v.element?.selector).filter(Boolean)),
  ];
  if (selectors.length === 0) return;

  try {
    await injectVirtualScreenReader(page);
    const walk = page.evaluate(
      async ({ selectors, maxSteps, budgetMs }) => {
        // html/body/head contain everything, so "the first phrase inside"
        // would be the page's first phrase — true but meaningless.
        const PAGE_LEVEL = new Set(["HTML", "HEAD", "BODY"]);
        const targets = selectors.map((s) => {
          try {
            const el = document.querySelector(s);
            return el && !PAGE_LEVEL.has(el.tagName) ? el : null;
          } catch {
            return null;
          }
        });
        const heard = {};
        const visited = []; // [element, phrase] per step, for the fallback
        const vsr = window.__vsr;
        const deadline = Date.now() + budgetMs;
        let complete = false;
        await vsr.start({ container: document.body });
        try {
          for (let i = 0; i < maxSteps && Date.now() < deadline; i++) {
            await vsr.next();
            const phrase = await vsr.lastSpokenPhrase();
            if (phrase === "end of document") {
              complete = true;
              break;
            }
            const node = vsr.activeNode;
            const el = node instanceof Element ? node : node?.parentElement;
            if (!el) continue;
            visited.push([el, phrase]);
            targets.forEach((t, idx) => {
              if (t && !(selectors[idx] in heard) && t.contains(el)) {
                heard[selectors[idx]] = phrase;
              }
            });
          }
        } finally {
          await vsr.stop();
        }
        // A target never reached may sit inside something read as one item —
        // an ancestor the walk announced but never stepped into.
        const within = {};
        const skipped = [];
        if (complete) {
          selectors.forEach((s, idx) => {
            const t = targets[idx];
            if (!t || s in heard) return;
            const atomic = visited.find(
              ([a]) =>
                a !== t &&
                a.contains(t) &&
                !visited.some(([b]) => b !== a && a.contains(b)),
            );
            if (atomic) within[s] = atomic[1];
            else skipped.push(s);
          });
        }
        return { heard, within, skipped };
      },
      {
        selectors,
        maxSteps: ANNOUNCE_MAX_STEPS,
        budgetMs: ANNOUNCE_BUDGET_MS,
      },
    );
    walk.catch(() => {}); // late rejection after the race must not surface
    const { heard, within, skipped } = await Promise.race([
      walk,
      new Promise((_, reject) => {
        const t = setTimeout(
          () => reject(new Error("announcement deadline")),
          ANNOUNCE_HARD_TIMEOUT_MS,
        );
        t.unref?.();
      }),
    ]);
    const skippedSet = new Set(skipped);
    for (const v of violations) {
      const sel = v.element?.selector;
      if (!sel) continue;
      if (sel in heard) v.element.announcement = heard[sel];
      else if (sel in within) {
        v.element.announcement = within[sel];
        v.element.announcedWithin = true;
      } else if (skippedSet.has(sel)) v.element.announcement = null;
    }
  } catch {
    // CSP refused the bundle, the walk timed out, or the page navigated
    // away. Findings stand without announcements.
  }
}

async function runAxe(page) {
  await page.evaluate(AXE_SOURCE);
  const raw = await page.evaluate(async () => {
    const opts = {
      runOnly: {
        type: "tag",
        values: [
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22a",
          "wcag22aa",
          "best-practice",
        ],
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

// axe tags a rule with its success criterion ("wcag412") and its level
// ("wcag2a", "wcag21aa"). Turn them into "4.1.2 (A)". Best-practice rules
// carry neither and get "".
export function wcagLabel(tags = []) {
  const sc = tags
    .map((t) => /^wcag(\d)(\d)(\d+)$/.exec(t))
    .find(Boolean);
  if (!sc) return "";
  const level = tags
    .map((t) => /^wcag2\d?(a{1,3})$/.exec(t))
    .find(Boolean);
  const num = `${sc[1]}.${sc[2]}.${sc[3]}`;
  return level ? `${num} (${level[1].toUpperCase()})` : num;
}

// Shape one axe rule+node pair into our canonical finding object.
// Shared by the violations path (mergeResults) and the needs-review path,
// so the two tiers can never drift in field shape. `extras` adds tier-specific
// fields (e.g. `source`, `severity`).
function mapAxeFinding(rule, node, extras = {}) {
  return {
    id: rule.id,
    message: rule.help,
    wcag: wcagLabel(rule.tags),
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
