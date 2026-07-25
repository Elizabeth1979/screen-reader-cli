# Development log

A plain-language record of what happened in this repo and why — written so
future-us can come back and understand each decision without reading code.
Newest entries first.

---

## 2026-07-24 — From personal tool to public product

One long working session took the repo from "works on my machine" to a
published, documented, non-technical-friendly product. Six pull requests,
all merged the same day.

### [PR #1](https://github.com/Elizabeth1979/screen-reader-cli/pull/1) — Release blockers + packaging

A full repo review found the code healthy but not shareable. Fixed:

- **`--test` generation was silently broken** — the generator matched old
  rule names (`missing-alt`, `heading-skip`) that had been replaced by
  axe-core's names (`image-alt`, `heading-order`), so every generated test
  was an empty TODO stub. Remapped, and the tests now assert real
  assertion bodies so this can't regress unnoticed.
- **Linux crash in `--visual`** — no `xdg-open` branch existed.
- **Removed the `daemon start/stop/status` commands** — each CLI call is a
  separate process, so the "background browser" died as soon as the
  command finished. The commands could never work; honest CLIs don't
  advertise broken features. (Internal per-command browser reuse stayed.)
- **Deleted `scan-penny-open.mjs`** — a private one-off debug script.
- Added: LICENSE (MIT — the field claimed it, the file didn't exist),
  `files` allowlist (npm tarball is ~22 files, no tests/skills), `engines`,
  repository metadata, CI workflow (Node 20/22 + Chromium), CONTRIBUTING,
  `.env` in .gitignore, dynamic `--version`, clean error messages.

### [PR #2](https://github.com/Elizabeth1979/screen-reader-cli/pull/2) — CI gating + roadmap

- **`scan <url> --fail-on critical|moderate|minor`** — exit code 1 when
  violations at/above the threshold exist. This is what lets teams block a
  deploy on accessibility problems with one line of CI.
- README gained the mermaid **architecture diagram** (three engines: scan /
  virtual / live) and the **roadmap** section.

### [PR #3](https://github.com/Elizabeth1979/screen-reader-cli/pull/3) — Public site

**https://elizabeth1979.github.io/screen-reader-cli/** — a plain-language
landing page for designers/QA, built around "what does your page *sound*
like?". Every example is written as what a screen reader announces, before
and after the fix. The page passes the tool's own strictest check
(`scan docs/index.html --fail-on minor` → exit 0); body text is Atkinson
Hyperlegible (the Braille Institute's low-vision typeface). Deploys
automatically from `docs/` on every push to main (`pages.yml`).
First deploy required a one-time manual step: Settings → Pages → Source →
"GitHub Actions" (only the repo owner can enable Pages).

### [PR #4](https://github.com/Elizabeth1979/screen-reader-cli/pull/4) — Dashboard

**`screenreader dashboard`** — a localhost-only control panel: type a URL,
press Scan, get severity chips + the full visual report, with a history
table. This removes the terminal from day-to-day use entirely. Reuses the
existing scan pipeline and report renderer; 7 dedicated tests.

### [PR #5](https://github.com/Elizabeth1979/screen-reader-cli/pull/5) — `sr` shortcut + port fallback

- **`sr`** alone opens the dashboard; `sr scan <url>` forwards to the full
  CLI. Two keystrokes to a working audit tool.
- If the port is busy, the dashboard walks to the next free one and says
  so, instead of erroring.

### [PR #6](https://github.com/Elizabeth1979/screen-reader-cli/pull/6) — Publish-by-button

`publish.yml`: publishing to npm happens from the Actions tab (or a GitHub
Release), gated on the full test suite. Requires the `NPM_TOKEN` repository
secret — a granular npm token with **read/write on all packages** and
**"Bypass 2FA" checked** (a CI robot can't type a phone code). First
publish of v0.1.0 was triggered right after this merged.

### [PR #7](https://github.com/Elizabeth1979/screen-reader-cli/pull/7) — Project memory

This file (docs/DEVLOG.md) and CLAUDE.md were added so the history and
conventions survive between sessions and collaborators.

### [PR #8](https://github.com/Elizabeth1979/screen-reader-cli/pull/8) — Get Started rewritten around the dashboard

The site's guide confused its first real reader ("where is the dashboard
and button?"). The section now opens with the answer — **the dashboard runs
on your computer, not on the website** — and walks five steps (install
Node → open terminal → two-line npm install → type `sr` → scan and click),
with a visual sketch of the dashboard. README install became npm-first
after v0.1.0 was published.

### Published: v0.1.0 on npm + site live

- **npm**: `screen-reader-cli@0.1.0` published via the Actions workflow
  (after the owner added the `NPM_TOKEN` secret — granular token,
  read/write all packages, "Bypass 2FA" checked). Install is now
  `npm install -g screen-reader-cli`.
- **Site**: https://elizabeth1979.github.io/screen-reader-cli/ went live
  after a one-time Settings → Pages → Source → "GitHub Actions" click by
  the owner; it redeploys automatically on every docs/ change.

### [PR #9](https://github.com/Elizabeth1979/screen-reader-cli/pull/9) — Report redesign: grouping + element screenshots

Driven by the first real-world scan (Melio's homepage): 67 table rows that
were really just 2 distinct problems, with no way to *see* the failing
elements. Changes:

- **Violations grouped by rule** — one card per rule ("Color contrast —
  12 elements"), first 3 elements shown, the rest behind "Show N more."
  Header reads "N distinct issues across M elements."
- **Element screenshots** — the scanner now photographs failing elements
  (capped at 3 per rule / 30 total, JPEG, failures silently skipped) and
  the report embeds them, so you can find the element by sight instead of
  by selector. This was the top roadmap item.
- Needs-review findings get their own grouped, collapsible section (they
  were missing from the visual report entirely).
- `--json` output stays lean: element screenshots are stripped there.
- **War story:** the first version hung CI for 32 minutes — an element
  screenshot call wedged on CI's newer Playwright despite its own timeout.
  Fix: every screenshot is now double-bounded (playwright timeout AND a
  wall-clock `Promise.race`), plus a total budget per scan. Lesson: never
  let a nice-to-have (a photo) be able to block the must-have (the scan).

### Known quirks

- `test/commands.test.js` ("nav commands → navigates next") occasionally
  flakes on CI with "browser.newContext: Browser closed". One re-run of
  failed jobs fixes it. If it fails twice in a row, treat it as real.
- Local dev note: this cloud/dev sandbox pins Playwright 1.56 via
  `npm install --no-save` to match its preinstalled Chromium; CI and users
  get the lockfile version.

### Decisions worth remembering

- **Audience decision:** the tool serves non-developers too. That drove
  the site, the dashboard, `sr`, and the plain-language error messages.
- **Honesty over surface area:** broken features get removed (daemon), not
  documented around.
- **Dogfooding as proof:** the site must pass `--fail-on minor`; the
  publish workflow must pass the full suite. The tool vouches for itself.
- **Known trade-offs:** `bypassCSP` is required for the virtual screen
  reader injection (documented in README security notes); `--chrome-profile`
  reuses the real logged-in Chrome profile (only scan trusted URLs).

### Where things stand at end of session

Shipped and live: npm v0.1.0, the site, the dashboard + `sr`, `--fail-on`
CI gating, grouped reports with element photos, CI + publish workflows,
and this log.

Open items, in suggested order:

1. **Publish v0.2.0** — main now has dashboard, `sr`, and the report
   redesign, all missing from the published 0.1.0. Bump `version` in
   package.json, merge, then Actions → "Publish to npm" → Run workflow.
2. **Roadmap next**: flow capture → violation DOM/a11y-tree context →
   richer per-violation AI fixes → asset capture → crawling →
   baseline/diff → GitHub Action → transcript diff.
3. **Parked product decision**: the fully non-technical install. Options
   discussed: desktop app (Tauri/Electron — recommended eventually) vs.
   hosted web service (zero install, but real hosting costs). No decision
   made yet.
