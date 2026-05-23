# Usage Guide

A hands-on walkthrough of `screen-reader-cli`: how to use it, what's possible, how to operate it day to day, what the input and output look like, and how it handles real web applications. For the terse command reference, see the [README](../README.md); for a non-technical summary, see the [one-page overview](overview.md).

---

## How to use

### Install

```bash
# Requires Node.js 20+
git clone https://github.com/Elizabeth1979/screen-reader-cli.git
cd screen-reader-cli
npm install
npx playwright install chromium   # downloads the headless browser scan uses
npm link                          # makes the `screenreader` command available
```

Live mode (driving a real screen reader) needs a one-time OS permission grant — `npx @guidepup/setup`. The `scan` command does **not** need this.

### Your first scan

`scan` is the command you'll use 90% of the time. Point it at a page:

```bash
screenreader scan https://example.com
```

Try it against the bundled fixture, which is full of deliberate mistakes:

```bash
screenreader scan test/fixtures/violations.html
```

You'll get a report like:

```
Screen Reader Scan: Violations Test Page
URL: file:///…/violations.html
DOM elements: 24 | Headings: 4 | Landmarks: 1

Found 6 issues (3 critical, 2 moderate, 1 minor)

  [CRITICAL] Images must have alternate text
    Element: img
    WCAG: 2a, 412
    Fix: Add an alt attribute that describes the image…

  [MODERATE] Heading levels should only increase by one
    Element: h3
    …

--- Heading Structure ---
h1: Welcome
  h3: Skipped a level
```

Read it top-down: issues are sorted **critical → moderate → minor**, so the first thing you see is the most important thing to fix.

---

## What's possible

| Capability             | Command                                  | Notes                                              |
| ---------------------- | ---------------------------------------- | -------------------------------------------------- |
| Virtual scan           | `scan <url>`                             | The core check; works on any OS, no real reader.   |
| CI gating              | `scan <url> --fail-on critical`          | Exit non-zero to block a broken build.             |
| Visual report          | `scan <url> --visual`                    | Shareable HTML with a screenshot.                  |
| Regression tests       | `scan <url> --test`                      | Generates Playwright (or `--framework vitest`).    |
| AI analysis            | `scan <url> --ai`                        | Plain-language fixes; needs an API key or Ollama.  |
| Real screen reader     | `live read <url>` / `live test <url>`    | Drives VoiceOver (Mac) or NVDA (Windows).          |
| Interactive navigation | `repl` (or just `screenreader`)          | Step through a page; state persists between steps. |

---

## How to operate (common workflows)

### 1. Quick check while building

```bash
screenreader scan http://localhost:3000
```

Fix the criticals, re-run, repeat.

### 2. A CI gate that blocks broken pages

`scan` only reports by default (exit code `0`). Add `--fail-on` to turn it into a gate:

```bash
screenreader scan "$DEPLOY_URL" --fail-on critical
echo "exit code: $?"   # 0 = passed the gate, 1 = failed, 2 = bad --fail-on value
```

- `--fail-on <severity>` — `critical` (default), `moderate`, or `minor`. The chosen level **and everything more severe** counts. `critical` also includes axe "serious" findings.
- `--threshold <n>` — tolerate up to `n` such issues before failing (default `0`).

The pass/fail summary prints to **stderr**, so you can capture clean JSON on stdout at the same time:

```bash
screenreader scan "$DEPLOY_URL" --json --fail-on moderate > a11y.json
```

```yaml
# .github/workflows/a11y.yml
- name: Accessibility gate
  run: screenreader scan "$DEPLOY_URL" --fail-on critical
```

### 3. Reveal a hidden component before scanning

Menus, dialogs, and dropdowns hide their contents until opened. Click them first:

```bash
screenreader scan https://example.com \
  --open "button[aria-haspopup], .menu-toggle" \
  --open-wait 1200
```

Selectors are tried in order; the first match wins.

### 4. Deep-dive in the REPL

```bash
screenreader            # start interactive mode
screenreader> page open https://example.com
screenreader> nav heading
screenreader> nav next
screenreader> live start        # (Mac/Windows) drive a real reader
screenreader> live next
screenreader> quit
```

The browser stays open between commands, so you can explore one app step by step.

---

## Input and output

### Input — what you can point it at

- A **remote URL**: `screenreader scan https://example.com`
- A **local HTML file**: `screenreader scan ./dist/index.html` (relative paths become a `file://` URL automatically)
- A **`file://` URL**: passed through unchanged

Each run scans **one page**.

### Output — four shapes for four audiences

- **Text (default)** — for reading in the terminal. Title, counts, sorted issues (selector, WCAG reference, fix), and the heading outline.
- **`--json`** — for CI and tooling. The shape:

  ```jsonc
  {
    "url": "…", "title": "…",
    "domOrder":  [ { "index": 0, "tag": "h1", "role": "heading", "name": "…", "rect": {…} } ],
    "headings":  [ { "level": 1, "text": "Welcome" } ],
    "violations": [
      {
        "source": "axe",          // or "custom"
        "id": "image-alt",
        "severity": "critical",   // critical | moderate | minor
        "message": "Images must have alternate text",
        "wcag": "2a, 412",
        "suggestion": "Add an alt attribute…",
        "element": { "selector": "img", "html": "<img …>" }
      }
    ],
    "stats": { "domElements": 24, "headingCount": 4, "landmarkCount": 1,
               "violationCount": 6, "critical": 3, "moderate": 2, "minor": 1 }
  }
  ```

- **`--visual`** — an HTML report (with a screenshot) that opens in your browser; good for sharing with designers and stakeholders.
- **`--test`** — a Playwright (or `--framework vitest`) regression test file so fixed issues stay fixed. Use `--output <path>` to choose where it lands.

Add `--ai` to any of these to attach plain-language explanations and prioritized fixes (requires an API key, or a local Ollama model for free).

---

## Handling different pages / web applications

`scan` runs a real Chromium browser, so JavaScript executes and modern apps render before they're checked.

- **Single-page apps (React/Vue/etc.):** after loading, the scanner waits ~2 seconds for scripts to settle. Content that streams in later may be missed — reveal it first (`--open`) or scan a route that renders it eagerly.
- **Overlays (menus/modals/dialogs):** use `--open "<selector>"` (+ `--open-wait <ms>`) to click them open before the scan, so their contents are checked.
- **Multi-page apps:** scan each important route on its own (`scan /`, `scan /pricing`, `scan /checkout`) and gate each in CI. To explore one app across many steps, use the `repl`/`daemon`, which keep a single browser session alive.
- **Pages behind a login:** **not supported today** — every scan uses a fresh, cookieless browser context, so authenticated pages won't load. Use a public URL, an auth-free preview/staging URL, or a saved local HTML file.
- **Storybook / component sandboxes:** scan the component's frame directly, e.g. `…/iframe.html?id=button--primary`.

---

## What to watch for

- Automated checks are a strong first line of defense, not a full audit — they can't tell whether alt text is *meaningful* or whether a page *makes sense* read aloud. Pair high-stakes flows with real screen-reader testing (`live`) and human review.
- Live mode is **Mac/Windows only** and needs `npx @guidepup/setup`. On Linux/CI, use `scan` — same findings, reader-agnostic.
- One page per run; dynamic content past the ~2s settle window can be missed.

---

_See also: the [README](../README.md) command reference and the [one-page overview](overview.md)._
