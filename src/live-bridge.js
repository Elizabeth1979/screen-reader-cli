import fs from "node:fs";
import os from "node:os";

/**
 * Live screen reader bridge — drives real VoiceOver (macOS) or NVDA (Windows)
 * via @guidepup/guidepup. Same method shape as bridge.js for consistency.
 */

let voiceOverModule;
let nvdaModule;

async function loadReader(name) {
  // Dynamic import so we only load the reader we need
  const gp = await import("@guidepup/guidepup");
  if (name === "voiceover") {
    voiceOverModule = gp.voiceOver;
    return voiceOverModule;
  }
  if (name === "nvda") {
    nvdaModule = gp.nvda;
    return nvdaModule;
  }
  throw new Error(`Unknown screen reader: ${name}. Use "voiceover" or "nvda".`);
}

export function detectReader() {
  if (process.platform === "darwin") return "voiceover";
  if (process.platform === "win32") return "nvda";
  throw new Error(
    `Unsupported platform: ${process.platform}. Live mode requires macOS (VoiceOver) or Windows (NVDA).`
  );
}

export async function createLiveBridge(readerName) {
  const name = readerName || detectReader();
  const reader = await loadReader(name);
  let started = false;

  return {
    readerName: name,

    // Guidepup owns the wait for the screen reader to come up: since 0.36 it
    // tries twice and waits 30s each time, enough for a cold VoiceOver start.
    // It takes no limit from the caller, so this passes none.
    async start() {
      if (!started) {
        try {
          await reader.start();
          started = true;
        } catch (err) {
          // Leaving a half-started screen reader behind takes over the user's
          // machine with no obvious way back, so always try to put it away.
          await reader.stop().catch(() => {});
          throw new Error(explainStartFailure(err));
        }
      }
    },

    async stop() {
      if (started) {
        await reader.stop();
        started = false;
      }
    },

    async next() {
      await reader.next();
      return reader.lastSpokenPhrase();
    },

    async previous() {
      await reader.previous();
      return reader.lastSpokenPhrase();
    },

    async interact() {
      await reader.interact();
      return reader.lastSpokenPhrase();
    },

    async stopInteracting() {
      await reader.stopInteracting();
      return reader.lastSpokenPhrase();
    },

    async lastSpokenPhrase() {
      return reader.lastSpokenPhrase();
    },

    async spokenPhraseLog() {
      return reader.spokenPhraseLog();
    },

    async itemText() {
      return reader.itemText();
    },

    async perform(commandKey) {
      const command = reader.keyboardCommands[commandKey];
      if (!command) {
        throw new Error(
          `Unknown command: ${commandKey}. Available: ${Object.keys(reader.keyboardCommands).join(", ")}`
        );
      }
      await reader.perform(command);
      return reader.lastSpokenPhrase();
    },

    async act() {
      await reader.act();
      return reader.lastSpokenPhrase();
    },

    async press(key) {
      await reader.press(key);
      return reader.lastSpokenPhrase();
    },

    async type(text) {
      await reader.type(text);
      return reader.lastSpokenPhrase();
    },
  };
}

// Guidepup launches VoiceOver one of two ways and picks by Darwin version
// (guidepup/guidepup#151): from Darwin 27 it opens VoiceOver.app, because
// macOS 27 removed the VoiceOverStarter binary it ran before.
const VOICE_OVER_APP = "/System/Library/CoreServices/VoiceOver.app";
const VOICE_OVER_STARTER = `${VOICE_OVER_APP}/Contents/MacOS/VoiceOverStarter`;

/** The path Guidepup will launch VoiceOver through on this Darwin release. */
export function voiceOverLauncher(release = os.release()) {
  return Number(release.split(".", 1)[0]) >= 27
    ? VOICE_OVER_APP
    : VOICE_OVER_STARTER;
}

const STILL_WORKS =
  `What still works — neither needs a real screen reader:\n` +
  `  screenreader scan <url>    accessibility checks + page structure\n` +
  `  screenreader audit <url>   full traversal with the virtual screen reader`;

/**
 * Decide whether live mode can work, BEFORE launching a browser or touching the
 * screen reader.
 *
 * Without this, a failed start can leave VoiceOver half-started holding the
 * machine, and the error reads as a permissions problem — which is how an hour
 * goes to Accessibility settings that are not involved. One stat call turns
 * that into an immediate, honest refusal.
 *
 * It checks for the launcher Guidepup will actually use, by the same rule
 * Guidepup uses to choose it, so the two cannot disagree.
 */
export function preflightLiveMode({
  platform = process.platform,
  release = os.release(),
  exists = (p) => fs.existsSync(p),
} = {}) {
  if (platform !== "darwin") return { ok: true };
  const launcher = voiceOverLauncher(release);
  if (exists(launcher)) return { ok: true };
  return {
    ok: false,
    reason:
      `Live mode cannot start VoiceOver on this machine (Darwin ${release}).\n\n` +
      `This is not a permissions problem. The screen-reader driver launches\n` +
      `VoiceOver through a path that does not exist here:\n` +
      `  ${launcher}\n\n` +
      `Report it with that path: https://github.com/Elizabeth1979/screen-reader-cli/issues\n\n` +
      STILL_WORKS,
  };
}

/**
 * Turn a screen-reader start failure into something actionable.
 *
 * On a macOS Guidepup does not support yet, it refuses with "macOS version not
 * supported" before touching VoiceOver. Wrapped in "VoiceOver cannot be
 * started", that reads as a permissions problem, so name the cause outright.
 */
export function explainStartFailure(err, env = {}) {
  // Platform and release are injected rather than read directly so the
  // diagnosis is testable on any host. Without this the tests only exercise
  // this branch on a Mac, and CI — which runs on Linux — silently covers
  // nothing while still reporting green.
  const platform = env.platform ?? process.platform;
  const release = env.release ?? os.release();
  const raw = [err?.message, err?.cause?.message].filter(Boolean).join(" — ");
  const unsupported = /not supported|no such file|VoiceOverStarter/i.test(raw);
  if (platform === "darwin" && unsupported) {
    // Deliberately no Darwin-to-macOS conversion: the offset changed when Apple
    // moved to year-based versions, so a computed number could be confidently
    // wrong. Print what was measured.
    return (
      `${raw}\n\n` +
      `This is an unsupported macOS, not a permissions problem: the screen-reader\n` +
      `driver (Guidepup) has no support for Darwin ${release} yet. A newer\n` +
      `screen-reader-cli may have it.\n\n` +
      STILL_WORKS
    );
  }
  return (
    `${raw}. The screen reader did not finish starting. ` +
    `Check that automation is permitted (npx @guidepup/setup setup).`
  );
}
