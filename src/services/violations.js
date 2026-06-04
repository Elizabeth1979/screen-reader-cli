// Page structure extraction for the scan: heading outline + landmark count.
// Runs in the browser context via page.evaluate().
//
// NOTE: this used to also run ~9 hand-written violation rules (missing alt,
// button/link names, heading-skip, missing-main, hidden-focusable, etc.).
// All were redundant with axe-core's built-in rules, so detection is now
// axe-only and those rules were removed (2026-06-04). What remains is the
// heading outline + landmark count — structure axe does NOT hand back.
// `violations: []` is kept in the return shape so scanner.js's merge stays
// a no-op pass-through for axe findings.

export const VIOLATION_CHECKS = /* js */ `
(function detectPageStructure() {
  const violations = [];

  // --- Heading outline (for the "Heading Structure" report) ---
  const headings = [];
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const rect = h.getBoundingClientRect();
    headings.push({
      level: parseInt(h.tagName[1]),
      text: h.textContent.trim().slice(0, 120),
      selector: cssSelector(h),
      rect: boundingRect(rect),
    });
  });

  return {
    violations,
    headings,
    landmarkCount: document.querySelectorAll('main, nav, header, footer, aside, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]').length,
  };

  // --- Helpers ---
  function cssSelector(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    const parent = el.parentElement;
    if (!parent) return tag;
    const siblings = Array.from(parent.children).filter(function(c) { return c.tagName === el.tagName; });
    if (siblings.length === 1) return cssSelector(parent) + ' > ' + tag;
    const idx = siblings.indexOf(el) + 1;
    return cssSelector(parent) + ' > ' + tag + ':nth-of-type(' + idx + ')';
  }

  function boundingRect(r) {
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }
})()
`;
