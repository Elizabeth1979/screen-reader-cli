/**
 * Live screen reader bridge — drives real VoiceOver (macOS) or NVDA (Windows)
 * via @guidepup/guidepup. Same method shape as bridge.js for consistency.
 */

import {
  SUPPORTED_READERS,
  SUPPORTED_READER_NAMES,
  supportedReaderList,
} from "./readers.js";

// Maps our reader keys to the @guidepup/guidepup export names.
const GUIDEPUP_EXPORTS = { voiceover: "voiceOver", nvda: "nvda" };

const SCAN_HINT =
  'Tip: `screenreader scan <url>` (virtual mode) works on any OS and surfaces the same issues — including the ones JAWS users would hit.';

async function loadReader(name) {
  if (!SUPPORTED_READER_NAMES.includes(name)) {
    throw new Error(
      `Unknown screen reader: "${name}". Live mode supports: ${supportedReaderList()}. ` +
        `Real JAWS automation isn't supported (no compatible automation API). ${SCAN_HINT}`,
    );
  }
  // Dynamic import so we only load the reader we need.
  const gp = await import("@guidepup/guidepup");
  return gp[GUIDEPUP_EXPORTS[name]];
}

export function detectReader() {
  const match = SUPPORTED_READER_NAMES.find(
    (name) => SUPPORTED_READERS[name].platform === process.platform,
  );
  if (match) return match;
  throw new Error(
    `Unsupported platform: ${process.platform}. Live mode requires macOS (VoiceOver) or Windows (NVDA). ` +
      SCAN_HINT,
  );
}

export async function createLiveBridge(readerName) {
  const name = readerName || detectReader();
  const reader = await loadReader(name);
  let started = false;

  return {
    readerName: name,

    async start() {
      if (!started) {
        await reader.start();
        started = true;
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
