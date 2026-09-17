// Shared helpers used by multiple commands.

import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Absolute path to a file inside one of our own dependencies.
 *
 * Never build these paths by hand. A hardcoded "../node_modules/<pkg>/..."
 * assumes the dependency sits inside this package's own folder, which is only
 * true for a global install — a package manager is free to hoist it to a
 * shared parent (which npm does when this is installed as a dependency) or to
 * a content-addressed store (pnpm, Yarn PnP). The path then does not exist and
 * the process dies at import time, before any argument parsing, so even
 * `--help` fails with a raw ENOENT.
 *
 * Node's own resolver knows where the file landed in every one of those
 * layouts, so ask it instead of guessing. Passing a package's public entry
 * point ("@guidepup/virtual-screen-reader/browser.js") rather than an internal
 * build path also means a dependency reorganising its own lib/ directory
 * cannot break us.
 */
export function resolveBundledAsset(specifier) {
  return require.resolve(specifier);
}

// Turn a CLI-provided target (URL or local file path) into something
// page.goto accepts.
export function resolveTarget(url) {
  return url.startsWith("http") || url.startsWith("file://")
    ? url
    : "file://" + path.resolve(url);
}

// Some sites (e.g. Cloudflare-protected staging environments) block
// Playwright's default headless user agent; mimic a real Chrome UA.
export const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Device presets for --device. Each sets the user agent, the viewport AND touch
// emulation, because responsive code branches on any of the three — a preset
// that changed only the user agent would still miss breakpoint-gated markup,
// one that changed only the viewport would miss userAgent sniffing, and one
// that left `isMobile` off would miss pointer-type media queries.
export const DEVICE_PRESETS = {
  iphone: {
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  android: {
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    viewport: { width: 412, height: 915 },
    isMobile: true,
  },
  desktop: {
    userAgent: CHROME_UA,
    viewport: { width: 1280, height: 800 },
    isMobile: false,
  },
};

export const DEVICE_NAMES = Object.keys(DEVICE_PRESETS);

/**
 * Works out the browser context options from --device and --user-agent.
 * --user-agent wins over a preset's user agent, so `--device iphone
 * --user-agent "..."` keeps the phone viewport with a custom UA string.
 *
 * Returns { userAgent, viewport?, isMobile? } — always with a userAgent, so
 * callers can pass the result straight into newContext(). With no --device only
 * `userAgent` is set, leaving the caller's own viewport alone.
 */
export function resolveDeviceOptions({ device, userAgent } = {}) {
  if (device && !(device in DEVICE_PRESETS)) {
    throw new Error(
      `--device must be one of ${DEVICE_NAMES.join(", ")} (got "${device}")`,
    );
  }
  const preset = device ? DEVICE_PRESETS[device] : null;
  return {
    userAgent: userAgent || preset?.userAgent || CHROME_UA,
    ...(preset ? { viewport: preset.viewport, isMobile: preset.isMobile } : {}),
  };
}

// Parses "key=value" for a repeatable Commander option, accumulating pairs.
export function collectKeyValue(value, previous) {
  const eq = value.indexOf("=");
  if (eq === -1) {
    throw new Error(`Expected key=value, got "${value}"`);
  }
  previous.push([value.slice(0, eq), value.slice(eq + 1)]);
  return previous;
}

/**
 * Splits a "<selector>=<text>" pair for --type.
 *
 * Cannot reuse collectKeyValue's "first = wins" rule: CSS attribute selectors
 * contain their own equals sign, and they are the common case here
 * ("[role=combobox]=hello"). Splitting on the first one would yield the
 * selector "[role" and never match anything.
 *
 * Splitting on the *last* one instead breaks the opposite way, on typed text
 * that contains an equals sign. So find the first separator that sits outside
 * brackets, parentheses and quotes — the one place a selector cannot put one.
 * Both "[role=combobox]=hello" and "#q=a=b" then split where a reader expects.
 */
export function splitSelectorValue(pair) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < pair.length; i++) {
    const ch = pair[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === "=" && depth === 0) {
      return [pair.slice(0, i), pair.slice(i + 1)];
    }
  }
  throw new Error(`Expected selector=text, got "${pair}"`);
}

// Accumulator for the repeatable --type option.
export function collectSelectorValue(value, previous) {
  previous.push(splitSelectorValue(value));
  return previous;
}
