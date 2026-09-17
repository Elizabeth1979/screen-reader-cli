// Reach mechanisms: getting a page into the state worth measuring before any
// engine looks at it.
//
// Shared by scan (axe) and audit (virtual screen reader), because "what state
// is the component in" is a question about the page, not about the engine —
// and a flag that exists on only one of them is the bug these were written for
// (issues #22 and #15). Both take a Playwright page, so neither knows or cares
// which command called it.
//
// These live here rather than in util.js: util.js holds small pure helpers,
// while these drive a live page and write warnings to stderr.

// Click the --open selector to reveal an overlay, then settle before scanning.
// Settle = wait for --open-target to appear (portal/overlay safe); fall back to
// the fixed --open-wait on timeout or when no target is given. Exported for tests.
export async function openAndSettle(page, opts) {
  let opened = false;
  for (const sel of (opts.open || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) > 0) {
      await loc.click({ timeout: 4000 }).catch(() => {});
      opened = true;
      break;
    }
  }
  if (!opened) {
    process.stderr.write(
      `⚠ --open: no element matched "${opts.open}" — scanning closed state\n`,
    );
  }
  if (opts.openTarget) {
    try {
      await page.waitForSelector(opts.openTarget, { timeout: 5000 });
      return;
    } catch {
      process.stderr.write(
        `⚠ --open-target "${opts.openTarget}" not found in 5s — falling back to fixed wait\n`,
      );
    }
  }
  await page.waitForTimeout(parseInt(opts.openWait, 10) || 900);
}

// Type into one or more fields after the overlay has opened, then settle.
//
// pressSequentially, not fill(): fill() sets the value and dispatches a single
// input event, which is enough for a synchronous handler but misses components
// that branch on keydown/keyup (most command palettes and comboboxes do). Keys
// are sent one at a time so those handlers run, same as a person typing.
//
// A selector that matches nothing warns and continues rather than throwing —
// the same contract as --open, so a stale selector degrades to a weaker scan
// instead of no scan at all. Exported for tests.
export async function typeIntoFields(page, opts) {
  for (const [selector, text] of opts.type) {
    const loc = page.locator(selector).first();
    if ((await loc.count()) === 0) {
      process.stderr.write(
        `⚠ --type: no element matched "${selector}" — skipping\n`,
      );
      continue;
    }
    try {
      await loc.click({ timeout: 4000 });
      await loc.fill("");
      await loc.pressSequentially(text, { delay: 20, timeout: 10000 });
    } catch (err) {
      process.stderr.write(
        `⚠ --type: could not type into "${selector}" (${err.message}) — skipping\n`,
      );
    }
  }
  await page.waitForTimeout(parseInt(opts.typeWait, 10) || 600);
}
