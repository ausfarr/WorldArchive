const { logClaudeCost } = require("./costTracker");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// Cheaper/faster model for mechanical/templating tasks that don't need
// full creative reasoning -- currently used for artPromptPrompt.js's
// art-prompt-writing call. $1/$5 per MTok.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

// The model every content-generation call (NPC/enemy/item/survivor/
// class/location/log/faction bios, plus every wizard step) uses UNLESS
// it explicitly passes its own `model` -- see callClaude()'s default
// param below. Reads from CONTENT_MODEL env var first so switching
// models going forward (e.g. back to Sonnet, or to a future release)
// is a Render dashboard change + restart, not a code edit + redeploy.
// Currently defaulted to Haiku after the July 2026 cost/quality
// comparison (see scripts/compareTextModels.js / the debug route) --
// Haiku's output quality and reliability were judged close enough to
// Sonnet 4.6 to justify Sonnet's ~2.5x latency and ~3x cost across every
// generation in the app. Revisit this default any time; it's one env
// var, not a code change.
const CONTENT_MODEL = process.env.CONTENT_MODEL || HAIKU_MODEL;

// systemPrompt accepts either:
//   - a plain string (unchanged from before -- most prompt builders that
//     haven't been split for caching yet)
//   - an array of content blocks, e.g.
//       [{ type: "text", text: STATIC_INSTRUCTIONS, cache_control: { type: "ephemeral" } },
//        { type: "text", text: dynamicWorldContext }]
//     which is how prompts/*ContentPrompt.js's cacheable builders shape
//     it -- see cacheableSystemPrompt() at the bottom of each of those
//     files. The API accepts `system` as either shape directly, so no
//     translation is needed here beyond passing it through as-is.
//
// model defaults to CONTENT_MODEL (Haiku, or whatever CONTENT_MODEL is
// set to) -- pass model: explicitly (e.g. an explicit Sonnet model
// string) for any call that specifically needs a different tier.
async function callClaude({ systemPrompt, userMessage, maxTokens = 2000, model = CONTENT_MODEL }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  logClaudeCost(data.usage, model);
  const textBlock = data.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No text content in Claude response");
  return textBlock.text;
}

// Escapes bare control characters (raw newlines, tabs, carriage returns)
// found INSIDE a JSON string value but never escaped by the model as
// \n/\t/\r. This is a different failure from the prose-prefix case
// above: the JSON braces are already correctly positioned, but a
// multi-sentence field (physicalDescription, a dialogue reply, etc.)
// contains an actual line break instead of an escaped one, which is
// exactly what produces a JSON.parse error citing a specific line/column
// deep inside the response rather than at position 0. Walks the string
// character by character tracking string/escape state so replacements
// only ever happen inside a string value, never in the JSON structure
// itself (commas, braces, colons outside strings are left untouched).
function sanitizeControlCharsInStrings(text) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }
    if (ch === "\n") { result += "\\n"; continue; }
    if (ch === "\r") { result += "\\r"; continue; }
    if (ch === "\t") { result += "\\t"; continue; }
    result += ch;
  }
  return result;
}

// Strips accidental markdown code fences before JSON.parse, in case the
// model wraps its output despite instructions not to. Three fallback
// layers if the cleaned string still isn't valid JSON on its own:
//   1. Slice from the first '{' to the last '}' -- handles a model
//      prepending conversational preamble before the JSON.
//   2. Escape bare control characters inside string values -- handles a
//      model writing a real line break instead of an escaped \n inside
//      a prose field.
//   3. Both together, in case a response hits both failure modes at once.
// Falls through to the original JSON.parse error (the most informative
// one, pointing at the real problem) if none of these recover it.
function parseJsonResponse(text) {
  const cleaned = text.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (originalErr) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const sliced = start !== -1 && end !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned;

    try {
      return JSON.parse(sliced);
    } catch (sliceErr) {
      try {
        return JSON.parse(sanitizeControlCharsInStrings(sliced));
      } catch (sanitizeErr) {
        throw originalErr;
      }
    }
  }
}

// Shared shape for splitting a system prompt into a cacheable static
// block (instructions/schema that never change) and a dynamic block
// (this world's setting/factions/roster, which does). See individual
// prompts/*ContentPrompt.js files for what's actually static per prompt
// -- this just standardizes the block shape so every file doesn't
// reimplement it slightly differently.
//
// cache_control on the static block only: everything up to and
// including a cache_control block is eligible for caching, so it must
// come first and the dynamic block must come after, uncached.
function buildCacheableSystemPrompt(staticText, dynamicText) {
  return [
    { type: "text", text: staticText, cache_control: { type: "ephemeral" } },
    { type: "text", text: dynamicText }
  ];
}

module.exports = { callClaude, parseJsonResponse, buildCacheableSystemPrompt, HAIKU_MODEL, CONTENT_MODEL };
