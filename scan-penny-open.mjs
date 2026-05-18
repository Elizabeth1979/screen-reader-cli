/**
 * scan-penny-open.mjs — open-state axe scan of Penny dropdown components.
 *
 * Reusable: run from ~/screen-reader-cli so playwright + axe-core resolve.
 *   node scan-penny-open.mjs <out.json> [storybook-base]
 *
 * Opens SelectNew / Combobox / Menu / FloatingMenu, runs axe filtered to the
 * dropdown-structure rules, and records each flagged role="option"'s ancestor
 * chain — the proof of whether listbox→option containment is intact.
 *
 * Storybook renders client-side: use waitUntil:"domcontentloaded" + a long
 * settle wait (networkidle never fires — HMR keeps sockets open).
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = process.argv[2] || "./penny-aria-verify.json";
const SB = process.argv[3] || "http://localhost:6006/iframe.html";
const AXE = readFileSync(
  new URL("./node_modules/axe-core/axe.min.js", import.meta.url).pathname,
  "utf-8",
);
const RULES = [
  "aria-required-parent",
  "aria-required-children",
  "aria-allowed-attr",
  "aria-hidden-focus",
  "aria-valid-attr-value",
  "nested-interactive",
  "list",
  "listitem",
];

const TARGETS = [
  {
    label: "SelectNew",
    id: "selection-inputs-components-select-new--main",
    open: '[data-testid="select"]',
  },
  {
    label: "Combobox",
    id: "selection-inputs-components-combobox-new--main",
    open: '[data-testid="combobox"] input,[data-testid="combobox"],[role="combobox"]',
  },
  {
    label: "FloatingMenu",
    id: "containers-menus-floating-menu-floating-menu-new--main",
    open: "#storybook-root button,[aria-haspopup]",
  },
];

const chainOf = `(() => {
  const out = [];
  const opts = [...document.querySelectorAll('[role="option"],[role="menuitem"],[role="menuitemradio"],[role="menuitemcheckbox"]')];
  for (const o of opts.slice(0, 2)) {
    const c = []; let n = o;
    while (n && n !== document.body) {
      c.push(n.tagName.toLowerCase()
        + (n.getAttribute('role') ? '[role=' + n.getAttribute('role') + ']' : '')
        + (n.getAttribute('data-component') ? '{' + n.getAttribute('data-component') + '}' : ''));
      n = n.parentElement;
    }
    out.push({ role: o.getAttribute('role'), id: o.id || null, chain: c });
  }
  return out;
})()`;

const results = [];
for (const t of TARGETS) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const url = `${SB}?id=${t.id}&viewMode=story`;
  const rec = { label: t.label, id: t.id, url };
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);
    let opened = false;
    for (const sel of t.open.split(",").map((s) => s.trim())) {
      const loc = page.locator(sel).first();
      if ((await loc.count()) > 0) {
        await loc.click({ timeout: 4000 }).catch(() => {});
        opened = true;
        break;
      }
    }
    await page.waitForTimeout(1500);
    rec.opened = opened;
    rec.optionCount = await page
      .locator('[role="option"],[role="menuitem"]')
      .count();
    rec.listboxCount = await page
      .locator('[role="listbox"],[role="menu"]')
      .count();
    await page.evaluate(AXE);
    const res = await page.evaluate(
      async (rules) => await window.axe.run(document, { runOnly: rules }),
      RULES,
    );
    rec.violations = res.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodeCount: v.nodes.length,
      failureSummary: v.nodes[0].failureSummary.replace(/\n/g, " "),
      sampleTarget: v.nodes[0].target,
      sampleHtml: v.nodes[0].html.slice(0, 200),
    }));
    rec.ancestorChains = await page.evaluate(chainOf);
  } catch (e) {
    rec.error = String(e).slice(0, 300);
  } finally {
    await browser.close();
  }
  results.push(rec);
  console.log(
    `${t.label}: opened=${rec.opened} options=${rec.optionCount} listbox=${rec.listboxCount} ` +
      `→ ${(rec.violations || []).map((v) => `${v.id}(${v.nodeCount} ${v.impact})`).join(", ") || "none"}` +
      (rec.error ? ` ERROR ${rec.error}` : ""),
  );
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      scannedAt: new Date().toISOString(),
      storybook: SB,
      rulesScanned: RULES,
      results,
    },
    null,
    2,
  ),
);
console.log("\nWrote " + OUT);
