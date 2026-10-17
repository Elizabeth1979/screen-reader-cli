# screen-reader-cli — project memory

CLI for screen-reader accessibility testing. Three engines behind one
binary (`bin/cli.js`, commander, pure ESM; one build step, `npm run build`,
run by `prepare` on `npm install`):

1. **scan** (`src/commands/scan.js` + `src/services/scanner.js`) — Playwright
   headless Chromium + axe-core + structure extraction → text/JSON/HTML
   report, generated tests, AI analysis. Detection is **axe-only**; rule ids
   in reports are axe ids (`image-alt`, `heading-order`, …).
2. **virtual** (`page`/`nav`/`speak`/`audit`/`repl` via `src/bridge.js`) —
   Guidepup's Virtual Screen Reader, built into `dist/` as one plain script
   (`scripts/build-virtual-screen-reader.mjs`) and evaluated into the page by
   `injectVirtualScreenReader` — the one loader; every command goes through
   it. Over the DevTools protocol, like `@axe-core/playwright` loads axe, so
   it runs on pages whose CSP forbids scripts. Never switch the page's CSP
   off to make it load. Pinned to exactly 0.32.1: 0.33.0's `start()` opens a
   user-event session that can break typing in a React input
   (guidepup/virtual-screen-reader#250).
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

## Contributing

Every change goes **branch → PR**, never a direct push to `main`.

## Releasing

Version bump in package.json → merge. That's all: `publish.yml` runs on every
push to main and publishes by itself when the version isn't on npm yet (other
merges skip in seconds), then tags `vX.Y.Z`. Never run it by hand. The manual "Run workflow" button and GitHub Releases are only for
re-running a failed publish. Authenticates with npm trusted
publishing (OIDC), so there is no token to store or renew; the trusted
publisher is set on npmjs.com (package Settings → Trusted publisher →
`publish.yml`). Workflow runs the full suite before publishing.

## Site

`docs/` deploys to https://elizabeth1979.github.io/screen-reader-cli/ via
`pages.yml` on every push to main. Single self-contained HTML file; body
font Atkinson Hyperlegible; must keep passing `--fail-on minor`.

## Conventions & decisions

- **Nothing employer-specific ever enters this repo or its issues.** No company
  name, no partner name, no design-system or product name, no internal ticket
  key, no internal hostname, story ID or test-id. This holds in code, comments,
  tests, fixtures, docs, commit messages, PR text **and GitHub issues** — issues
  are public and are where it has slipped in before.

  Two reasons, and the second is the durable one:

  1. It is not ours to publish. Whatever the tool is used to test belongs to
     whoever owns that product.
  2. **It is a coupling smell.** This is a general-purpose screen-reader CLI. If
     an explanation, a fixture or a rule only makes sense once you know a
     particular company's product, the abstraction is wrong. Every example must
     stand on its own for any user anywhere.

  So write the *shape*, not the instance: "a design-system modal dialog", not a
  named component; "a production site", not a named site; "a real-world
  focus-guard bug", not a ticket key. A bug report loses nothing — the technical
  content is what makes it useful, and none of it depends on the product's name.

  Removal is not the same as editing. A GitHub issue keeps every previous
  version in an edit history anyone can query, and git keeps deleted file
  contents in history. So the rule is to never write it in the first place;
  cleanup afterwards is always partial.

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
- **Bugs found while using the tool in another project → open a GitHub issue
  here, do not fix in place.** A fix can't be properly tested from inside
  another project — live-mode work in particular needs VoiceOver to take over
  the machine for minutes per run. File an issue with the root cause and the
  proposed fix written into it (`gh issue create`), then implement in a
  dedicated session here. A PR is for when the code already exists and is
  testable; an issue is for when the diagnosis is ahead of the test loop.
