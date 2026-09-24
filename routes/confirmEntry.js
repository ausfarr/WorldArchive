const express = require("express");
const { saveFactionEntry } = require("../lib/fileWriter");
const { writeEntry } = require("../lib/entryWriters");
const { propagateEntryRename } = require("../lib/entryCleanup");
const { buildFactionRoundup } = require("../lib/factionRoundup");
const { syncReciprocalRelationships } = require("../lib/factionDeepLore");
const { getEntry } = require("../lib/entriesRepo");
const { checkEntryCap } = require("../middleware/enforceEntryCap");
const { withLock } = require("../lib/asyncLock");
const { getCalendarConfig } = require("../lib/worldConfigRepo");
const { sanitizeEntryDateFields } = require("../lib/calendar");
const { resolveReferencesForEntry } = require("../lib/entryLinker");
const { linkAfterSave } = require("../lib/afterEntrySave");
const { maybeCreateDateSuggestion, validateResolvedDateSubject } = require("../lib/logDateSuggestions");
const { createChronicleEvent, createLogDateEvent, createRegenerateEvent, createEntryDateEvents } = require("../lib/timelineEvents");
const { createSuggestionsFromChronicle } = require("../lib/sessionChronicleSuggestions");
const { getNextSessionNumber } = require("../lib/sessionChronicle");

const router = express.Router();

// Entry cross-linking (Phase 2) -- see lib/entryLinker.js. Called after
// every successful save below (manual create, edit, and regenerate-
// confirm all land here -- the single shared write path). Also handles
// Session Prep Companion, Phase 3, Section 6a's cross-entry date
// suggestion for logs (lib/logDateSuggestions.js), and now all four
// Timeline triggers (lib/timelineEvents.js) -- Triggers 1/3 only apply
// to logs, Trigger 2 (timelineOptIn) applies to any category since a
// Regenerate/status-flip can happen on any of them, and Trigger 4
// (entry-level structured dates -- foundingDate/birthDate/etc.) applies
// to every category that has date fields other than logs (which keeps
// its own Trigger 3). priorEntry is the entry's raw content before this
// save (null for a brand-new entry) -- Trigger 4 needs it to detect
// whether a date field actually changed.
// The linking half now lives in lib/afterEntrySave.js's linkAfterSave()
// (same two steps, same order) so the wizard's faction post-pass can
// share it -- see that file's header comment.
async function afterSave(worldId, category, savedContent, unresolvedGhosts, calendarConfig, timelineOptIn, priorEntry) {
  await linkAfterSave(worldId, category, savedContent, unresolvedGhosts);
  if (category === "logs") {
    await maybeCreateDateSuggestion(worldId, savedContent, calendarConfig);
    await createChronicleEvent(worldId, savedContent);
    await createLogDateEvent(worldId, savedContent);
    await createSuggestionsFromChronicle(worldId, savedContent);
  }
  await createRegenerateEvent(worldId, category, savedContent, timelineOptIn, calendarConfig);
  await createEntryDateEvents(worldId, category, savedContent, priorEntry, calendarConfig);
  // Bug batch 1 audit, item 7: a rename (manual edit or a regenerate that
  // changed the name) updates every other entry's stored label for this
  // one -- faction relationships, NPC/PC relationships, a location's
  // notable NPCs, ... (lib/entryCleanup.js). Best-effort: the save itself
  // already succeeded.
  if (priorEntry && priorEntry.name && savedContent.name && priorEntry.name !== savedContent.name) {
    try {
      await propagateEntryRename(worldId, category, savedContent.id, priorEntry.name, savedContent.name);
    } catch (err) {
      console.error(`Rename propagation for ${category}/${savedContent.id} failed:`, err && err.message);
    }
  }
}

// Writer selection (WRITERS / HAS_PORTRAIT / per-ruleset branching)
// moved to lib/entryWriters.js#writeEntry (bug batch 1 audit, item 6) so
// the faction-delete cleanup re-saves members through the same code.

