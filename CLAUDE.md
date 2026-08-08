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
- Known flake: `commands.test.js` nav test occasionally fails on CI with
  "browser.newContext: Browser closed" — re-run failed jobs once; twice in
  a row means it's real.
- Any wait added to the scan pipeline must be double-bounded (playwright
  timeout + wall-clock race) — an element-screenshot call once hung CI for
  32 min despite its own timeout (see scanner.js captureElementShots).
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
- **Bugs found while using the tool elsewhere → open a GitHub issue here, do
  not fix in place.** The tool is most often exercised from other contexts
  (e.g. QA'ing a product on the Melio machine), where a fix can't be properly
  tested — live-mode work in particular needs VoiceOver to take over the
  machine for minutes per run. File an issue with the root cause and the
  proposed fix written into it (`gh issue create`), then implement in a
  dedicated session here. A PR is for when the code already exists and is
  testable; an issue is for when the diagnosis is ahead of the test loop.
- **Produce here, consume elsewhere — deliberate separation.** This repo is
  maintained/published from Elizabeth's personal `Elizabeth1979` account. On
  her Melio work machine she _consumes_ the tool as a plain user to QA the
  Melio product — the intended consume path there is the **published npx / npm
  package**, not a linked dev clone, so she dogfoods the exact artifact a Melio
  dev would install. (As of 2026-07-26 the Melio machine is still on an
  `npm link` clone because the tool is under active development — fast
  iteration beats dogfooding until it stabilizes; flip to the package later.)
  Keep Melio identity off this repo — it stays a personal asset.

## Working with the maintainer

Elizabeth (owner) prefers plain-language, example-first explanations over
code dumps and long technical summaries — short cards, before/after
examples, one idea at a time. When summarizing work, explain what a change
means for users, not just what the diff does.
