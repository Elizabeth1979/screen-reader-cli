// Custom screen-reader-specific violation checks.
// Runs in the browser context via page.evaluate().

export const VIOLATION_CHECKS = /* js */ `
(function detectViolations() {
  const violations = [];

  // --- Headings ---
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

  for (let i = 1; i < headings.length; i++) {
    const gap = headings[i].level - headings[i - 1].level;
    if (gap > 1) {
      violations.push({
        id: 'heading-skip',
        severity: 'moderate',
        message: 'Heading level skipped from h' + headings[i - 1].level + ' to h' + headings[i].level,
        element: headings[i],
        wcag: '1.3.1',
        suggestion: 'Add an h' + (headings[i - 1].level + 1) + ' before this h' + headings[i].level,
      });
    }
  }

  // --- Images without alt ---
  document.querySelectorAll('img').forEach((img) => {
    if (!img.hasAttribute('alt')) {
      violations.push({
        id: 'missing-alt',
        severity: 'critical',
        message: 'Image missing alt attribute',
        element: { selector: cssSelector(img), src: img.src?.slice(0, 200), rect: boundingRect(img.getBoundingClientRect()) },
        wcag: '1.1.1',
        suggestion: 'Add alt text describing the image, or alt="" if decorative',
      });
    }
  });

  // --- Buttons without accessible name ---
  document.querySelectorAll('button, [role="button"]').forEach((btn) => {
    const name = accessibleName(btn);
    if (!name) {
      violations.push({
        id: 'missing-button-name',
        severity: 'critical',
        message: 'Button has no accessible name',
        element: { selector: cssSelector(btn), html: btn.outerHTML.slice(0, 200), rect: boundingRect(btn.getBoundingClientRect()) },
        wcag: '4.1.2',
        suggestion: 'Add text content, aria-label, or aria-labelledby',
      });
    }
  });

  // --- Links without accessible name ---
  document.querySelectorAll('a[href]').forEach((link) => {
    const name = accessibleName(link);
    if (!name) {
      violations.push({
        id: 'missing-link-name',
        severity: 'critical',
        message: 'Link has no accessible name',
        element: { selector: cssSelector(link), href: link.href?.slice(0, 200), rect: boundingRect(link.getBoundingClientRect()) },
        wcag: '4.1.2',
        suggestion: 'Add text content, aria-label, or aria-labelledby',
      });
    }
  });

  // --- Form inputs without labels ---
  document.querySelectorAll('input, select, textarea').forEach((el) => {
    if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
    const name = accessibleName(el);
    if (!name) {
      violations.push({
        id: 'missing-form-label',
        severity: 'critical',
        message: el.tagName.toLowerCase() + '[type=' + (el.type || 'text') + '] missing label',
        element: { selector: cssSelector(el), type: el.type, name: el.name, rect: boundingRect(el.getBoundingClientRect()) },
        wcag: '1.3.1',
        suggestion: 'Add a <label for="..."> or aria-label',
      });
    }
  });

  // --- Missing main landmark ---
  const hasMain = document.querySelector('main, [role="main"]');
  if (!hasMain) {
    violations.push({
      id: 'missing-main-landmark',
      severity: 'moderate',
      message: 'Page has no <main> landmark',
      wcag: '1.3.1',
      suggestion: 'Wrap the primary content in a <main> element',
    });
  }

  // --- aria-hidden on focusable elements ---
  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    const focusable = el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const selfFocusable = el.matches('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (selfFocusable || focusable.length > 0) {
      violations.push({
        id: 'hidden-focusable',
        severity: 'critical',
        message: 'aria-hidden="true" on element that contains focusable content',
        element: { selector: cssSelector(el), html: el.outerHTML.slice(0, 200), rect: boundingRect(el.getBoundingClientRect()) },
        wcag: '4.1.2',
        suggestion: 'Remove aria-hidden or remove focusable elements from within it',
      });
    }
  });

  // --- Icon buttons (buttons containing only SVG/img, no text) ---
  document.querySelectorAll('button, [role="button"]').forEach((btn) => {
    const hasTextChild = btn.textContent.trim().length > 0;
    const hasSvgOrImg = btn.querySelector('svg, img');
    if (!hasTextChild && hasSvgOrImg && !btn.getAttribute('aria-label') && !btn.getAttribute('aria-labelledby')) {
      violations.push({
        id: 'icon-button-no-name',
        severity: 'critical',
        message: 'Icon-only button has no accessible name',
        element: { selector: cssSelector(btn), html: btn.outerHTML.slice(0, 200), rect: boundingRect(btn.getBoundingClientRect()) },
        wcag: '1.1.1',
        suggestion: 'Add aria-label describing the button action',
      });
    }
  });

  // --- Icon links (links containing only SVG/img, no text) ---
  document.querySelectorAll('a[href]').forEach((link) => {
    const hasTextChild = link.textContent.trim().length > 0;
    const hasSvgOrImg = link.querySelector('svg, img');
    if (!hasTextChild && hasSvgOrImg && !link.getAttribute('aria-label') && !link.getAttribute('aria-labelledby')) {
      violations.push({
        id: 'icon-link-no-name',
        severity: 'critical',
        message: 'Icon-only link has no accessible name',
        element: { selector: cssSelector(link), href: link.href?.slice(0, 200), rect: boundingRect(link.getBoundingClientRect()) },
        wcag: '1.1.1',
        suggestion: 'Add aria-label describing the link destination',
      });
    }
  });

  return { violations, headings, landmarkCount: document.querySelectorAll('main, nav, header, footer, aside, [role="banner"], [role="navigation"], [role="main"], [role="complementary"], [role="contentinfo"]').length };

  // --- Helpers ---
  function accessibleName(el) {
    return (
      el.getAttribute('aria-label') ||
      labelledByText(el) ||
      associatedLabelText(el) ||
      el.textContent.trim() ||
      el.getAttribute('title') ||
      ''
    );
  }

  function labelledByText(el) {
    const id = el.getAttribute('aria-labelledby');
    if (!id) return '';
    return id.split(/\\s+/).map(function(refId) {
      const ref = document.getElementById(refId);
      return ref ? ref.textContent.trim() : '';
    }).join(' ').trim();
  }

  function associatedLabelText(el) {
    if (!el.id) return '';
    const label = document.querySelector('label[for="' + el.id + '"]');
    return label ? label.textContent.trim() : '';
  }

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
