# Development log

A plain-language record of what happened in this repo and why — written so
future-us can come back and understand each decision without reading code.
Newest entries first.

---

## 2026-09-20 — Backward traversal, and a macOS that live mode cannot run on

`--direction forward|backward|both` on `live read`
([#23](https://github.com/Elizabeth1979/screen-reader-cli/issues/23)). The bug
class it exists for is asymmetry: a focus guard that catches focus without
direction awareness behaves perfectly forward and misbehaves only in reverse, so
a forward-only tool reports a clean pass on a genuinely broken page.

`backward` always measures from the end, because reversing from the top is a
no-op — "walk to the end, then back" is the only reading that tests anything.
That makes `both` the primitive and the other two views of it.

Three stop conditions on the reverse walk, and the middle one is the finding:
announcements run out; an element is announced twice, which is a *wrap* rather
than stopping at the boundary and is the reported defect's actual signature; or
the walk steps back out of the web area into the browser's chrome, which is not
the page and is dropped rather than logged as content.

**The comparison deliberately stops short of a verdict on ordering.** A screen
reader phrases the same element differently depending on which way you reach it
— "list 2 items" entering, "end of list" leaving — so an exact mirror is the
wrong expectation and claiming to detect mis-ordering would produce noise a
reader learns to ignore. What is reportable is an element reached in one
direction and not the other, which is exactly the shape of the reported bug.
Container open/close and positional chatter are collapsed first, or every list
and dialog on the page shows as a one-sided difference and buries the finding.

## Live mode cannot run on macOS 27 — upstream, not ours

Verification was blocked. Guidepup hardcodes
`/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter`,
which does not exist on macOS 27; the directory holds only `VoiceOver`.
Confirmed not to be ours and not fixable here:

- **Upgrading does not help.** 0.34.0, ten minor versions newer, hardcodes the
  same path — read directly from its tarball rather than assumed.
- **VoiceOver itself starts fine** via `tell application "VoiceOver" to
  activate`. Only guidepup's launcher is broken. But its commands then refuse
  with "VoiceOver not running", because its own `started` flag was never set, so
  starting the reader separately is not a workaround.
- **Already reported upstream**: guidepup/guidepup#149, open since 2026-09-15,
  filed from this same Darwin 27.0.0 build 26A428.

So `--direction` ships covered by unit tests against a fake bridge and **not
verified against real VoiceOver**. Stated plainly rather than implied.

What *was* shipped for it: the failure now explains itself. The upstream issue's
own complaint is that the cause is hidden — the error reads as a permissions
problem, so the first hour goes to Accessibility settings that are not involved.
`explainStartFailure` recognises the unsupported-platform shapes, says outright
that permissions are not the cause, links the upstream issue, and notes that
`scan` and `audit` need no screen reader and still work. It diagnoses rather
than pre-emptively refusing, so the day guidepup adds support nothing here
blocks.

One thing caught before shipping: the first draft printed "macOS 18-ish" from
`Darwin major - 9`. That offset stopped holding when Apple moved to year-based
versions. The conversion was removed rather than corrected — printing what was
measured beats computing a number that is confidently wrong.

---

## 2026-09-20 — The CLI now says when it is out of date

Nothing told anyone to update. npm never notifies; you have to think to run
`npm outdated -g`. So someone who installed 0.1.0 in July was still on 0.1.0
after five releases, with no signal. That is not hypothetical — it produced
issue #12, a README bug filed against the published 0.1.0 while the repo had
been fixed for a fortnight. The fix existed; nothing said to pull it.

The CLI now checks once a day and prints a short notice.

**Hand-rolled rather than `update-notifier`.** That package pulls in 46
transitive dependencies and 3.4 MB, measured, for behaviour covered here in
about 40 lines. What it genuinely buys is careful edge-case handling, so those
cases are implemented deliberately and tested one at a time — they are the real
risk, not the message:

- **Never writes to stdout.** `--json` output is parsed by other programs. The
  notice goes to stderr, and a test asserts the JSON still parses.
- **Never speaks unless a human is watching.** If stderr is not a TTY the output
  is being piped or captured, and a friendly line there is noise nobody reads
  and something might parse. Also skipped in CI, and by `NO_UPDATE_NOTIFIER`.
- **Never delays the command.** Cached for a day, 1.5s timeout, and run *after*
  the command's own work rather than before it. Measured: `--version` is ~175ms
  with the notice wired in, unchanged.
- **Never fails the command.** Offline, rate-limited, malformed — every path
  returns silently.

**The message is ordered for screen readers, which is the part worth
recording.** A terminal has no way to skip ahead: a screen reader reads output
straight through, so ordering is the only lever available — there is no
`aria-hidden` and no landmark to jump past. The version change and the command
therefore come first and the decoration last, so anyone listening has the point
before the waveform starts.

An earlier draft announced the art ("decorative graphic follows"). It was cut:
on a web page that works because the user can skip, and in a terminal they
cannot, so it added a line to listen to before the noise it was warning about
and delivered a promise the medium cannot keep. Ruled out for the same reason:
a face drawn in ASCII, which carries no information and reads as a string of
parentheses.

---

## 2026-09-18 — Live mode reads the page at last

`live read` and `live test` produced no page content at all on macOS. Both only
stepped forward, and forward movement does not descend into a web area:
VoiceOver walks the browser's own chrome, stops at the boundary, and announces
"to enter the web area, press Control-Option-Shift-Down Arrow" — literally
saying the thing the tool was failing to send. The repeat-detector then bailed
once that line came back three times, so the command exited looking finished.
`interact()` had been on the bridge the whole time and was never called
([#11](https://github.com/Elizabeth1979/screen-reader-cli/issues/11)).

Both subcommands now walk to the boundary, send it, and traverse from inside.
Browser-chrome announcements are dropped with a count on stderr rather than
silently, because they are an artefact of driving the browser, not a finding
about the page. Gated to VoiceOver; NVDA has no such boundary.

**Two further defects that only a real run could have found**, which is the
argument for doing the run rather than trusting a green suite:

- **VoiceOver never started.** Guidepup waits 10s for it to report itself
  running, then fails. Measured here, the three start conditions all passed at
  about 6s — after guidepup had already given up, and with VoiceOver left
  running, holding the machine. `start()` now waits 45s, always stops the reader
  if it throws, and says what to try next. `--start-timeout` exposes the limit.
- **The page's first element was silently missing.** `interact()` lands the
  cursor *on* the first element inside the web area and announces it, so
  stepping with `next()` from there skips it. Every traversal lost the page's
  `h1` while all eleven unit tests passed — the fake reader could not know where
  a real cursor lands. Now captured as entry one, and pinned by a test.

Verified against the issue's own repro: previously 7 announcements, none of them
page content, ending in a false `[possible-loop]`. Now 5 announcements —
heading, list, both items, end of list — and `live test` reports no issues
instead of a phantom loop.

One environment note for anyone reproducing this: the machine must allow the
controlling process to send keystrokes, since every VoiceOver command is one.
Without it VoiceOver starts and then every command fails with "osascript is not
allowed to send keystrokes (1002)".

---

## 2026-09-17 — The docs page stopped passing its own test

`node bin/cli.js scan docs/index.html --fail-on minor` was exiting 1 on three
colour-contrast violations. The site advertises that it passes its own check, so
that claim had quietly become false.

**Cause: a class-name collision, not a colour choice.** Two unrelated components
both used `.who` — the "who is this for" card grid, and the small
"SCREEN READER SAYS" label inside the dark caption bubble. The card rule sets a
white card background, so that white landed behind the bubble's label, which is
coloured pale blue precisely because it was designed to sit on the dark bubble.
Pale blue on near-white measured **1.62:1** against a 4.5:1 requirement.

Fixed by renaming the label to its own `.speaker` class. An override
(`background: transparent` on `.bubble .who`) would have cleared the violation
while leaving two components sharing a name and waiting to collide again.

Worth recording how it was diagnosed, because the first two guesses were wrong.
The element is animated and named `.bubble.rise`, which invited "the contrast is
being sampled mid-animation" — plausible, and false. Reading axe's own measured
values settled it in one step: it reported `bgColor: #fffefb`, a near-white the
bubble does not contain anywhere. Walking the ancestor chain then showed the
white was painted by the span itself, not inherited. The guess came from the
element's name; the answer came from the data.

Verified with the tool itself: `scan docs/index.html --fail-on minor` now exits
0 with zero violations, and the label's computed background is transparent, so
it sits on the bubble at roughly 10:1.

---

## 2026-09-17 — Docs for the reach flags; #12 was already fixed

README gains a "Reaching a component's real state" section covering `--open`,
`--open-target`, `--open-wait`, `--type`, `--type-wait`, `--local-storage` and
`--session-storage` in one table, for both `audit` and `scan`.

Issue #12 (README leading with clone instead of the npm install) turned out to
be **already fixed** — on 2026-07-24, two weeks before the issue was filed. The
issue was written against the published 0.1.0 tarball, whose README still had
the old text; the repo had moved on but not been republished. Verified by
downloading the current published package and reading its README, not by
reading the repo. Closed, not reimplemented.

Also noted, not fixed here: `docs/index.html` no longer passes its own
`--fail-on minor` check. An animated `.bubble` element fails colour contrast,
and the count varies between runs because the contrast is sampled mid-animation.
Pre-existing on `main` — confirmed by scanning `main` in a scratch worktree —
so it is out of scope for this branch and wants its own fix.

---

## 2026-09-17 — One shared way to reach the state worth measuring

`audit` walks a page element by element and prints what a screen reader would
say. Point it at a modal and the whole traversal was "Open Modal button, end of
document" — the dialog's own heading, body and close button were never reached,
because the dialog was never opened. `scan` could click a component open before
measuring it; `audit` could not
([#22](https://github.com/Elizabeth1979/screen-reader-cli/issues/22)).

`audit` now takes the same reach flags `scan` has: `--open`, `--open-wait`,
`--open-target`, `--type`, `--type-wait` and `--session-storage`. Giving it only
`--open` would have fixed modals and left anything gated on typed input still
unreachable — the same gap one level down.

They are the same code, not a copy. `openAndSettle` and `typeIntoFields` moved
out of `scan.js` into **`src/page-state.js`**, which both commands import. What
state a component is in is a question about the page, not about the engine
looking at it, so a flag existing on one command and not the other is exactly
the bug being fixed. They live there rather than in `util.js` because `util.js`
holds small pure helpers, while these drive a live page and warn on stderr.

Two things worth recording:

- **The virtual screen reader tracks the live DOM.** Nodes that appear after it
  starts are announced normally, so the overlay can be opened after `openPage`
  rather than needing a new hook before the reader boots. Checked directly
  against a fixture before designing around it.
- **`--session-storage` needed seeding in the bridge too**, not just in `scan`,
  since `audit` builds its own browser context.

---

## 2026-09-17 — Reaching states a click alone cannot open

`--open` could click a component open, but plenty of components are still
empty once open. A command palette renders its results only after you type
something, or if it remembers your earlier searches. Open it with a click and
nothing is there — so the scan reported a clean pass over an empty dialog,
and the option rows that three accessibility tickets were actually about were
never looked at ([#15](https://github.com/Elizabeth1979/screen-reader-cli/issues/15)).

Two new ways to reach that state:

- **`--type <selector>=<text>`** — types into a field after the overlay opens.
  Keys are sent one at a time rather than the value being set in one go,
  because most comboboxes and palettes branch on each keystroke, not on a
  single change event. Repeatable. `--type-wait` (default 600 ms) covers
  components that debounce before rendering.
- **`--session-storage <key=value>`** — seeds sessionStorage before the page
  loads, mirroring `--local-storage`. Components that gate content on
  prior-session data (recent searches, a dismissed banner) read this store,
  and only localStorage could be seeded before.

Parsing `<selector>=<text>` needed its own splitter rather than the existing
`key=value` one. CSS attribute selectors carry their own equals sign and are
the common case here, so splitting on the first `=` would turn
`[role=combobox]=hello` into the selector `[role`. Splitting on the last one
breaks the other way, on typed text containing an equals sign. The splitter
takes the first `=` that sits outside brackets, parentheses and quotes — the
one place a selector cannot put one — so both forms split where a reader
expects.

**Known limit:** the test fixture renders synchronously. A real palette
debounces and fetches, so the async path is covered by `--type-wait` by
design but is not exercised by the suite.

Not built: the issue also floated warning when an opened subtree is
suspiciously small. It guesses at a threshold and the reach mechanisms are
the real fix, so it was left out.

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
- **Deleted a private one-off debug script** that had been committed by mistake.
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

Driven by the first real-world scan of a production site: 67 table rows that
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
