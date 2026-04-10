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
