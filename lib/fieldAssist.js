// lib/fieldAssist.js
//
// v0.9 Manual Mode, Piece 2 -- "Help me" AI assist for a single free-text
// field on any edit form. Deliberately NOT a miniature version of the
// full content generators (prompts/*ContentPrompt.js) -- those build an
// entire entry from scratch against a fixed JSON schema; this nudges ONE
// already-in-progress field, grounded in whatever the user has already
// filled in on the rest of the entry, and returns plain text (no JSON
// parsing, no schema).
//
// Always uses HAIKU_MODEL regardless of CONTENT_MODEL -- a single-field
// suggestion doesn't need the (env-configurable, possibly Sonnet-tier)
// primary content model; Haiku is the right cost/quality tier for this
// by default, matching art-prompt-writing's existing precedent (see
// prompts/artPromptPrompt.js).

const { callClaude, HAIKU_MODEL } = require("./claude");
// NOTE: deliberately not lib/claude.js's buildCacheableSystemPrompt --
// that helper always treats the SECOND block as dynamic/uncached, but
// here it's the opposite split that matters for cache hits (see
// buildFieldAssistSystemPrompt below).
const { getSettingContext } = require("./worldFlavor");
const { getLoreContext } = require("./loreContext");
const { QUOTE_CRAFT_GUIDANCE } = require("./promptGuidance");
const { getFieldAssistConfig, isQuoteField } = require("./fieldAssistFields");

// Maps the 8 archive categories (as used elsewhere in the app, e.g.
// middleware/attachCostContext.js's ROUTE_CATEGORY_MAP) to the
// lib/loreContext.js `category` tag used for lore-section filtering --
// same tags routes/generate*.js already pass to getLoreContext.
const CATEGORY_LORE_TAG = {
  npcs: "npcs",
  enemies: "enemies",
  items: "items",
  survivors: "survivors",
  logs: "logs",
  classes: "classes",
  factions: "factions",
  locations: "locations"
};

// Renders the entry's already-filled fields as simple "Field: value"
// lines for the prompt, skipping the target field itself (that's what
// we're generating), empty/null values, and anything that isn't a
// primitive (nested objects like `attributes` or `personality` get
// flattened one level rather than dumped as [object Object]).
function formatEntryContext(currentEntryData, targetFieldKey) {
  if (!currentEntryData || typeof currentEntryData !== "object") return "(nothing else filled in yet)";
  const lines = [];
  for (const [key, value] of Object.entries(currentEntryData)) {
    if (key === targetFieldKey) continue;
    if (value == null || value === "") continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      for (const [subKey, subValue] of Object.entries(value)) {
        if (subValue == null || subValue === "") continue;
        lines.push(`${key}.${subKey}: ${subValue}`);
      }
    } else if (Array.isArray(value)) {
      if (value.length) lines.push(`${key}: ${value.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)).join(", ")}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.length ? lines.join("\n") : "(nothing else filled in yet)";
}

// The DOM field id (e.g. "ef-attr-body") isn't itself the raw entry key
// (e.g. "attributes.body") -- this only needs to strip the "ef-" prefix
// and the handful of known compound-field prefixes down to the leaf key
// used in formatEntryContext's exclusion check, since a false negative
// here (failing to exclude the target field from its own context) just
// means the model sees its own current value as "context", which for an
// EMPTY field is harmless (there's nothing to see) and for a non-empty
// field is exactly the "use what's written as context" behavior Austin
// asked for anyway -- so this is intentionally lenient, not exact.
function targetFieldKeyFromId(fieldId) {
  return fieldId.replace(/^ef-/, "").replace(/-/g, ".");
}

// Help Me is called once per field, and the wizard/dossier UI lets a GM
// fire it repeatedly while filling out ONE entry -- every one of those
// calls shares the same worldId/category/faction, so settingContext and
// loreContext (both pure reads off world_config/lore, see
// worldFlavor.js/loreContext.js -- no per-call randomness) come back
// byte-identical across the whole run of clicks. Unlike the
// prompts/*ContentPrompt.js generators (whose "dynamic" half is a roster
// that grows with every generation and so is never a repeat), this is
// exactly the shape prompt caching wants: put everything that's the same
// across those repeat clicks ahead of the one thing that isn't
// (quoteNote depends on which field is being written) and mark that
// shared prefix cacheable, instead of lib/claude.js's usual
// static-instructions-only split.
function buildFieldAssistSystemPrompt(settingContext, loreContext, quoteNote) {
  const cacheableText = `You are helping a GM fill in ONE field on an in-progress entry for their tabletop/game world archive. Write ONLY the suggested content for that field -- no preamble, no quotation marks around it, no explanation, no markdown. Just the raw text that belongs in the field.

Stay consistent with the world's setting and lore below, and with whatever the entry already has filled in -- don't contradict it, and don't repeat information that's already stated elsewhere on the entry.

WORLD SETTING:
${settingContext}

RELEVANT LORE:
${loreContext || "(no specific lore sections tagged for this category/faction yet)"}`;

  const blocks = [{ type: "text", text: cacheableText, cache_control: { type: "ephemeral" } }];
  // Only appended for quote-bearing fields (see fieldAssistFields.js's
  // isQuoteField) -- most calls have nothing here, and an empty trailing
  // text block is rejected by the API, so this is conditional rather than
  // always pushing a (possibly blank) second block.
  if (quoteNote) blocks.push({ type: "text", text: quoteNote.trim() });
  return blocks;
}

async function getFieldAssistSuggestion({ worldId, category, fieldId, currentEntryData }) {
  const config = getFieldAssistConfig(fieldId);
  if (!config) {
    throw new Error(`Field '${fieldId}' is not eligible for Help Me (not a recognized free-text field).`);
  }

  const loreTag = CATEGORY_LORE_TAG[category] || null;
  const faction = currentEntryData && (currentEntryData.faction || (currentEntryData.raw && currentEntryData.raw.faction)) || null;

  const [settingContext, loreContext] = await Promise.all([
    getSettingContext(worldId),
    getLoreContext(worldId, { category: loreTag, faction })
  ]);

  const entryContext = formatEntryContext(currentEntryData, targetFieldKeyFromId(fieldId));

  const quoteNote = isQuoteField(fieldId) ? QUOTE_CRAFT_GUIDANCE : "";

  const systemPrompt = buildFieldAssistSystemPrompt(settingContext, loreContext, quoteNote);

  const userMessage = `Entry category: ${category}

Already filled in on this entry:
${entryContext}

Field to write: "${fieldId.replace(/^ef-/, "")}"
What this field means: ${config.hint}

Write the suggested content for this field now. Output ONLY the field's content, nothing else.`;

  const suggestion = await callClaude({
    systemPrompt,
    userMessage,
    maxTokens: config.tokens,
    model: HAIKU_MODEL
  });

  return suggestion.trim().replace(/^["']|["']$/g, "");
}

module.exports = { getFieldAssistSuggestion };
