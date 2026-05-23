/**
 * Single source of truth for the screen readers the live engine can drive.
 * `scan` (virtual mode) is reader-agnostic and works regardless of this list.
 */

export const SUPPORTED_READERS = {
  voiceover: { label: "VoiceOver", platform: "darwin" },
  nvda: { label: "NVDA", platform: "win32" },
};

export const SUPPORTED_READER_NAMES = Object.keys(SUPPORTED_READERS);

export function readerLabel(name) {
  return SUPPORTED_READERS[name]?.label ?? name;
}

/** Human-readable list, e.g. `voiceover (VoiceOver), nvda (NVDA)`. */
export function supportedReaderList() {
  return SUPPORTED_READER_NAMES.map(
    (name) => `${name} (${SUPPORTED_READERS[name].label})`,
  ).join(", ");
}