// Called after the user reviews a /generate-X preview response and clicks
// "Save This Version." Takes the exact `entry` object the preview returned
// and writes it for real — no re-generation happens here.
router.post("/confirm-entry", async (req, res) => {
  const worldId = req.worldId;
  try {
    const { category, entry: rawEntry, timelineEvent: timelineOptIn } = req.body || {};
    if (!rawEntry || !rawEntry.id) {
      return res.status(400).json({ error: "Missing entry or entry.id" });
    }

    // Forward-resolve before anything else touches this entry -- both a
    // manual-create and an edit/regenerate-confirm can land here with
    // references that are now resolvable against the archive even if
    // they weren't at the original /generate-X call (see lib/entryLinker.js).
    const linkResult = await resolveReferencesForEntry(worldId, category, rawEntry);
    // Session Prep Companion, Phase 3 -- code validates before write on
    // EVERY path that reaches this shared endpoint (regenerate-confirm,
    // manual edit, manual create), not just at generation time -- see
    // lib/calendar.js's sanitizeEntryDateFields for why this is the one
    // place that guarantee can be made for all three uniformly.
    const calendarConfig = await getCalendarConfig(worldId);
    const entry = sanitizeEntryDateFields(category, linkResult.raw, calendarConfig);
    // resolvedDateSubject isn't a date-shaped field itself (sanitizeEntryDateFields
    // only cleans entry.resolvedDate above) -- validate it separately against
    // the real archive so a hand-edited/malformed subject can't reach
    // lib/logDateSuggestions.js's afterSave hook below.
    if (category === "logs") {
      entry.resolvedDateSubject = entry.resolvedDate ? (await validateResolvedDateSubject(worldId, entry.resolvedDateSubject) ? entry.resolvedDateSubject : null) : null;
    }

    // v0.9 Manual Mode: this endpoint is now the creation point for
    // manually-made entries (see archive/js/render.js's
    // openManualCreateForm), not just edits/regenerate-confirms of
    // entries that already exist. Only a genuinely NEW row should count
    // against the entry cap -- an edit or a regenerate confirm targets
    // an entry id that's already in the table.
    //
    // The cap check AND the write below both run inside one per-world
    // lock (see lib/asyncLock.js) whenever this is a new entry --
    // without that, two concurrent confirm-entry calls for two different
    // new entries could both pass the count-check before either's write
    // actually landed, letting a world exceed its entry cap by more than
    // one. Cheap to hold for the whole handler here: unlike an
    // AI-generation route, there's no Claude/Gemini call left to make by
    // this point -- confirm-entry is a pure DB write.
    const alreadyExists = await getEntry(worldId, category, entry.id);

    // Session Prep Companion, Phase 7 -- status fields (Section 6).
    // Centralized here, the one shared write path every regenerate-
    // confirm/manual-edit/manual-create already goes through, rather
    // than touching each category's own generate route individually:
    // the AI generation schemas never propose `status` at all (it's a
    // DM-managed field, not model content), so a regenerate's freshly
    // generated content object never carries the entry's existing status
    // forward on its own -- without this it would silently revert to
    // undefined on every single regenerate. A brand-new entry gets this
    // category's sensible default; an existing one keeps whatever it
    // already had unless the DM's own edit explicitly set a new value
    // (entry.status !== undefined -- e.g. from the edit form's Status
    // field, or a suggestion-apply status flip).
    // priorRaw: this entry's raw content before this save (null for a
    // brand-new entry) -- reused below for both the status-flip check
    // and Timeline Trigger 4's "did a date field actually change" check
    // (lib/timelineEvents.js's createEntryDateEvents).
    const priorRaw = alreadyExists ? alreadyExists.raw : null;
    const STATUS_DEFAULTS = { npcs: "alive", factions: "active", survivors: "alive" };
    const priorStatus = priorRaw ? priorRaw.status : undefined;
    if (entry.status === undefined) {
      entry.status = priorStatus !== undefined ? priorStatus : (STATUS_DEFAULTS[category] || null);
    }
    // Items/enemies only carry a status for their gated sub-types
    // (QuestItem; Boss-tier) -- never default one for routine gear/mobs.
    // entry.category here is the ITEM's own Weapon/Armor/Consumable/
    // QuestItem sub-type (prompts/itemContentPrompt.js's schema field),
    // unrelated to this route's own outer `category` const (the archive
    // category, "items") despite the same property name.
    if (category === "items" && entry.category !== "QuestItem" && !alreadyExists) entry.status = null;
    if (category === "enemies" && entry.tier !== "Boss" && !alreadyExists) entry.status = null;

    // Session Prep Companion, Phase 7 -- wires Timeline Trigger 2 to
    // fire automatically from a real status flip, per the scope doc's
    // "defaulting on for status-flips (which are inherently state-change
    // actions)". A genuine flip is: this entry already existed, its
    // prior status and the incoming one are both set, and they differ.
    // An explicit timelineOptIn the DM already supplied (the regen
    // preview's checkbox) always wins over this default.
    const isRealStatusFlip = alreadyExists && priorStatus !== undefined && priorStatus !== null && entry.status !== priorStatus;
    const effectiveTimelineOptIn = timelineOptIn || (isRealStatusFlip
      ? { summary: `Status changed: ${priorStatus} → ${entry.status}`, worldDate: null }
      : undefined);

    // Manual Mode -- Session Packets/Chronicles (follow-up to Session
    // Prep Companion). Both categories always need a home Quest/Campaign
    // (routes/generateSessionPacket.js and generateSessionChronicle.js
    // already validate this at generation time), but a manually-created
    // one skips that route entirely and lands straight here -- this is
    // the one place that guarantee can be made to hold for AI-generated
    // and manually-authored entries alike, same reasoning as every other
    // centralized check in this handler.
    if (category === "session-packets" && !entry.questId && !entry.campaignId) {
      return res.status(400).json({ error: "A Session Packet needs a Quest or Campaign." });
    }
    if (category === "logs" && entry.sessionChronicle && !entry.sessionChronicle.questId && !entry.sessionChronicle.campaignId) {
      return res.status(400).json({ error: "A Session Chronicle needs a Quest or Campaign." });
    }
    // Session numbering is global and code-assigned, never DM-typed or
    // model-proposed (lib/sessionChronicle.js's getNextSessionNumber) --
    // routes/generateSessionChronicle.js already assigns it before this
    // endpoint ever sees an AI-generated Chronicle, but a manually-
    // created one has no such route to pass through, so a brand-new
    // manual Chronicle with no sessionNumber yet gets one assigned here.
    // Regenerating/editing an EXISTING Chronicle never reassigns one --
    // it keeps whatever it already had, same as the generate route's own
    // "keep the prior Chronicle's own number" rule.
    if (category === "logs" && entry.sessionChronicle && !alreadyExists && !entry.sessionChronicle.sessionNumber) {
      entry.sessionChronicle.sessionNumber = await getNextSessionNumber(worldId);
    }

    // Bug batch 1 audit, item 4: filling a locked ghost placeholder turns
    // an uncounted stub into a counted entry, so it's cap-checked (and
    // serialized under the entry-cap lock) exactly like a new one. It
    // used to count as "already exists" and skip the cap entirely.
    const createsCountedEntry = !alreadyExists || alreadyExists.locked === true;
    const doConfirm = async () => {
      if (createsCountedEntry) {
        const capResult = await checkEntryCap(worldId, req.userId);
        if (!capResult.allowed) {
          return {
            status: 403,
            body: {
              error: "entry_cap_reached",
              message: `You've reached the ${capResult.cap}-entry limit for this world. Subscribe for unlimited entries, or buy more from Settings.`,
              cap: capResult.cap,
              count: capResult.count
            }
          };
        }
      }

      if (category === "factions") {
        // Roundup is recomputed fresh at confirm-time rather than trusting
        // whatever was true when the preview was generated — it's cheap,
        // deterministic, and always-live by design (per factionRoundup.js),
        // so this is more correct than a stale snapshot if other entries
        // were generated in the gap between preview and confirm.
        if (!entry.factionKey) {
          return { status: 400, body: { error: "Faction entry is missing factionKey" } };
        }
        const roundupRows = await buildFactionRoundup(worldId, entry.factionKey);
        await saveFactionEntry(worldId, entry, roundupRows);
        await syncReciprocalRelationships(worldId, entry);
        await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, effectiveTimelineOptIn, priorRaw);
        return { status: 200, body: { saved: true, id: entry.id, category } };
      }

      // Per-ruleset writer selection (5e / generic / Echoes default) lives
      // in lib/entryWriters.js#writeEntry.
      const written = await writeEntry(worldId, category, entry);
      if (!written) {
        return { status: 400, body: { error: `Unknown category '${category}'` } };
      }
      await afterSave(worldId, category, entry, linkResult.unresolvedGhosts, calendarConfig, effectiveTimelineOptIn, priorRaw);
      return { status: 200, body: { saved: true, id: entry.id, category } };
    };

    const result = createsCountedEntry ? await withLock(`entry-cap:${worldId}`, doConfirm) : await doConfirm();
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error("Confirm-save failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
