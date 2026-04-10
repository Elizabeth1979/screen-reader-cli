/**
 * AI-powered accessibility analysis — multi-provider, zero SDK dependencies.
 *
 * Supported providers:
 *   anthropic  → Claude (ANTHROPIC_API_KEY)
 *   openai     → GPT   (OPENAI_API_KEY)
 *   gemini     → Gemini (GEMINI_API_KEY) — uses OpenAI-compatible endpoint
 *   ollama     → Local  (no key, runs on localhost:11434)
 */

// ── Provider configs ────────────────────────────────────────────────────────

const PROVIDERS = {
  anthropic: {
    url: "https://api.anthropic.com/v1/messages",
    keyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-sonnet-4-6",
    models: {
      haiku: "claude-haiku-4-5",
      sonnet: "claude-sonnet-4-6",
      opus: "claude-opus-4-6",
    },
  },
  openai: {
    url: "https://api.openai.com/v1/chat/completions",
    keyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    models: {
      "gpt-4o": "gpt-4o",
      "gpt-4o-mini": "gpt-4o-mini",
      "o3-mini": "o3-mini",
    },
  },
  gemini: {
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    defaultModel: "gemini-3-flash-preview",
    models: {
      flash: "gemini-3-flash-preview",
      pro: "gemini-3-pro-preview",
    },
  },
  ollama: {
    url: "http://localhost:11434/v1/chat/completions",
    keyEnv: null,
    defaultModel: "llama3",
    models: {},
  },
};

// ── Model → provider auto-detection ─────────────────────────────────────────

const MODEL_PREFIXES = [
  [/^claude-/, "anthropic"],
  [/^(gpt-|o\d)/, "openai"],
  [/^gemini-/, "gemini"],
];

function detectProvider(model) {
  for (const [pattern, provider] of MODEL_PREFIXES) {
    if (pattern.test(model)) return provider;
  }
  return null;
}

// ── Resolve provider + model from user flags ────────────────────────────────

export function resolveProviderAndModel(providerFlag, modelFlag) {
  // If both specified, use as-is
  if (providerFlag && modelFlag) {
    const cfg = PROVIDERS[providerFlag];
    if (!cfg) throw new Error(`Unknown provider: ${providerFlag}. Use: ${Object.keys(PROVIDERS).join(", ")}`);
    const resolvedModel = cfg.models[modelFlag] || modelFlag;
    return { provider: providerFlag, model: resolvedModel };
  }

  // If only model specified, detect provider
  if (modelFlag && !providerFlag) {
    // Check shorthand aliases across all providers
    for (const [name, cfg] of Object.entries(PROVIDERS)) {
      if (cfg.models[modelFlag]) {
        return { provider: name, model: cfg.models[modelFlag] };
      }
    }
    // Try prefix detection
    const detected = detectProvider(modelFlag);
    if (detected) return { provider: detected, model: modelFlag };
    // Assume ollama for unrecognized models
    return { provider: "ollama", model: modelFlag };
  }

  // If only provider specified, use its default model
  if (providerFlag && !modelFlag) {
    const cfg = PROVIDERS[providerFlag];
    if (!cfg) throw new Error(`Unknown provider: ${providerFlag}. Use: ${Object.keys(PROVIDERS).join(", ")}`);
    return { provider: providerFlag, model: cfg.defaultModel };
  }

  // Neither specified — pick the first provider with an available API key
  // Priority: gemini (free tier) > anthropic > openai > ollama
  for (const name of ["gemini", "anthropic", "openai", "ollama"]) {
    const cfg = PROVIDERS[name];
    if (!cfg.keyEnv || process.env[cfg.keyEnv]) {
      return { provider: name, model: cfg.defaultModel };
    }
  }

  throw new Error(
    "No AI provider configured. Set one of: GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY — or install Ollama for local models."
  );
}

// ── Build the analysis prompt ───────────────────────────────────────────────

function buildPrompt(scanResults) {
  const { url, title, violations, headings, stats } = scanResults;

  const violationSummary = violations
    .map(
      (v) =>
        `- [${v.severity}] ${v.message}${v.element?.selector ? ` (${v.element.selector})` : ""}${v.wcag ? ` — WCAG ${v.wcag}` : ""}`
    )
    .join("\n");

  const headingSummary = headings
    .map((h) => `${"  ".repeat(h.level - 1)}h${h.level}: ${h.text.slice(0, 60)}`)
    .join("\n");

  return `You are an accessibility expert. Analyze these screen reader scan results and provide actionable guidance.

## Page
- URL: ${url}
- Title: ${title}
- DOM elements: ${stats.domElements}
- Headings: ${stats.headingCount}
- Landmarks: ${stats.landmarkCount}

## Violations Found (${stats.violationCount} total: ${stats.critical} critical, ${stats.moderate} moderate, ${stats.minor} minor)

${violationSummary || "None"}

## Heading Structure

${headingSummary || "No headings found"}

## Instructions

Provide your analysis in this format:

### Summary
A 2-3 sentence overview of the page's screen reader accessibility.

### Priority Fixes
For each issue (most critical first):
1. **What's wrong** — plain language, no jargon
2. **Who it affects** — how this impacts screen reader users specifically
3. **How to fix it** — concrete code example or change
4. **WCAG reference** — which success criterion applies

### What's Working Well
Note anything positive about the page's accessibility (good heading structure, proper landmarks, etc.)

### Screen Reader Experience Score
Rate 1-10 based on how usable this page would be for a screen reader user, with a brief justification.

Keep the tone practical and educational — this should help developers understand *why* each fix matters for real screen reader users, not just check compliance boxes.`;
}

// ── HTTP calls per provider ─────────────────────────────────────────────────

async function callAnthropic(apiKey, model, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAICompatible(url, apiKey, model, prompt) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ── Main export ─────────────────────────────────────────────────────────────

export async function analyzeWithAI(scanResults, { provider, model }) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);

  const apiKey = cfg.keyEnv ? process.env[cfg.keyEnv] : null;
  if (cfg.keyEnv && !apiKey) {
    throw new Error(
      `${cfg.keyEnv} environment variable is not set. Required for ${provider} provider.`
    );
  }

  const prompt = buildPrompt(scanResults);

  if (provider === "anthropic") {
    return callAnthropic(apiKey, model, prompt);
  }

  return callOpenAICompatible(cfg.url, apiKey, model, prompt);
}
