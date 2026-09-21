// lib/sessionChronicleSuggestions.js
//
// Session Prep Companion, Phase 7 -- turns a confirmed Session
// Chronicle's model-proposed `impliedUpdates` (prompts/
// sessionChroniclePrompt.js) into real pending_entry_updates rows.
// Never auto-applies anything to the referenced entry itself -- same
// "surface it, never write it" discipline as Phase 3's
// lib/logDateSuggestions.js, just triggered by narrative implication
// (a Chronicle's recap) instead of a resolved date.

const { getEntry } = require("./entriesRepo");
const { createPendingUpdate, findExistingUpdate, updatePendingUpdate } = require("./pendingEntryUpdatesRepo");

const VALID_CATEGORIES = new Set(["npcs", "factions", "survivors", "items"]);
const VALID_SUGGESTION_TYPES = new Set(["status_flip", "regenerate"]);

// Validates one model-proposed impliedUpdate against the real archive --
// same "reference real ids, never invent" discipline as everywhere else.
// Returns a cleaned object or null if it doesn't check out.
async function validateImpliedUpdate(worldId, update) {
  if (!update || !update.category || !update.entryId || !update.suggestionType || !update.deltaText) return null;
  if (!VALID_CATEGORIES.has(update.category)) return null;
  if (!VALID_SUGGESTION_TYPES.has(update.suggestionType)) return null;
  if (update.suggestionType === "status_flip" && !update.targetStatus) return null;
  const entry = await getEntry(worldId, update.category, update.entryId);
  if (!entry) return null;
  return {
    category: update.category,
    entryId: update.entryId,
    suggestionType: update.suggestionType,
    deltaText: update.deltaText,
    targetStatus: update.suggestionType === "status_flip" ? update.targetStatus : null
  };
}

// Called at generation time (routes/generateSessionChronicle.js) so the
// preview only ever shows the DM proposals that already resolve to real
// entries -- a hallucinated id is silently dropped, never shown as if
// it were real.
async function validateImpliedUpdates(worldId, proposedUpdates) {
  const results = await Promise.all((Array.isArray(proposedUpdates) ? proposedUpdates : []).map((u) => validateImpliedUpdate(worldId, u)));
  return results.filter(Boolean);
}

// Called after a Chronicle is confirmed (routes/confirmEntry.js's
// afterSave) -- creates one pending_entry_updates row per already-
// validated impliedUpdate on the saved log. Re-validates against the
// live archive again here (not just trusting the preview's validation),
// since time may have passed between preview and confirm.
async function createSuggestionsFromChronicle(worldId, log) {
  if (!log.sessionChronicle || !Array.isArray(log.impliedUpdates) || !log.impliedUpdates.length) return [];
  const created = [];
  const source = `chronicle:${log.id}`;
  for (const update of log.impliedUpdates) {
    const validated = await validateImpliedUpdate(worldId, update);
    if (!validated) continue;
    const payload = validated.suggestionType === "status_flip" ? { targetStatus: validated.targetStatus } : null;
    // A regenerate-confirm of the SAME Chronicle re-runs this trigger on
    // every confirm, not just the first -- see findExistingUpdate's own
    // comment for why this guard has to key off (source, entry, field),
    // not just source. But a regenerate can also revise the underlying
    // facts, not just the wording (e.g. a DM's corrected recap notes flip
    // an NPC from "wounded" to "dead") -- if the still-PENDING row's
    // content has actually changed, refresh it in place rather than
    // silently keeping the stale first-draft suggestion forever. An
    // applied/dismissed row is left untouched either way, same as
    // findExistingUpdate's own "any status" matching -- the DM already
    // acted on it.
    const existing = await findExistingUpdate(worldId, {
      source,
      entryId: validated.entryId,
      category: validated.category,
      suggestionType: validated.suggestionType
    });
    if (existing) {
      const contentChanged = existing.deltaText !== validated.deltaText ||
        JSON.stringify(existing.payload || null) !== JSON.stringify(payload);
      if (existing.status === "pending" && contentChanged) {
        const updated = await updatePendingUpdate(worldId, existing.id, { deltaText: validated.deltaText, payload });
        if (updated) created.push(updated);
      }
      continue;
    }
    const row = await createPendingUpdate(worldId, {
      entryId: validated.entryId,
      category: validated.category,
      suggestionType: validated.suggestionType,
      deltaText: validated.deltaText,
      source,
      payload
    });
    created.push(row);
  }
  return created;
}

module.exports = { validateImpliedUpdate, validateImpliedUpdates, createSuggestionsFromChronicle };
