# screen-reader-cli — project memory

CLI for screen-reader accessibility testing. Three engines behind one
binary (`bin/cli.js`, commander, pure ESM, no build step):

1. **scan** (`src/commands/scan.js` + `src/services/scanner.js`) — Playwright
   headless Chromium + axe-core + structure extraction → text/JSON/HTML
   report, generated tests, AI analysis. Detection is **axe-only**; rule ids
   in reports are axe ids (`image-alt`, `heading-order`, …).
2. **virtual** (`page`/`nav`/`speak`/`audit`/`repl` via `src/bridge.js`) —
   Virtual Screen Reader bundle injected into the page (`bypassCSP: true`
   is required for this).
3. **live** (`src/live-bridge.js`) — Guidepup drives VoiceOver (macOS) /
   NVDA (Windows). Throws on Linux by design.

Plus: **dashboard** (`src/commands/dashboard.js` + `src/dashboard/index.html`)
— localhost web UI over the scan pipeline. `bin/sr.js` (`sr`) opens it by
default; `sr <subcommand>` forwards to the CLI.

## Commands

- `npm test` — full local suite (needs Playwright Chromium; no network).
  `npm run test:e2e` — hits example.com, network required, excluded from CI.
- Tests are Node's built-in runner, real-browser integration style, fixtures
  in `test/fixtures/*.html`. CLI is exercised as a subprocess (see
  `test/scan.test.js` `run()`).
- Verify docs page after editing it: `node bin/cli.js scan docs/index.html
  --fail-on minor` must exit 0 — the site advertises that it passes.

## Releasing

Version bump in package.json → merge → Actions → "Publish to npm" → Run
workflow (or publish a GitHub Release). Needs `NPM_TOKEN` repo secret
(granular npm token, read/write all packages, "Bypass 2FA" checked).
Workflow runs the full suite before publishing.

## Site

`docs/` deploys to https://elizabeth1979.github.io/screen-reader-cli/ via
`pages.yml` on every push to main. Single self-contained HTML file; body
font Atkinson Hyperlegible; must keep passing `--fail-on minor`.

## Conventions & decisions

- No custom rule engine — axe-core is the source of truth for violations;
  structure extraction (headings/landmarks/DOM order) is ours.
- Broken or unshippable features are removed, not documented around
  (see: daemon subcommands removal in docs/DEVLOG.md).
- Shared helpers live in `src/util.js` (`CHROME_UA`, `collectKeyValue`,
  `resolveTarget`).
- `files` allowlist in package.json controls the npm tarball — check
  `npm pack --dry-run` when adding top-level files.
- History and rationale: **docs/DEVLOG.md** (append new entries, newest
  first).

## Working with the maintainer

Elizabeth (owner) prefers plain-language, example-first explanations over
code dumps and long technical summaries — short cards, before/after
examples, one idea at a time. When summarizing work, explain what a change
means for users, not just what the diff does.
