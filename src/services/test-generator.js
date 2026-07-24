export function generateTests(scanResults, options = {}) {
  const { framework = "playwright", output } = options;
  if (framework === "vitest") {
    return generateVitestTests(scanResults);
  }
  return generatePlaywrightTests(scanResults);
}

function generatePlaywrightTests(results) {
  const tests = [];
  const seen = new Set();

  for (const v of results.violations) {
    const key = v.id;
    if (seen.has(key)) continue;
    seen.add(key);

    // Cases match the axe-core rule IDs emitted by the scanner
    // (detection is axe-only — see scanner.js mapAxeFinding).
    switch (v.id) {
      case "heading-order":
        tests.push(`  test('heading hierarchy has no skips', async ({ page }) => {
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').all();
    const levels = [];
    for (const h of headings) {
      const tag = await h.evaluate(el => el.tagName);
      levels.push(parseInt(tag[1]));
    }
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i - 1], \`Heading skip at index \${i}: h\${levels[i-1]} to h\${levels[i]}\`).toBeLessThanOrEqual(1);
    }
  });`);
        break;

      case "image-alt":
        tests.push(`  test('all images have alt text', async ({ page }) => {
    const images = await page.locator('img').all();
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      const src = await img.getAttribute('src');
      expect(alt, \`Image \${src} missing alt attribute\`).not.toBeNull();
    }
  });`);
        break;

      case "button-name":
      case "input-button-name":
        if (seen.has("button-name") && seen.has("input-button-name")) break;
        seen.add("button-name");
        seen.add("input-button-name");
        tests.push(`  test('all buttons have accessible names', async ({ page }) => {
    const buttons = await page.locator('button, [role="button"]').all();
    for (const btn of buttons) {
      const name = await btn.evaluate(el => el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('title'));
      const html = await btn.evaluate(el => el.outerHTML.slice(0, 100));
      expect(name, \`Button has no accessible name: \${html}\`).toBeTruthy();
    }
  });`);
        break;

      case "link-name":
        tests.push(`  test('all links have accessible names', async ({ page }) => {
    const links = await page.locator('a[href]').all();
    for (const link of links) {
      const name = await link.evaluate(el => el.getAttribute('aria-label') || el.textContent.trim() || el.getAttribute('title'));
      const href = await link.getAttribute('href');
      expect(name, \`Link has no accessible name: \${href}\`).toBeTruthy();
    }
  });`);
        break;

      case "label":
      case "select-name":
        tests.push(`  test('all form inputs have labels', async ({ page }) => {
    const inputs = await page.locator('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea').all();
    for (const input of inputs) {
      const name = await input.evaluate(el => {
        const label = document.querySelector(\`label[for="\${el.id}"]\`);
        return el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (label && label.textContent.trim()) || '';
      });
      const id = await input.getAttribute('id');
      expect(name, \`Input \${id || 'unknown'} has no label\`).toBeTruthy();
    }
  });`);
        break;

      case "landmark-one-main":
        tests.push(`  test('page has a main landmark', async ({ page }) => {
    const main = page.locator('main, [role="main"]');
    await expect(main).toHaveCount(1);
  });`);
        break;

      case "aria-hidden-focus":
        tests.push(`  test('no focusable elements inside aria-hidden', async ({ page }) => {
    const hidden = await page.locator('[aria-hidden="true"]').all();
    for (const el of hidden) {
      const focusable = await el.locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').count();
      expect(focusable, 'aria-hidden element contains focusable content').toBe(0);
    }
  });`);
        break;

      case "html-has-lang":
      case "html-lang-valid":
        if (seen.has("html-has-lang") && seen.has("html-lang-valid")) break;
        seen.add("html-has-lang");
        seen.add("html-lang-valid");
        tests.push(`  test('html element has a valid lang attribute', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang, 'html element missing lang attribute').toBeTruthy();
  });`);
        break;

      case "document-title":
        tests.push(`  test('page has a non-empty title', async ({ page }) => {
    await expect(page).toHaveTitle(/\\S/);
  });`);
        break;

      default:
        // axe-core findings — generic assertion (one per unique id)
        tests.push(`  // ${v.message} (${v.id})
  test('${escQuote(v.message)}', async ({ page }) => {
    // Suggestion: ${escQuote(v.suggestion || "See axe-core docs")}
    // TODO: Add specific assertion for this violation
  });`);
        break;
    }
  }

  if (tests.length === 0) return null;

  const urlPath = new URL(results.url).pathname;
  return `// Accessibility regression tests
// Generated by screen-reader-cli from scan of ${results.url}
// ${new Date().toISOString()}

import { test, expect } from '@playwright/test';

test.describe('Accessibility: ${escQuote(urlPath)}', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('${results.url}');
  });

${tests.join("\n\n")}
});
`;
}

function generateVitestTests(results) {
  const tests = [];
  const seen = new Set();

  for (const v of results.violations) {
    const key = v.id;
    if (seen.has(key)) continue;
    seen.add(key);

    tests.push(`  // ${v.message} (${v.id})
  // Suggestion: ${v.suggestion || ""}
  test.todo('${escQuote(v.message)}');`);
  }

  if (tests.length === 0) return null;

  return `// Accessibility regression tests (Vitest)
// Generated by screen-reader-cli from scan of ${results.url}
// ${new Date().toISOString()}
//
// TODO: Import your component and render it with @testing-library/react
// import { render, screen } from '@testing-library/react';
// import { expect, test, describe } from 'vitest';

import { expect, test, describe } from 'vitest';

describe('Accessibility: ${escQuote(results.title)}', () => {
${tests.join("\n\n")}
});
`;
}

function escQuote(str) {
  return String(str || "").replace(/'/g, "\\'").replace(/\n/g, " ");
}
