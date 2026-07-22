const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getDraft } = require("../lib/worldConfigRepo");
const { listLoreSections, replaceLoreSections } = require("../lib/loreRepo");
const { parseLoreDocument } = require("../lib/loreParsing");
const { buildWizardStep3SystemPrompt } = require("../prompts/wizardStep3Prompt");

const router = express.Router();

// Known section keys from the generate-fresh schema -> which generator
// categories care about each, and whether it's "core" (always included
// regardless of category, same convention as world_bible_sections.json's
// core:true sections). Mirrors loreParsing.js's TOPIC_CATEGORY_MAP but
// hardcoded here since we control the generated schema directly.
const GENERATED_SECTION_META = {
  geography: { title: "Geography", categoryTags: ["factions", "npcs", "enemies", "classes", "items", "logs", "survivors"], core: true },
  peoples: { title: "Peoples", categoryTags: ["npcs", "survivors", "enemies"], core: true },
  resources: { title: "Resources", categoryTags: ["factions", "items"], core: false },
  culture: { title: "Culture", categoryTags: ["npcs", "survivors", "factions"], core: false },
  technologyOrSupernatural: { title: "Technology / Supernatural System", categoryTags: ["items", "classes", "enemies"], core: false },
  history: { title: "History", categoryTags: ["factions", "npcs"], core: false }
};

router.get("/wizard/lore", async (req, res) => {
  try {
    const sections = await listLoreSections(req.worldId);
    res.json({ sections });
  } catch (err) {
    console.error("Loading lore sections failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Generate-fresh path: composes the doc via one Claude call grounded in
// the world's saved Step 1 draft, then splits it into tagged sections
// using the known schema (no keyword-guessing needed here).
router.post("/wizard/generate-lore", async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    const step1 = draft["1"] || {};

    const systemPrompt = buildWizardStep3SystemPrompt({ step1 });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Generate the lore document now.",
      maxTokens: 3000
    });
    let doc;
    try {
      doc = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse wizard Step 3 JSON. Raw response length:", raw.length);
      throw new Error(`Lore document was not valid JSON (possibly truncated): ${parseErr.message}`);
    }

    const sections = Object.keys(GENERATED_SECTION_META)
      .filter((key) => doc[key])
      .map((key, i) => ({
        title: GENERATED_SECTION_META[key].title,
        content: doc[key],
        categoryTags: GENERATED_SECTION_META[key].categoryTags,
        core: GENERATED_SECTION_META[key].core,
        position: i
      }));

    const rawText = sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n---\n\n");
    const saved = await replaceLoreSections(req.worldId, sections, rawText, "generated");
    res.json({ sections: saved, rawText });
  } catch (err) {
    console.error("Lore generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Import path: accepts raw text (either pasted directly, or read
// client-side from an uploaded .md/.txt file via FileReader -- either way
// it arrives here as a plain text string, so there's no server-side file
// handling/storage bucket needed). Splits by markdown headers and applies
// keyword-based category tagging.
router.post("/wizard/import-lore", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== "string" || !text.trim()) {
      return res.status(400).json({ error: "Request body must include non-empty 'text'." });
    }
    const sections = parseLoreDocument(text);
    if (sections.length === 0) {
      return res.status(400).json({ error: "Could not parse any sections from the provided document." });
    }
    const saved = await replaceLoreSections(req.worldId, sections, text, "imported");
    res.json({ sections: saved, rawText: text });
  } catch (err) {
    console.error("Lore import failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Explicit save step, used after the user reviews/edits either a
// generate-fresh or an import result. Persists the sections AS GIVEN
// (with their existing category tags) rather than re-deriving tags via
// parseLoreDocument -- re-running the import parser here would clobber
// generate-fresh's curated tags with keyword-guessed ones.
router.post("/wizard/save-lore-sections", async (req, res) => {
  try {
    const { sections, source } = req.body || {};
    if (!Array.isArray(sections) || sections.length === 0) {
      return res.status(400).json({ error: "Request body must include a non-empty 'sections' array." });
    }
    const rawText = sections.map((s) => `## ${s.title}\n\n${s.content}`).join("\n\n---\n\n");
    const saved = await replaceLoreSections(req.worldId, sections, rawText, source || "generated");
    res.json({ sections: saved, rawText });
  } catch (err) {
    console.error("Saving lore sections failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
