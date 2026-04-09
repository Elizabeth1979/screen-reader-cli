# screen-reader-cli

A command-line screen reader for any webpage. Powered by [Virtual Screen Reader](https://github.com/guidepup/virtual-screen-reader) + [Playwright](https://playwright.dev/).

Point it at any URL or local HTML file and hear what a screen reader would announce — headings, landmarks, links, ARIA roles, all of it. No browser extensions, no manual setup.

## What it does

- **Audits** any page with a full screen reader traversal
- **Navigates** by element, heading, landmark, link, or form
- **Searches** spoken output for specific text
- **Screenshots** the current element or full page
- **Works offline** — no CDN dependencies, everything runs locally

## Install

```bash
# Requires Node.js 20+
git clone https://github.com/Elizabeth1979/screen-reader-cli.git
cd screen-reader-cli
npm install
npx playwright install chromium
npm link
```

## Quick start

```bash
# Full accessibility audit
screenreader audit https://example.com --summary --json

# Navigate headings
screenreader nav heading --url https://example.com --json

# Find specific content
screenreader speak find "pricing" --url https://example.com --json

# Screenshot
screenreader screenshot --url https://example.com --full --output page.png

# Interactive REPL
screenreader
```

## Commands

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

In the REPL, navigation state persists across commands:

```
screenreader> page open https://example.com
Opened: Example Domain (https://example.com/)
screenreader> nav heading
heading, Example Domain, level 1
screenreader> nav next
More information...
screenreader> screenshot element.png
Screenshot saved: element.png
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

1. **Playwright** launches a headless Chromium browser
2. **Virtual Screen Reader** is injected into the page context
3. CLI commands map to VSR API calls (`next()`, `previous()`, `perform()`)
4. Results (spoken phrases, node info) are returned to the terminal
5. **Daemon mode** keeps the browser alive between commands for speed

The Virtual Screen Reader implements the same [W3C accessibility specifications](https://www.w3.org/TR/wai-aria-1.2/) that real screen readers follow — ACCNAME, CORE-AAM, HTML-AAM, WAI-ARIA 1.2, and more.

## Use cases

- **Accessibility testing** — audit any site's screen reader experience from CI/CD
- **AI agents** — give agents structured, semantic understanding of web pages
- **Developer workflows** — quickly check heading hierarchy, landmark structure, ARIA usage
- **Automated QA** — validate accessibility in build pipelines with JSON output

## Testing

```bash
# Unit + integration tests
node --test test/daemon.test.js
node --test test/bridge.test.js
node --test test/commands.test.js
node --test test/audit.test.js

# E2E tests (requires network)
node --test test/e2e.test.js
```

## Built with

- [@guidepup/virtual-screen-reader](https://github.com/guidepup/virtual-screen-reader) — Screen reader simulation engine
- [Playwright](https://playwright.dev/) — Browser automation
- [Commander.js](https://github.com/tj/commander.js) — CLI framework

## License

MIT
