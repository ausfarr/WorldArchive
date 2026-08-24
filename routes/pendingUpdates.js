// routes/pendingUpdates.js
//
// Session Prep Companion, Phase 7 -- DM-facing suggestion queue (Section
// 6/7.5). Rows are created deterministically elsewhere (lib/
// logDateSuggestions.js's Phase 3 date-resolution trigger, lib/
// sessionChronicleSuggestions.js's Phase 7 Chronicle-implied-update
// trigger) -- this route is just the list/act/dismiss surface.
//
// "Act" behaves differently per suggestion_type, per the scope doc:
//   - status_flip: applies directly (patches the entry's raw_json.status)
//     -- no narrative rewrite needed, and per Phase 7's confirmEntry.js
//     wiring this also fires a Timeline event automatically, same as any
//     other real status flip.
//   - regenerate: does NOT write anything itself -- returns the target
//     entry's category/id/deltaText so the frontend can send the DM into
//     that category's existing regenerate flow with the suggestion's
//     delta_text as a revision instruction (see archive/js/
//     pendingUpdates.js). Marked 'applied' the moment the DM acts on it
//     (opens the regenerate flow), not gated on that regenerate actually
//     being confirmed afterward -- the queue's job is tracking that a
//     suggestion was surfaced and acted on, not gating the regenerate
//     itself a second time.

const express = require("express");
const { listPendingUpdates, getPendingUpdate, setPendingUpdateStatus } = require("../lib/pendingEntryUpdatesRepo");
const { patchEntryMeta, getEntry } = require("../lib/entriesRepo");
const { createTimelineEvent } = require("../lib/timelineRepo");
const { getCalendarConfig } = require("../lib/worldConfigRepo");

const router = express.Router();

router.get("/pending-updates", async (req, res) => {
  try {
    const status = req.query.status;
    const updates = await listPendingUpdates(req.worldId, status ? { status } : {});
    res.json({ updates });
  } catch (err) {
    console.error("Loading pending updates failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/pending-updates/:id/dismiss", async (req, res) => {
  try {
    const worldId = req.worldId;
    const suggestion = await getPendingUpdate(worldId, req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found." });
    // Same "already acted on" guard /apply already has -- without it, a
    // suggestion that was just applied (wrote a real status flip + fired a
    // Timeline event, see below) could be dismissed right after, silently
    // flipping its recorded status from 'applied' to 'dismissed' with no
    // error. That's misleading: the row is supposed to be an audit trail
    // of what was surfaced and what happened to it (see this file's header
    // comment / pendingEntryUpdatesRepo.js's), and "dismissed" reads as
    // "nothing happened" even though the entry write and Timeline event
    // both already did.
    if (suggestion.status !== "pending") {
      return res.status(400).json({ error: `This suggestion was already ${suggestion.status}.` });
    }
    const updated = await setPendingUpdateStatus(worldId, req.params.id, "dismissed");
    res.json({ update: updated });
  } catch (err) {
    console.error("Dismissing pending update failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/pending-updates/:id/apply", async (req, res) => {
  try {
    const worldId = req.worldId;
    const suggestion = await getPendingUpdate(worldId, req.params.id);
    if (!suggestion) return res.status(404).json({ error: "Suggestion not found." });
    if (suggestion.status !== "pending") {
      return res.status(400).json({ error: `This suggestion was already ${suggestion.status}.` });
    }

    if (suggestion.suggestionType === "status_flip") {
      const target = await getEntry(worldId, suggestion.category, suggestion.entryId);
      if (!target) return res.status(404).json({ error: "The suggested entry no longer exists." });
      const targetStatus = suggestion.payload && suggestion.payload.targetStatus;
      if (!targetStatus) return res.status(400).json({ error: "This suggestion has no target status to apply." });

      const priorStatus = target.raw ? target.raw.status : undefined;
      // status lives on the raw_json.raw sub-object (raw_json is the whole
      // old-style entryMeta -- {id, name, ..., raw: <model content>} -- and
      // status is a field on that inner model-content object, same place
      // confirmEntry.js reads/writes it), not at raw_json's top level --
      // patchEntryMeta only shallow-merges its patch into raw_json itself,
      // so the patch has to nest under `raw` or this silently no-ops.
      await patchEntryMeta(worldId, suggestion.category, suggestion.entryId, { raw: { ...(target.raw || {}), status: targetStatus } });

      // Same Timeline Trigger 2 default-summary behavior as a manual
      // status-flip edit through confirm-entry (see that route's own
      // isRealStatusFlip logic) -- applying a suggestion is just as real
      // a state change as hand-editing the field.
      if (priorStatus !== targetStatus) {
        const calendarConfig = await getCalendarConfig(worldId);
        const current = calendarConfig && calendarConfig.current_date;
        const worldDate = current ? { year: current.year, monthIndex: current.month_index, day: current.day } : null;
        if (worldDate) {
          await createTimelineEvent(worldId, {
            sourceType: "regenerate",
            sourceId: suggestion.entryId,
            sourceCategory: suggestion.category,
            sessionNumber: null,
            worldDate,
            summary: priorStatus ? `Status changed: ${priorStatus} → ${targetStatus}` : `Status set: ${targetStatus}`,
            linkedEntryIds: [{ category: suggestion.category, entryId: suggestion.entryId }],
            linkedFactionIds: target.raw && target.raw.faction ? [target.raw.faction] : []
          });
        }
      }

      const updated = await setPendingUpdateStatus(worldId, req.params.id, "applied");
      return res.json({ update: updated, applied: "status_flip" });
    }

    // suggestionType === "regenerate" -- no write here, see header comment.
    const updated = await setPendingUpdateStatus(worldId, req.params.id, "applied");
    res.json({ update: updated, applied: "regenerate", category: suggestion.category, entryId: suggestion.entryId, deltaText: suggestion.deltaText });
  } catch (err) {
    console.error("Applying pending update failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
