// routes/campaignArc.js
//
// Campaigns (story arcs) -- see session_addendum_campaign_arcs_shipped.md
// for the design conversation. A Campaign references multiple existing
// Quests (campaign_modules, see routes/campaignModule.js's naming note)
// in an ordered list -- it does not own or duplicate Quest content.
//
// AI generation (/generate) is a single lightweight planning call --
// see prompts/campaignArcPrompt.js's header comment for why it never
// nests a full Quest generation inside itself. An unmatched stage is
// filled by navigating to the Quest builder with ?arcId=&prefillConcept=
// (see archive/js/campaignModule.js), which appends the newly-created
// Quest back onto this arc via appendQuestToArc() once saved.

const express = require("express");
const { callClaudeExpectingJson } = require("../lib/claude");
const { buildCampaignArcSystemPrompt } = require("../prompts/campaignArcPrompt");
const { getSettingContext } = require("../lib/worldFlavor");
const { getLoreContext } = require("../lib/loreContext");
const { listCampaignModules } = require("../lib/campaignModuleRepo");
const {
  listCampaignArcs,
  getCampaignArc,
  createCampaignArc,
  updateCampaignArc,
  deleteCampaignArc,
  appendQuestToArc
} = require("../lib/campaignArcRepo");
const { enforceGenerationCap } = require("../middleware/enforceGenerationCap");
const { requireAiEnabled } = require("../middleware/requireAiEnabled");

const router = express.Router();

function buildQuestRosterText(quests) {
  if (!quests.length) return "No Quests archived yet for this world -- every stage will need a new Quest created.";
  return quests.map((q) => `- id: ${q.id} | ${q.name}: ${q.summary || "(no summary)"}`).join("\n");
}

router.get("/campaign-arcs", async (req, res) => {
  try {
    const arcs = await listCampaignArcs(req.worldId);
    res.json({ arcs });
  } catch (err) {
    console.error("Loading campaigns failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/campaign-arcs/:id", async (req, res) => {
  try {
    const arc = await getCampaignArc(req.worldId, req.params.id);
    if (!arc) return res.status(404).json({ error: "Campaign not found." });
    res.json({ arc });
  } catch (err) {
    console.error("Loading campaign failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST generate -- cap-gated, ONE call regardless of stage count, PREVIEW
// ONLY (nothing saved). Matched stages are re-verified against the real
// campaign_modules table, same defensive posture as routes/campaignModule.js's
// own /generate (a hallucinated/stale questId falls back to unmatched).
// requireAiEnabled runs first, same as every other AI-spend route -- this
// was previously missing here despite the route calling a real Claude
// call, letting an AI-off account bypass the toggle.
router.post("/campaign-arcs/generate", requireAiEnabled, enforceGenerationCap, async (req, res) => {
  try {
    const worldId = req.worldId;
    const { concept, stageCount } = req.body || {};

    const [quests, settingContext, loreContext] = await Promise.all([
      listCampaignModules(worldId),
      getSettingContext(worldId),
      getLoreContext(worldId, {})
    ]);
    const questById = new Map(quests.map((q) => [q.id, q]));
    const questRosterText = buildQuestRosterText(quests);

    const systemPrompt = buildCampaignArcSystemPrompt({ settingContext, loreContext, questRosterText, stageCount, concept });
    const proposal = await callClaudeExpectingJson({ systemPrompt, userMessage: "Plan the Campaign now.", maxTokens: 1500 });

    const rawStages = Array.isArray(proposal.stages) ? proposal.stages : [];
    const stages = rawStages.map((s) => {
      if (s.matched && s.questId && questById.has(s.questId)) {
        const quest = questById.get(s.questId);
        return { matched: true, questId: quest.id, questName: quest.name, questSummary: quest.summary || "", title: s.title || quest.name };
      }
      return { matched: false, title: s.title || "Untitled stage", concept: s.concept || "" };
    });

    res.json({
      preview: true,
      name: proposal.name || "New Campaign",
      summary: proposal.summary || "",
      stages
    });
  } catch (err) {
    console.error("Campaign generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST create -- final save, manual or AI-preview-confirmed. Not cap-
// gated -- no AI call here, purely a write. questIds is the flattened
// list of already-real Quest ids (matched stages accepted from a
// preview, or manually picked) -- unmatched stages that haven't had
// their Quest created yet simply aren't included until they are.
router.post("/campaign-arcs", async (req, res) => {
  try {
    const { name, summary, questIds, pendingStages, createdVia } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "A Campaign needs a name." });
    }
    const cleanQuestIds = Array.isArray(questIds) ? questIds.filter((id) => typeof id === "string" && id) : [];
    const cleanPendingStages = Array.isArray(pendingStages)
      ? pendingStages.filter((s) => s && s.id).map((s) => ({ id: s.id, title: s.title || "", concept: s.concept || "" }))
      : [];
    const arc = await createCampaignArc(req.worldId, {
      name: String(name).trim(),
      summary: summary || "",
      questIds: cleanQuestIds,
      pendingStages: cleanPendingStages,
      createdVia: createdVia === "ai" ? "ai" : "manual"
    });
    res.json({ arc });
  } catch (err) {
    console.error("Saving campaign failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/campaign-arcs/:id", async (req, res) => {
  try {
    const { name, summary, questIds, pendingStages } = req.body || {};
    const patch = {};
    if (name !== undefined) patch.name = String(name).trim();
    if (summary !== undefined) patch.summary = summary;
    if (questIds !== undefined) {
      patch.questIds = Array.isArray(questIds) ? questIds.filter((id) => typeof id === "string" && id) : [];
    }
    if (pendingStages !== undefined) {
      patch.pendingStages = Array.isArray(pendingStages)
        ? pendingStages.filter((s) => s && s.id).map((s) => ({ id: s.id, title: s.title || "", concept: s.concept || "" }))
        : [];
    }
    const arc = await updateCampaignArc(req.worldId, req.params.id, patch);
    res.json({ arc });
  } catch (err) {
    console.error("Updating campaign failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST append-quest -- called by the Quest builder after saving a new
// Quest that was created from this arc's unmatched stage
// (?arcId=...&prefillConcept=...&stageId=...). Idempotent for questIds
// (appendQuestToArc no-ops if already present); stageId, if given,
// removes that entry from pendingStages so the "still needs a Quest"
// list shrinks as stages get fulfilled.
router.post("/campaign-arcs/:id/append-quest", async (req, res) => {
  try {
    const { questId, stageId } = req.body || {};
    if (!questId) return res.status(400).json({ error: "questId is required." });
    const arc = await appendQuestToArc(req.worldId, req.params.id, questId, stageId);
    res.json({ arc });
  } catch (err) {
    console.error("Appending quest to campaign failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/campaign-arcs/:id", async (req, res) => {
  try {
    await deleteCampaignArc(req.worldId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Deleting campaign failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
