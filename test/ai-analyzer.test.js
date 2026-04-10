import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveProviderAndModel } from "../src/services/ai-analyzer.js";

describe("AI analyzer — provider resolution", () => {
  it("detects anthropic from model shorthand", () => {
    const result = resolveProviderAndModel(undefined, "sonnet");
    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-sonnet-4-6");
  });

  it("detects anthropic from full model ID", () => {
    const result = resolveProviderAndModel(undefined, "claude-haiku-4-5");
    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-haiku-4-5");
  });

  it("detects openai from model name", () => {
    const result = resolveProviderAndModel(undefined, "gpt-4o");
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-4o");
  });

  it("detects openai from shorthand", () => {
    const result = resolveProviderAndModel(undefined, "gpt-4o-mini");
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-4o-mini");
  });

  it("detects gemini from shorthand", () => {
    const result = resolveProviderAndModel(undefined, "flash");
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3-flash-preview");
  });

  it("detects gemini from full model ID", () => {
    const result = resolveProviderAndModel(undefined, "gemini-3-pro-preview");
    assert.equal(result.provider, "gemini");
    assert.equal(result.model, "gemini-3-pro-preview");
  });

  it("uses provider default model when only provider given", () => {
    const result = resolveProviderAndModel("anthropic", undefined);
    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-sonnet-4-6");
  });

  it("uses provider default for openai", () => {
    const result = resolveProviderAndModel("openai", undefined);
    assert.equal(result.model, "gpt-4o-mini");
  });

  it("uses provider default for gemini", () => {
    const result = resolveProviderAndModel("gemini", undefined);
    assert.equal(result.model, "gemini-3-flash-preview");
  });

  it("uses provider default for ollama", () => {
    const result = resolveProviderAndModel("ollama", undefined);
    assert.equal(result.model, "llama3");
  });

  it("respects both provider and model", () => {
    const result = resolveProviderAndModel("anthropic", "opus");
    assert.equal(result.provider, "anthropic");
    assert.equal(result.model, "claude-opus-4-6");
  });

  it("passes through unknown models to ollama", () => {
    const result = resolveProviderAndModel(undefined, "mistral");
    assert.equal(result.provider, "ollama");
    assert.equal(result.model, "mistral");
  });

  it("throws for unknown provider", () => {
    assert.throws(
      () => resolveProviderAndModel("unknown-provider", undefined),
      /Unknown provider/
    );
  });
});
