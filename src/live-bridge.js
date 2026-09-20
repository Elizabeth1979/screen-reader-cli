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

    // Guidepup polls for VoiceOver to come up and gives up after 10s by
    // default. That is not enough on a cold start: VoiceOver's own launch takes
    // several seconds before it answers AppleScript, and guidepup stores and
    // rewrites VoiceOver's settings before it even begins waiting. The timeout
    // then fires with "Timed out waiting for VoiceOver to be running" while
    // VoiceOver is in fact starting — and it is left running, holding the
    // machine, because the failure happened mid-startup.
    async start({ timeout = 45000 } = {}) {
      if (!started) {
        try {
          await reader.start({ pollTimeout: timeout });
          started = true;
        } catch (err) {
          // Leaving a half-started screen reader behind takes over the user's
          // machine with no obvious way back, so always try to put it away.
          await reader.stop().catch(() => {});
          throw new Error(explainStartFailure(err, timeout));
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

/**
 * Turn a screen-reader start failure into something actionable.
 *
 * Guidepup ships per-macOS-version assets and hardcodes a launcher path, so on
 * a macOS it does not yet support the failure surfaces as "VoiceOver cannot be
 * started", a missing-file error, or a timeout — none of which name the cause.
 * That sends people to Accessibility permissions, which are not involved, and
 * the upstream issue for it (guidepup/guidepup#149) is specifically about the
 * cause being hidden.
 *
 * So diagnose it here rather than pre-emptively refusing to run: the check is
 * advisory, and the day guidepup adds support this code simply stops matching
 * and nothing is blocked.
 */
export function explainStartFailure(err, timeout, env = {}) {
  // Platform and release are injected rather than read directly so the
  // diagnosis is testable on any host. Without this the tests only exercise
  // this branch on a Mac, and CI — which runs on Linux — silently covers
  // nothing while still reporting green.
  const platform = env.platform ?? process.platform;
  const release = env.release ?? os.release();
  const raw = [err?.message, err?.cause?.message].filter(Boolean).join(" — ");
  const unsupported =
    /VoiceOverStarter|no such file|not supported|manifest|no manifest asset/i.test(
      raw,
    );
  if (platform === "darwin" && unsupported) {
    // Deliberately no Darwin-to-macOS conversion: the old offset (Darwin 23 =
    // macOS 14) stopped holding when Apple moved to year-based versions, so a
    // computed number here would be confidently wrong. Print what was measured.
    return (
      `${raw}\n\n` +
      `This is almost certainly an unsupported macOS, not a permissions problem.\n` +
      `Guidepup ships per-version assets and hardcodes VoiceOver's launcher path;\n` +
      `this machine reports Darwin ${release}.\n` +
      `Confirm with:  npx @guidepup/setup install voiceover\n` +
      `Upstream issue: https://github.com/guidepup/guidepup/issues/149\n` +
      `Everything except live mode still works — scan and audit need no screen reader.`
    );
  }
  return (
    `${raw}. The screen reader did not finish starting within ${timeout}ms. ` +
    `Check that automation is permitted (npx @guidepup/setup setup), ` +
    `or raise the limit with --start-timeout.`
  );
}
