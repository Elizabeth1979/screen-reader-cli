// Builds Guidepup's virtual screen reader as one plain script, for
// src/bridge.js to load into a page. Guidepup publishes its browser build as an
// ES module, and a page's Content-Security-Policy can refuse to import a
// module. A plain script evaluated over the DevTools protocol runs on any page,
// whatever its policy — which is how Deque's official @axe-core/playwright
// loads axe (`page.evaluate(this.script())`).
//
// Runs on `npm install` in a clone and before `npm pack` / `npm publish`
// (the `prepare` script), so the published package ships the built file and
// installing it never needs esbuild.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(REPO, "package.json"));

const entry = require.resolve("@guidepup/virtual-screen-reader/browser.js");
const packageDir = path.dirname(
  require.resolve("@guidepup/virtual-screen-reader/package.json"),
);
const { version } = JSON.parse(
  readFileSync(path.join(packageDir, "package.json"), "utf-8"),
);
const outDir = path.join(REPO, "dist");
const outfile = path.join(outDir, "guidepup-virtual-screen-reader.js");

// Must match VSR_GLOBAL in src/bridge.js.
const GLOBAL_NAME = "__srCliGuidepupVirtualScreenReader";

mkdirSync(outDir, { recursive: true });
await build({
  entryPoints: [entry],
  bundle: true,
  format: "iife",
  // The page sees it as one global, named so no page script uses it.
  globalName: GLOBAL_NAME,
  platform: "browser",
  banner: {
    js: `/* @guidepup/virtual-screen-reader ${version}, MIT License: see guidepup-virtual-screen-reader.LICENSE */`,
  },
  outfile,
  logLevel: "warning",
});
copyFileSync(
  path.join(packageDir, "LICENSE"),
  path.join(outDir, "guidepup-virtual-screen-reader.LICENSE"),
);
