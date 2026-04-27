Audit a URL or component for screen-reader accessibility using the `screen-reader-cli` skill.

Usage: `/sr-audit <url> [--out <dir>] [--live]`

- `<url>` — full URL or local file path. For Storybook, prefer the iframe form (`/iframe.html?id=...`); the skill canonicalizes canvas URLs (`?path=/story/...`) automatically.
- `--out <dir>` — output directory for audit files. Defaults to `./sr-output/` in cwd.
- `--live` — use real screen reader (VoiceOver on macOS, NVDA on Windows). Default is virtual mode (Snapshot).

Invoke the `screen-reader-cli` skill with these arguments and let the skill drive: preflight → run scan + audit (paired) → save text + JSON files → surface a chat summary with the top critical issues and the file paths.
