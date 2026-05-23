import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED_READERS,
  SUPPORTED_READER_NAMES,
  readerLabel,
  supportedReaderList,
} from "../src/readers.js";

describe("readers — single source of truth", () => {
  it("exposes voiceover and nvda", () => {
    assert.deepEqual(SUPPORTED_READER_NAMES.sort(), ["nvda", "voiceover"]);
    assert.equal(SUPPORTED_READERS.voiceover.platform, "darwin");
    assert.equal(SUPPORTED_READERS.nvda.platform, "win32");
  });

  it("readerLabel returns the display label", () => {
    assert.equal(readerLabel("voiceover"), "VoiceOver");
    assert.equal(readerLabel("nvda"), "NVDA");
  });

  it("readerLabel falls back to the raw name for unknown readers", () => {
    assert.equal(readerLabel("jaws"), "jaws");
  });

  it("supportedReaderList names every reader", () => {
    const list = supportedReaderList();
    assert.ok(list.includes("VoiceOver"));
    assert.ok(list.includes("NVDA"));
  });
});
