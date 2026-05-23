# screen-reader-cli — One-page Overview

_A plain-language summary for anyone deciding whether this tool is worth adopting. No coding knowledge needed._

## What it is

**An automated blind user you can point at any web page.** Millions of people browse the web with a screen reader — software that reads pages aloud and lets them navigate without a mouse. If a page is built carelessly, those users get "button button button" with no idea what anything does, forms they can't fill in, and images described as nothing at all.

`screen-reader-cli` checks a page the way a screen reader experiences it and reports exactly what's broken — in seconds, automatically, with no real screen reader required.

## Why it matters

- **Legal risk.** Web accessibility is a legal requirement in many markets (ADA in the US, the European Accessibility Act, and similar laws elsewhere). Inaccessible sites draw complaints and lawsuits.
- **Excluded customers.** Roughly 1 in 6 people live with a disability. An inaccessible checkout, sign-up, or booking flow simply loses those customers.
- **Cheaper when caught early.** Finding an issue while a page is still being built costs minutes. Finding it after launch — or in a legal complaint — costs far more.

## How it works (in four steps)

1. **You give it a web address** (or a page file).
2. **It opens the page** in an invisible browser, exactly as a visitor would see it.
3. **It inspects the page** the way a screen reader would — checking that buttons have names, images have descriptions, headings are in order, forms are labeled, and the page structure makes sense.
4. **It hands back a report** — a readable list, a shareable visual report, or machine-readable data that can automatically **block a broken page from going live**.

## What's possible today

- **Scan any public page or staging URL** and get a prioritized list of issues (most serious first), each with a plain explanation and a suggested fix.
- **Catch problems automatically before release** — wired into the release process, it can stop a page with serious issues from shipping.
- **Hear the real thing** — on Mac and Windows it can drive an actual screen reader (VoiceOver or NVDA) and capture what gets spoken aloud.
- **Optional AI explanations** — turn technical findings into clear, prioritized recommendations.
- **Shareable reports** — a visual report (with a screenshot) suitable for handing to designers or stakeholders.

## What to watch for (honest limits)

- **It's a first line of defense, not the whole defense.** Automated checks reliably catch the common, mechanical mistakes. They can't judge whether a description is *meaningful* or whether a page *makes sense* read aloud — important pages still deserve a human check.
- **It checks one page at a time.** A large site is covered by scanning its key pages.
- **It can't see behind a login.** It checks public or staging pages; pages that require signing in aren't reached today.
- **Live (real screen reader) testing runs on Mac/Windows only.** The automated scan, however, runs anywhere and gives the same findings.

## Screen reader coverage

| Screen reader            | Can we drive the real thing? | Do our findings apply? |
| ------------------------ | ---------------------------- | ---------------------- |
| **NVDA** (Windows, free) | Yes                          | Yes                    |
| **VoiceOver** (Mac)      | Yes                          | Yes                    |
| **JAWS** (Windows, paid) | No — it can't be automated   | **Yes**                |

A common question: _"What about JAWS?"_ JAWS is widely used but cannot be remote-controlled by any tool. That doesn't leave a gap: the scan checks the page's underlying structure against the **shared industry standards** that NVDA, VoiceOver, **and** JAWS all follow. If the scan flags a problem, it affects JAWS users too.

## What's on the roadmap

- Tighter fit into automated release pipelines (standard report formats, an off-the-shelf GitHub action).
- A **designer-facing** direction: checking **Figma designs** for accessibility _before_ they're built, and flagging mismatches between the design and the shipped page.

---

_For hands-on instructions see the [usage guide](usage-guide.md); for the full command reference see the [README](../README.md)._
