# screen-reader-cli

A command-line screen reader testing tool. Scan any page for accessibility violations, generate regression tests, or drive a **real screen reader** (VoiceOver/NVDA) programmatically.

Powered by [Virtual Screen Reader](https://github.com/guidepup/virtual-screen-reader), [Guidepup](https://github.com/guidepup/guidepup), [axe-core](https://github.com/dequelabs/axe-core), and [Playwright](https://playwright.dev/).

> **New here?** Read the [one-page overview](docs/overview.md) for a non-technical summary, or the [usage guide](docs/usage-guide.md) for a hands-on walkthrough of how to use, operate, and read the output.

## What it does

- **Scans** pages for screen-reader-specific violations (heading skips, missing alt text, missing accessible names, hidden focusable elements, missing landmarks, missing form labels) + axe-core rules
- **Drives real screen readers** — VoiceOver on Mac, NVDA on Windows — to hear what gets announced
- **Generates regression tests** — Playwright Test or Vitest files from scan results
- **Visual reports** — HTML reports with issue tables, heading structure, DOM reading order, and screenshots
- **Navigates** by element, heading, landmark, link, or form (virtual mode)
- **Works offline** — everything runs locally, no CDN dependencies

## Supported screen readers

| Reader               | Live (real reader, driven) | Virtual scan (spec-based) |
| -------------------- | :------------------------: | :-----------------------: |
| NVDA (Windows)       |             ✅             |            ✅             |
| VoiceOver (macOS)    |             ✅             |            ✅             |
| JAWS (Windows)       |   ❌ (no automation API)   |    ✅ findings apply      |

**About JAWS:** there is no way to drive JAWS programmatically (it exposes no compatible free automation API, and Guidepup has no JAWS driver), so `live` mode is limited to NVDA and VoiceOver. This is **not** a real gap in coverage: the `scan` command checks the underlying markup — missing accessible names, heading skips, unlabeled fields, missing landmarks, broken ARIA — against the same W3C specifications that **all** screen readers obey. A violation `scan` reports affects NVDA, VoiceOver, **and** JAWS users alike. On any OS (including Linux, where live mode can't run), `screenreader scan <url>` gives you reader-agnostic results.

## Install

```bash
# Requires Node.js 20+
git clone https://github.com/Elizabeth1979/screen-reader-cli.git
cd screen-reader-cli
npm install
npx playwright install chromium
npm link
```

### Live mode setup (optional — for real screen reader testing)

To use the `live` command with a real screen reader, run the one-time setup:

```bash
npx @guidepup/setup
```

This grants the OS permissions needed for screen reader automation:

- **macOS**: Enables VoiceOver's AppleScript API and adds your terminal to Accessibility permissions
- **Windows**: Configures NVDA for programmatic control

You only need to do this once per machine. The `scan` command (virtual mode) works without this step.

## Quick start

```bash
# Scan a page for accessibility issues (the main command)
screenreader scan https://example.com

# JSON output (for CI pipelines)
screenreader scan https://example.com --json

# Visual HTML report (opens in browser)
screenreader scan https://example.com --visual

# Generate a Playwright regression test file
screenreader scan https://example.com --test

# Generate Vitest stubs instead
screenreader scan https://example.com --test --framework vitest

# Drive the real screen reader on a page
screenreader live read https://example.com

# Interactive REPL
screenreader
```

## Commands

### `scan` — The main command

Scans a page for screen-reader-specific violations using custom DOM checks + axe-core, then outputs a merged, deduplicated report.

```bash
screenreader scan <url>                                    # Text report in terminal
screenreader scan <url> --json                             # JSON (for CI)
screenreader scan <url> --visual                           # HTML report opens in browser
screenreader scan <url> --test                             # Generate Playwright test file
screenreader scan <url> --test --framework vitest          # Generate Vitest stubs
screenreader scan <url> --test --output my-tests.test.js   # Custom output path
screenreader scan <url> --ai                               # AI analysis of results
screenreader scan <url> --ai --model sonnet                # Use Claude Sonnet
screenreader scan <url> --ai --model gpt-4o                # Use GPT-4o
screenreader scan <url> --ai --provider ollama             # Use local model (free)
screenreader scan <url> --fail-on critical                 # Exit non-zero for CI (gate)
screenreader scan <url> --fail-on moderate --threshold 5   # Allow up to 5 issues
```

#### AI analysis (`--ai`)

Get plain-language explanations, prioritized fix suggestions with code examples, and a screen reader experience score. Supports multiple providers:

| Provider  | Flag                   | Models                                       | API Key                                |
| --------- | ---------------------- | -------------------------------------------- | -------------------------------------- |
| Gemini    | `--provider gemini`    | `flash` (default), `pro`                     | `GEMINI_API_KEY` (free tier available) |
| Anthropic | `--provider anthropic` | `haiku`, `sonnet` (default), `opus`          | `ANTHROPIC_API_KEY`                    |
| OpenAI    | `--provider openai`    | `gpt-4o-mini` (default), `gpt-4o`, `o3-mini` | `OPENAI_API_KEY`                       |
| Ollama    | `--provider ollama`    | Any installed model                          | None (free, local)                     |

Auto-detects provider from model name: `--model sonnet` → Anthropic, `--model gpt-4o` → OpenAI, `--model flash` → Gemini. Unknown models default to Ollama. If no provider or model is specified, picks the first available API key (priority: Gemini → Anthropic → OpenAI → Ollama).

**What it checks:**

- Heading hierarchy (no skips, e.g. h1 → h3)
- Missing alt text on images
- Missing accessible names on buttons and links (including icon-only buttons/links)
- Missing form labels
- Missing main landmark
- Focusable elements inside `aria-hidden="true"`
- All axe-core WCAG 2 AA rules

Works with URLs and local files:

```bash
screenreader scan test/fixtures/violations.html
```

#### CI gating (`--fail-on`, `--threshold`)

By default `scan` always exits `0` (it only reports). Add `--fail-on` to make it a build gate:

- `--fail-on <severity>` — count violations at or above this severity (`critical`, `moderate`, or `minor`). `critical` also includes axe "serious" findings.
- `--threshold <n>` — how many such violations are tolerated before failing (default `0`).

When the count exceeds the threshold the process exits `1`; the one-line pass/fail summary is written to **stderr**, so `--json` on **stdout** stays clean for parsing. An invalid `--fail-on` value exits `2`.

```yaml
# .github/workflows/a11y.yml
- name: Accessibility gate
  run: screenreader scan "$DEPLOY_URL" --fail-on critical
```

```bash
# Gate in CI but still capture the full machine-readable report
screenreader scan https://example.com --json --fail-on moderate > a11y.json
echo "exit code: $?"   # 0 = within threshold, 1 = gate failed
```

### `live` — Real screen reader testing

Drives **VoiceOver** (macOS) or **NVDA** (Windows) on a real page. Auto-detects your OS, or override with `--reader`.

```bash
# Read the full page — logs every announcement
screenreader live read <url>
screenreader live read <url> --json
screenreader live read <url> --steps 50        # Limit traversal steps

# Test mode — traverses and detects issues (empty announcements, focus traps)
screenreader live test <url>
screenreader live test <url> --json

# Interactive — opens browser + screen reader, keeps it running
screenreader live open <url>

# Force a specific reader
screenreader live read <url> --reader nvda
screenreader live read <url> --reader voiceover
```

Requires one-time setup: `npx @guidepup/setup` (see Install section above).

### `page` — Page navigation

```bash
screenreader page open <url>    # Open a URL or local HTML file
screenreader page info          # Show current page title and URL
```

### `nav` — Navigate elements

```bash
screenreader nav next           # Move to next element
screenreader nav previous       # Move to previous element
screenreader nav heading        # Jump to next heading
screenreader nav landmark       # Jump to next landmark
screenreader nav link           # Jump to next link
screenreader nav form           # Jump to next form
```

All nav commands accept `--url <url>` to open a page first and `--json` for structured output.

### `speak` — Query spoken phrases

```bash
screenreader speak last                   # Last spoken phrase
screenreader speak log --steps 10         # Navigate 10 steps, show log
screenreader speak find "Sign up" --url https://example.com
```

### `audit` — Full page traversal

```bash
screenreader audit <url>                  # Traverse entire page
screenreader audit <url> --summary        # Include heading/landmark summary
screenreader audit <url> --json           # JSON output
screenreader audit <url> --max 1000       # Increase element limit (default: 500)
```

### `screenshot` — Capture elements or pages

```bash
screenreader screenshot --url <url> --full --output page.png
screenreader screenshot --url <url> --navigate 5 --output element.png
```

### `daemon` — Browser lifecycle

```bash
screenreader daemon start     # Start persistent browser
screenreader daemon stop      # Stop browser
screenreader daemon status    # Check if running
```

### `repl` — Interactive mode

```bash
screenreader        # Enters REPL (default when no command given)
screenreader repl   # Same thing, explicit
```

In the REPL, navigation state persists across commands. You can also start a real screen reader session:

```
screenreader> page open https://example.com
Opened: Example Domain (https://example.com/)
screenreader> nav heading
heading, Example Domain, level 1
screenreader> nav next
More information...
screenreader> screenshot element.png
Screenshot saved: element.png

screenreader> live start
VoiceOver started. Use "live next", "live previous", "live log", etc.
screenreader> live next
Example Domain, heading level 1
screenreader> live log
1. Example Domain, heading level 1
screenreader> live stop
VoiceOver stopped.
screenreader> quit
```

## JSON output

All commands support `--json` for machine-readable output:

```bash
screenreader audit https://example.com --summary --json
```

```json
{
  "phrases": ["document", "heading, Example Domain, level 1", "..."],
  "total": 12,
  "headings": ["heading, Example Domain, level 1"],
  "landmarks": ["main"],
  "links": ["link, More information..."],
  "summary": {
    "totalElements": 12,
    "headingCount": 1,
    "landmarkCount": 1,
    "linkCount": 1
  }
}
```

## Input & output

**What you give it (input):**

- A **remote URL** — `screenreader scan https://example.com`
- A **local HTML file** — `screenreader scan ./build/index.html` (relative paths are resolved to a `file://` URL automatically)
- A **`file://` URL** — passed through as-is

Each run scans **one page**. (See [Web applications](#web-applications--different-page-types) for multi-page apps.)

**What you get back (output):** pick the form that fits your workflow.

| Form         | Flag        | Best for                                  |
| ------------ | ----------- | ----------------------------------------- |
| Text report  | _(default)_ | Reading in the terminal                   |
| JSON         | `--json`    | CI pipelines, scripting, dashboards       |
| Visual HTML  | `--visual`  | Sharing with designers/managers (+ screenshot) |
| Test file    | `--test`    | Locking in fixes as Playwright/Vitest regression tests |

The default text report shows the page title, element/heading/landmark counts, every violation (sorted critical → minor) with its element selector, WCAG reference, and suggested fix, plus the heading outline. The `--json` payload looks like:

```jsonc
{
  "url": "https://example.com/",
  "title": "Example Domain",
  "domOrder": [ { "index": 0, "tag": "h1", "role": "heading", "name": "...", "rect": {…} } ],
  "headings": [ { "level": 1, "text": "Example Domain" } ],
  "violations": [
    {
      "source": "axe",            // or "custom"
      "id": "image-alt",
      "severity": "critical",     // critical | moderate | minor
      "message": "Images must have alternate text",
      "wcag": "2a, 412",
      "suggestion": "Add an alt attribute…",
      "element": { "selector": "img", "html": "<img src=…>" }
    }
  ],
  "stats": { "domElements": 12, "headingCount": 1, "landmarkCount": 1,
             "violationCount": 1, "critical": 1, "moderate": 0, "minor": 0 }
}
```

## How it works

### Virtual mode (`scan`, `page`, `nav`, `audit`, etc.)

1. **Playwright** launches a headless Chromium browser
2. **Virtual Screen Reader** is injected into the page context for DOM traversal
3. **Custom violation checks** run against the DOM (heading hierarchy, accessible names, etc.)
4. **axe-core** is injected for comprehensive WCAG 2 AA rule coverage
5. Results are merged and deduplicated

The Virtual Screen Reader implements the same [W3C accessibility specifications](https://www.w3.org/TR/wai-aria-1.2/) that real screen readers follow — ACCNAME, CORE-AAM, HTML-AAM, WAI-ARIA 1.2, and more.

### Live mode (`live`)

1. **Playwright** launches a **visible** browser (screen readers need a real window)
2. **Guidepup** starts VoiceOver (macOS) or NVDA (Windows)
3. The screen reader traverses the page — you hear what it actually announces
4. Results are captured via guidepup's API (`lastSpokenPhrase()`, `spokenPhraseLog()`)

## Web applications & different page types

`scan` drives a real Chromium browser, so client-rendered apps work — JavaScript executes and the rendered DOM is what gets checked. A few things to know:

- **SPAs / JS-rendered content** — after navigation the scanner waits ~2 seconds for scripts to settle before reading the page. Content that streams in later (lazy lists, deferred widgets) may be missed; trigger it first (see `--open`) or scan a route that renders it eagerly.
- **Dropdowns, menus, modals, dialogs** — components that are collapsed in the DOM hide their contents from the checks. Use `--open "<selector>"` to click them open before scanning, and `--open-wait <ms>` to control the settle time. Comma-separate fallback selectors; the first match wins.

  ```bash
  screenreader scan https://example.com --open "button[aria-haspopup], .menu-toggle" --open-wait 1200
  ```

- **Multi-page apps** — scan **one route at a time** (`scan /`, `scan /checkout`, …) and gate each in CI. For exploring a single app across many steps, the `repl`/`daemon` keep one browser session alive so navigation state persists.
- **Pages behind login** — **not supported.** Each scan uses a fresh, unauthenticated browser context (no cookies, storage, or credentials), so anything behind a login wall won't load. Point `scan` at a public URL, a preview/staging URL that doesn't require auth, or a local HTML file.
- **Storybook / component sandboxes** — scan the rendered component frame directly, e.g. `…/iframe.html?id=button--primary`.

## Use cases

- **Accessibility testing** — audit any site's screen reader experience from CI/CD
- **AI agents** — give agents structured, semantic understanding of web pages
- **Developer workflows** — quickly check heading hierarchy, landmark structure, ARIA usage
- **Automated QA** — validate accessibility in build pipelines with JSON output

## Claude Code companion skill

If you use [Claude Code](https://docs.claude.com/en/docs/claude-code), this repo ships a companion skill + slash command that lets Claude run audits on demand:

```
/sr-audit https://example.com
```

Claude runs `scan` + `audit` paired, saves text + JSON to disk, and surfaces the top issues in chat. See [`skills/claude-code/README.md`](skills/claude-code/README.md) for install instructions and what it does.

## Testing

```bash
# Run all tests
npm test

# Individual suites
node --test test/scan.test.js       # Scan command (needs a browser)
node --test test/live.test.js       # Live command + reader registry
node --test test/readers.test.js    # Supported-reader source of truth
node --test test/gating.test.js     # CI gating logic
node --test test/commands.test.js   # Virtual mode commands
node --test test/bridge.test.js     # VSR bridge
node --test test/audit.test.js      # Audit command
node --test test/daemon.test.js     # Browser daemon

# E2E tests (requires network)
node --test test/e2e.test.js
```

## Limitations & what to watch for

- **Live mode is macOS/Windows only.** On Linux (and CI runners without a desktop session) use `scan` — it's reader-agnostic and covers the same issues. JAWS can't be driven at all (see [Supported screen readers](#supported-screen-readers)).
- **Live mode needs one-time setup** — `npx @guidepup/setup` to grant OS automation permissions.
- **No authentication.** `scan` runs in a fresh, cookieless browser context; pages behind login won't load.
- **Dynamic content timing.** The scanner waits ~2s after load; content that appears later can be missed unless you reveal it with `--open`.
- **Automated checks aren't the whole story.** axe-core covers WCAG 2 A/AA rules and our custom checks catch common screen-reader pitfalls, but automation can't judge whether alt text is *meaningful* or whether the reading order makes *sense* — pair this with real testing for anything high-stakes.
- **One page per run.** Multi-page apps are scanned route-by-route.

## Built with

- [axe-core](https://github.com/dequelabs/axe-core) — Accessibility rule engine (WCAG 2 AA)
- [@guidepup/virtual-screen-reader](https://github.com/guidepup/virtual-screen-reader) — Screen reader simulation engine
- [@guidepup/guidepup](https://github.com/guidepup/guidepup) — Real screen reader driver (VoiceOver + NVDA)
- [Playwright](https://playwright.dev/) — Browser automation
- [Commander.js](https://github.com/tj/commander.js) — CLI framework

## License

MIT
