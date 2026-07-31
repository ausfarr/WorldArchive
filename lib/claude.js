const { logClaudeCost } = require("./costTracker");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Cheaper model for mechanical/templating tasks that don't need Sonnet's
// full reasoning -- currently used for prompts/artPromptPrompt.js's
// art-prompt-writing call (structured JSON + a strict template -> an
// 80-150 word paragraph, not creative world-building judgment). $1/$5
// per MTok vs Sonnet's $3/$15 -- a flat ~3x saving on every call that
// uses it, no caching/break-even math involved. See lib/costTracker.js
// for how this shows up in per-call cost logging.
const HAIKU_MODEL = "claude-haiku-4-5-20251001";

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
// model defaults to Sonnet (MODEL) -- pass model: HAIKU_MODEL explicitly
// for calls that are a good fit for the cheaper tier (see HAIKU_MODEL's
// comment above for the current criteria).
async function callClaude({ systemPrompt, userMessage, maxTokens = 2000, model = MODEL }) {
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

// Strips accidental markdown code fences before JSON.parse, in case the
// model wraps its output despite instructions not to. Falls back to
// slicing from the first '{' to the last '}' if the cleaned string still
// isn't valid JSON on its own -- some models occasionally prepend
// conversational preamble ("Looking at the existing roster...") before
// the JSON despite an explicit "Output ONLY valid JSON" instruction, and
// that preamble is otherwise unrecoverable data loss on an
// already-completed (paid) generation.
function parseJsonResponse(text) {
  const cleaned = text.replace(/^```json\s*|^```\s*|```\s*$/gm, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw err;
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

module.exports = { callClaude, parseJsonResponse, buildCacheableSystemPrompt, HAIKU_MODEL };
