# Claude Code companion skill

A [Claude Code](https://docs.claude.com/en/docs/claude-code) skill + slash command that wraps `screen-reader-cli`. With these installed, Claude can audit a page or component for screen-reader accessibility on demand — running `scan` and `audit` paired, saving text + JSON to disk, and surfacing the top issues in chat.

## What's here

```
skills/claude-code/
├── README.md                              ← this file
├── screen-reader-cli/
│   └── SKILL.md                           ← the skill
└── sr-audit.md                            ← the slash command (optional)
```

- **`screen-reader-cli/SKILL.md`** — the skill definition. Claude reads its `description` field to decide when to invoke it.
- **`sr-audit.md`** — a slash command that explicitly invokes the skill. Type `/sr-audit <url>` in Claude Code to run an audit.

## Install

Prerequisite: `screen-reader-cli` itself must be installed and on your `PATH`. From the repo root:

```bash
npm link
```

Then copy the skill and slash command into your Claude Code config:

```bash
# Skill (auto-loaded by Claude Code)
mkdir -p ~/.claude/skills/screen-reader-cli
cp skills/claude-code/screen-reader-cli/SKILL.md ~/.claude/skills/screen-reader-cli/

# Slash command (optional but recommended)
mkdir -p ~/.claude/commands
cp skills/claude-code/sr-audit.md ~/.claude/commands/
```

Restart Claude Code (or start a new session). The skill will appear in the available-skills list as `screen-reader-cli`, and `/sr-audit` will be a registered slash command.

## Usage

**Slash command:**

```
/sr-audit https://example.com
/sr-audit https://example.com --out ./my-audits/
/sr-audit https://example.com --live
```

**Implicit invocation** — say something Claude will recognize as an audit request:

> "Run the screen reader on http://localhost:6006/iframe.html?id=button--primary&viewMode=story"
>
> "What does VoiceOver say about https://example.com?"
>
> "Audit this URL for screen reader: https://example.com"

## What the skill does

For each invocation it runs **four** CLI calls and saves the output to `--out <dir>` (or `./sr-output/` by default):

| File                | Source command                              |
| ------------------- | ------------------------------------------- |
| `scan-<slug>.txt`   | `screenreader scan <url>`                   |
| `scan-<slug>.json`  | `screenreader scan <url> --json`            |
| `audit-<slug>.txt`  | `screenreader audit <url> --summary`        |
| `audit-<slug>.json` | `screenreader audit <url> --summary --json` |

Then it summarizes in chat: a one-line headline (`N critical, M moderate, P phrases traversed`), the top 2–3 critical issues inline, and the file paths. Files are the receipt; the chat summary is the headline.

**Live mode (`--live`):** uses real VoiceOver/NVDA via Guidepup. Requires `npx @guidepup/setup` once per machine. macOS or Windows only.

## What the skill does NOT do

- It doesn't resolve URLs from descriptions ("the IconIndicator story") — pass an explicit URL.
- It doesn't auto-start Storybook or any dev server.
- It doesn't infer output location from your environment — pass `--out <dir>` if you want files to land somewhere specific.
- It doesn't run the CLI's `--ai` flag (Claude is already in the conversation; ask it to interpret the output if you want).

## Verifying it works

After install, in any directory:

```bash
mkdir -p /tmp/sr-test
```

In Claude Code:

```
/sr-audit https://example.com --out /tmp/sr-test/
```

Expected: 4 files in `/tmp/sr-test/`, plus a chat summary.

## Source

The CLI and its companion skill are versioned together in this repo.
