// Shared helpers used by multiple commands.

import path from "node:path";

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

// Parses "key=value" for a repeatable Commander option, accumulating pairs.
export function collectKeyValue(value, previous) {
  const eq = value.indexOf("=");
  if (eq === -1) {
    throw new Error(`Expected key=value, got "${value}"`);
  }
  previous.push([value.slice(0, eq), value.slice(eq + 1)]);
  return previous;
}
