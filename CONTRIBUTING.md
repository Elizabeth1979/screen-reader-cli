# Contributing

Thanks for your interest in improving screen-reader-cli!

## Setup

```bash
git clone https://github.com/Elizabeth1979/screen-reader-cli.git
cd screen-reader-cli
npm install
npx playwright install chromium   # one-time browser download
npm link                          # makes the `screenreader` command available
```

Requires Node.js 20+.

## Running tests

```bash
npm test          # all local suites (launches headless Chromium — no network needed)
npm run test:e2e  # e2e suite — scans https://example.com, needs network access
```

Tests use Node's built-in test runner (`node --test`), no extra framework.
Fixtures live in `test/fixtures/` as plain HTML files — adding a fixture that
reproduces a bug is a great way to start a contribution.

## Live mode (real screen readers)

The `live` command drives VoiceOver (macOS) or NVDA (Windows) and cannot run
on Linux or in CI. If your change touches `src/live-bridge.js` or
`src/commands/live.js`, please test manually on macOS or Windows after running
the one-time `npx @guidepup/setup`.

## Guidelines

- Keep the code style of the surrounding files (ES modules, no build step).
- Add or update a test for behavior changes — `test/scan.test.js` shows the
  pattern of invoking the CLI as a subprocess against a fixture.
- Run `npm test` before opening a PR.

## Releasing (maintainers)

Publishing to npm is automated. One-time setup: create a granular npm
access token (npmjs.com → Access Tokens → Generate New Token → choose
"Automation") and add it as the `NPM_TOKEN` repository secret
(Settings → Secrets and variables → Actions). Then, to release:

1. Bump `version` in package.json (e.g. `0.1.0` → `0.2.0`) and merge.
2. Either publish a GitHub Release for the new tag, or open
   Actions → "Publish to npm" → Run workflow.

The workflow runs the full test suite first — a red build never publishes.

## Reporting bugs

Open an issue at
https://github.com/Elizabeth1979/screen-reader-cli/issues with the command you
ran, what you expected, and what happened. For scan discrepancies, an HTML
snippet that reproduces the issue is ideal.
