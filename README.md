# screen-reader-cli

[![CI](https://github.com/Elizabeth1979/screen-reader-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/Elizabeth1979/screen-reader-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A command-line screen reader testing tool. Scan any page for accessibility violations, generate regression tests, or drive a **real screen reader** (VoiceOver/NVDA) programmatically.

Powered by [Virtual Screen Reader](https://github.com/guidepup/virtual-screen-reader), [Guidepup](https://github.com/guidepup/guidepup), [axe-core](https://github.com/dequelabs/axe-core), and [Playwright](https://playwright.dev/).

## What it does

- **Scans** pages for screen-reader-specific violations (heading skips, missing alt text, missing accessible names, hidden focusable elements, missing landmarks, missing form labels) + axe-core rules
- **Drives real screen readers** — VoiceOver on Mac, NVDA on Windows — to hear what gets announced
- **Generates regression tests** — Playwright Test or Vitest files from scan results
- **Visual reports** — HTML reports with issue tables, heading structure, DOM reading order, and screenshots
- **Navigates** by element, heading, landmark, link, or form (virtual mode)
- **Works offline** — everything runs locally, no CDN dependencies

## Platform support

| Command                                          | macOS | Windows | Linux |
| ------------------------------------------------ | ----- | ------- | ----- |
| `scan`, `audit`, `page`, `nav`, `speak`, `repl`  | ✅    | ✅      | ✅    |
| `screenshot`, `--visual` reports                 | ✅    | ✅      | ✅    |
| `live` (real VoiceOver/NVDA)                     | ✅    | ✅      | ❌    |

Everything except `live` uses a virtual screen reader in headless Chromium and
runs anywhere Node 20+ and Playwright do — including CI. `live` drives the OS
screen reader, which only exists on macOS (VoiceOver) and Windows (NVDA).

## Install

```bash
# Requires Node.js 20+
git clone https://github.com/Elizabeth1979/screen-reader-cli.git
cd screen-reader-cli
npm install
npx playwright install chromium
npm link
```

> Once the package is published to npm this becomes
> `npm install -g screen-reader-cli` (or one-off: `npx screen-reader-cli scan <url>`),
> followed by `npx playwright install chromium`.

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

## Security notes

- **`--chrome-profile` reuses your real Chrome profile** — cookies and
  logged-in sessions included. Only use it against URLs you trust (your own
  staging environments); scanning an untrusted site with it exposes your
  authenticated sessions to that site.
- **Virtual mode disables the target page's Content-Security-Policy**
  (`bypassCSP`) so the Virtual Screen Reader bundle can be injected. This is
  required for the tool to work on CSP-strict sites, but it means the page runs
  with weaker protections during the scan — again, point it at pages you trust.
- AI analysis (`--ai`) sends scan results (violation messages, selectors, page
  title/URL) to the provider you select. Use `--provider ollama` to keep
  everything local.

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
# Run all local tests (headless Chromium, no network needed)
npm test

# E2E tests (requires network — scans https://example.com)
npm run test:e2e

# Individual suites
node --test test/scan.test.js       # Scan command
node --test test/live.test.js       # Live command
node --test test/commands.test.js   # Virtual mode commands
node --test test/bridge.test.js     # VSR bridge
node --test test/audit.test.js      # Audit command
node --test test/daemon.test.js     # Browser lifecycle
```

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Built with

- [axe-core](https://github.com/dequelabs/axe-core) — Accessibility rule engine (WCAG 2 AA)
- [@guidepup/virtual-screen-reader](https://github.com/guidepup/virtual-screen-reader) — Screen reader simulation engine
- [@guidepup/guidepup](https://github.com/guidepup/guidepup) — Real screen reader driver (VoiceOver + NVDA)
- [Playwright](https://playwright.dev/) — Browser automation
- [Commander.js](https://github.com/tj/commander.js) — CLI framework

## License

MIT
