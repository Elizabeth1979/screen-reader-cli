---
name: screen-reader-cli
description: Audit a page or component for screen-reader accessibility using the screen-reader-cli tool. Runs `scan` (axe + custom violation checks) and `audit` (full screen-reader traversal) paired, saves text + JSON to disk, and surfaces top issues. Use when the user wants to audit a URL or local HTML file with a real or virtual screen reader, or says "run screen reader on this", "what does VoiceOver say", or "audit this for screen reader". Don't use for writing accessibility test files (this skill produces audit artifacts, not test code), for static codebase audits that don't load a page in a browser, for visualizing accessibility concepts (contrast overlays, focus rings) in the browser, or for general component research not tied to a specific URL.
---

# screen-reader-cli skill

Wraps the `screen-reader-cli` tool (https://github.com/Elizabeth1979/screen-reader-cli) for one-shot screen-reader audits.

For full CLI documentation see the README: https://github.com/Elizabeth1979/screen-reader-cli#readme

## Preflight (always run first)

1. `command -v screenreader` — if missing, stop and tell the user:

   > screen-reader-cli is not on PATH. Install it from a clone of the repo with `npm link` (or `npm install -g screen-reader-cli` once published). Full instructions: https://github.com/Elizabeth1979/screen-reader-cli#install.

2. If the URL is on `localhost:6006`, check Storybook is up with `curl -sf -o /dev/null http://localhost:6006/`. If not, tell the user Storybook isn't running and stop. Don't try to start it — the user knows where their Storybook lives.

## Mode 1 — Snapshot (default)

Use when the user wants an audit of a URL or local HTML file. This is the default.

Steps:

1. **Canonicalize the URL.** If it's a Storybook canvas URL (`?path=/story/...`), convert to iframe form: `/iframe.html?id=<story-id>&viewMode=story&singleStory=true`. The iframe form excludes Storybook's chrome (sidebar, toolbar) so the audit only sees the rendered story; `singleStory=true` ensures the story renders standalone and is necessary for a clean a11y scan. **Preserve any extra query parameters the user passed** (e.g. `globals=...`, `args=...`) — they affect rendering and are part of the audit target.
2. **Derive a slug.** For Storybook iframe URLs use the `id` query param verbatim (e.g. `internal-components-icon-indicator--with-popover`). For other URLs, sanitize the hostname + path (replace `/` with `-`, drop trailing slashes); fall back to a short hash if the URL has no path.
3. **Resolve output dir.** If the user passed `--out <dir>`, use it. Otherwise default to `./sr-output/` in cwd. Create the directory if missing. This skill never infers output location from environment — calling skills or the user pass `--out` explicitly when they want output to land somewhere specific.
4. **Run all four commands**, saving to disk:
   - `screenreader scan <url>` → `<dir>/scan-<slug>.txt`
   - `screenreader scan <url> --json` → `<dir>/scan-<slug>.json`
   - `screenreader audit <url> --summary` → `<dir>/audit-<slug>.txt`
   - `screenreader audit <url> --summary --json` → `<dir>/audit-<slug>.json`
5. **Collisions.** If any output file already exists, overwrite and log a one-line warning per file (e.g. `⚠ overwrote existing scan-popover.txt`). Don't ask, don't timestamp, don't refuse.
6. **Sanity-check the result.** Read the scan JSON. If `stats.domElements === 0`, the page didn't render — Storybook may still be loading, the story may have crashed, or the URL form may be wrong. Stop and tell the user, e.g. "Audit returned 0 DOM elements — the page didn't render. Check that Storybook has finished starting and the story URL loads in a browser." Don't compose a chat summary that implies the page is clean.
7. **Compose the chat summary** by reading the JSON files:
   - Headline: `Audit complete: <N> critical, <M> moderate, <P> phrases traversed.`
   - Top 2–3 critical issues inline (deduplicated by rule + element selector)
   - File paths

Do not paste the full text output into chat — files are the receipt.

## Mode 2 — Live screen reader

Use when the user explicitly asks for a real screen reader: "what does VoiceOver actually say", "use the real screen reader", "live mode".

Additional preflight: confirm Guidepup setup is done. If unsure, run `screenreader live read --help` once; if it errors with a permissions / setup message, stop and tell the user:

> Live mode requires one-time setup. Run `npx @guidepup/setup` and try again.

Commands:

- `screenreader live read <url>` → `<dir>/live-read-<slug>.txt`
- `screenreader live read <url> --json` → `<dir>/live-read-<slug>.json`
- `screenreader live test <url>` → `<dir>/live-test-<slug>.txt`
- `screenreader live test <url> --json` → `<dir>/live-test-<slug>.json`

Chat summary is the same shape as Mode 1, but the headline must flag this used a real screen reader (announcements, not simulated). Live mode requires a visible browser and only runs on macOS (VoiceOver) or Windows (NVDA).

## Mode 3 — Targeted exploration (link out)

The CLI also supports `nav`, `speak`, `screenshot`, and `repl` for targeted, stateful exploration. These need a persistent browser session and are not a fit for one-shot Claude calls.

If the user wants targeted exploration, point them at the README and suggest dropping into the REPL:

```
screenreader repl
```

## URL canonicalization example

Input (Storybook canvas):

```
http://localhost:6006/?path=/story/internal-components-icon-indicator--with-popover
```

Use this (Storybook iframe):

```
http://localhost:6006/iframe.html?id=internal-components-icon-indicator--with-popover&viewMode=story
```

## What this skill does NOT do

- **Resolve URLs from descriptions** ("the IconIndicator with-popover story") — the user or calling skill must provide an explicit URL.
- **Auto-start Storybook** or any dev server.
- **Infer output location from environment.** The user or calling skill passes `--out` when output should land somewhere specific.
- **Update triage docs, paste output into other files, or post anywhere.** Output is files on disk + a chat summary, nothing more.
- **Run `--ai` analysis.** The CLI's AI flag is redundant when Claude is already in the conversation; if the user wants interpretation, they'll ask.
