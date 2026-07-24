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

  const violationList = violations
    .map(
      (v, i) =>
        `${i}: [${v.severity}] ${v.message}${v.element?.selector ? ` (${v.element.selector})` : ""}${v.wcag ? ` — WCAG ${v.wcag}` : ""}`
    )
    .join("\n");

  return `You are an accessibility expert. Analyze these scan results and return ONLY valid JSON — no markdown, no explanation, no code fences.

## Page: ${title} (${url})
DOM elements: ${stats.domElements} | Headings: ${stats.headingCount} | Landmarks: ${stats.landmarkCount}

## Violations (${stats.violationCount} total: ${stats.critical} critical, ${stats.moderate} moderate, ${stats.minor} minor)

${violationList || "None"}

## Heading Structure
${headings.map((h) => `${"  ".repeat(h.level - 1)}h${h.level}: ${h.text.slice(0, 60)}`).join("\n") || "No headings"}

## Required JSON format

Return EXACTLY this structure. "fixes" array must have one entry per violation above, matched by index. Each "fix" must be 1-2 sentences max — a concrete action the developer should take. "impact" must be 1 sentence explaining why a screen reader user is affected. "summary" is 2-3 sentences total. "score" is 1-10.

{"summary":"...","score":7,"fixes":[{"index":0,"fix":"...","impact":"..."},{"index":1,"fix":"...","impact":"..."}]}

CRITICAL: Return raw JSON only. No markdown. No \`\`\`json. No explanation before or after.`;
}

// ── HTTP calls per provider ─────────────────────────────────────────────────

async function callAnthropic(apiKey, model, prompt) {
  const res = await fetch(PROVIDERS.anthropic.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
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
      max_tokens: 8192,
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

  const raw =
    provider === "anthropic"
      ? await callAnthropic(apiKey, model, prompt)
      : await callOpenAICompatible(cfg.url, apiKey, model, prompt);

  return parseAIResponse(raw, scanResults.violations);
}

/**
 * Attempt to repair malformed JSON from LLM output:
 * - Escapes unescaped double quotes inside string values
 * - Closes truncated JSON (missing closing braces/brackets)
 */
function repairJSON(raw) {
  // State machine: rebuild JSON, escaping interior quotes in strings
  let out = "";
  let inStr = false;
  let esc = false;
  const stack = []; // track expected closers

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (esc) {
      out += ch;
      esc = false;
      continue;
    }

    if (ch === "\\") {
      out += ch;
      esc = true;
      continue;
    }

    if (ch === '"') {
      if (!inStr) {
        // Opening a string
        inStr = true;
        out += ch;
      } else {
        // Is this the real end of the string, or an unescaped interior quote?
        // Look ahead: if next non-whitespace is : , } ] or end-of-input, it's a real close
        let j = i + 1;
        while (j < raw.length && (raw[j] === " " || raw[j] === "\n" || raw[j] === "\r" || raw[j] === "\t")) j++;
        const next = raw[j];
        if (!next || next === ":" || next === "," || next === "}" || next === "]") {
          inStr = false;
          out += ch;
        } else {
          // Interior quote — escape it
          out += '\\"';
        }
      }
      continue;
    }

    if (!inStr) {
      if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }

    out += ch;
  }

  // Close any remaining open structures (truncated response)
  if (inStr) out += '"'; // close dangling string
  // Trim trailing partial key-value
  out = out.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, "");
  out += stack.reverse().join("");

  return out;
}

/**
 * Parse the AI's JSON response and merge fixes into violation objects.
 * Returns { summary, score, violations } where each violation gets
 * an `aiFix` and `aiImpact` field.
 */
function parseAIResponse(raw, violations) {
  let parsed;
  const trimmed = raw.trim();

  // Try 1: parse raw directly
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Try 2: strip markdown code fences
    const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      try { parsed = JSON.parse(fenceMatch[1].trim()); } catch {}
    }
    // Try 3: find the outermost JSON object by brace-counting
    if (!parsed) {
      const start = trimmed.indexOf("{");
      if (start !== -1) {
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < trimmed.length; i++) {
          const ch = trimmed[i];
          if (escape) { escape = false; continue; }
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") depth++;
          if (ch === "}") { depth--; if (depth === 0) { try { parsed = JSON.parse(trimmed.slice(start, i + 1)); } catch {} break; } }
        }
      }
    }
    // Try 4: repair truncated JSON and fix unescaped quotes
    if (!parsed) {
      const start = trimmed.indexOf("{");
      if (start !== -1) {
        let candidate = repairJSON(trimmed.slice(start));
        try { parsed = JSON.parse(candidate); } catch {}
      }
    }
    // Fallback: return raw text as summary, no per-issue fixes
    if (!parsed) {
      return { summary: raw.slice(0, 300), score: null, fixes: [] };
    }
  }

  const fixes = (parsed.fixes || []).map((f) => ({
    index: f.index,
    fix: f.fix || "",
    impact: f.impact || "",
  }));

  return {
    summary: parsed.summary || "",
    score: typeof parsed.score === "number" ? parsed.score : null,
    fixes,
  };
}
