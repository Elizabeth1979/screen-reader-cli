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

## Contributing from the work machine

Work here goes **fork → branch → PR**, never a direct push to `main`, even
though this is a solo repo: the contributor seat is deliberate (see
"Produce here, consume elsewhere" below). The clone at `~/forks/screen-reader-cli`
is permanent — do not delete it after a PR; the repo is under a megabyte and
re-cloning costs a Playwright browser download every time.

One command does the push and the PR:

```bash
bash ~/elli-vault-melio/Scripts/screen-reader-cli/contribute-pr.sh "<title>" <body.md>
```

**No `gh auth switch`, ever.** The fork is owned by the default gh account, so
pushing to it and opening the PR both work as-is. `gh auth switch` is global —
switch and forget to switch back, and unrelated work in other sessions starts
failing in a way that looks like a broken token. Commit authorship is separate
and already correct: the clone is configured with the personal email, so commits
stay personal whoever pushes.

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
- **Bugs found while using the tool elsewhere → open a GitHub issue here, do
  not fix in place.** The tool is most often exercised from other contexts
  (e.g. QA'ing a product on the work machine), where a fix can't be properly
  tested — live-mode work in particular needs VoiceOver to take over the
  machine for minutes per run. File an issue with the root cause and the
  proposed fix written into it (`gh issue create`), then implement in a
  dedicated session here. A PR is for when the code already exists and is
  testable; an issue is for when the diagnosis is ahead of the test loop.
- **Produce here, consume elsewhere — deliberate separation.** This repo is
  maintained/published from Elizabeth's personal `Elizabeth1979` account. On
  her work machine she _consumes_ the tool as a plain user to QA a
  product there — the intended consume path there is the **published npx / npm
  package**, not a linked dev clone, so she dogfoods the exact artifact any
  dev would install. (As of 2026-07-26 the work machine is still on an
  `npm link` clone because the tool is under active development — fast
  iteration beats dogfooding until it stabilizes; flip to the package later.)
  Keep work identity off this repo — it stays a personal asset.

## Working with the maintainer

Elizabeth (owner) prefers plain-language, example-first explanations over
code dumps and long technical summaries — short cards, before/after
examples, one idea at a time. When summarizing work, explain what a change
means for users, not just what the diff does.
