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

### Still open (roadmap)

Element screenshots in reports → flow capture → richer per-violation AI
fixes → asset capture → crawling → baseline/diff → GitHub Action →
transcript diff. Bigger idea parked: a desktop app (Tauri/Electron) as the
true zero-terminal install for non-technical users.
