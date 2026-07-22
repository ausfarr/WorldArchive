const express = require("express");
const { callClaude, parseJsonResponse } = require("../lib/claude");
const { getDraft, getCategoryConfig, saveCategoryConfig } = require("../lib/worldConfigRepo");
const { getLoreContext } = require("../lib/loreContext");
const { buildWizardCategoryConfigSystemPrompt, CANONICAL_CATEGORIES } = require("../prompts/wizardCategoryConfigPrompt");

const router = express.Router();

const CATEGORY_KEYS = Object.keys(CANONICAL_CATEGORIES);

router.get("/wizard/category-config", async (req, res) => {
  try {
    const categoryConfig = await getCategoryConfig(req.worldId);
    res.json({ categoryConfig });
  } catch (err) {
    console.error("Loading category config failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/generate-category-config", async (req, res) => {
  try {
    const draft = await getDraft(req.worldId);
    const step1 = draft["1"] || {};
    const loreContext = await getLoreContext(req.worldId, {});

    const systemPrompt = buildWizardCategoryConfigSystemPrompt({ step1, loreContext });
    const raw = await callClaude({
      systemPrompt,
      userMessage: "Generate the category labels now.",
      maxTokens: 1200
    });
    let categoryConfig;
    try {
      categoryConfig = parseJsonResponse(raw);
    } catch (parseErr) {
      console.error("Failed to parse category config JSON. Raw response length:", raw.length);
      console.error("Raw response (last 300 chars):", raw.slice(-300));
      throw new Error(`Category config was not valid JSON (likely truncated — response was ${raw.length} chars): ${parseErr.message}`);
    }
    res.json({ categoryConfig });
  } catch (err) {
    console.error("Category config generation failed:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/wizard/save-category-config", async (req, res) => {
  try {
    const { categoryConfig } = req.body || {};
    if (!categoryConfig || typeof categoryConfig !== "object") {
      return res.status(400).json({ error: "Request body must include a 'categoryConfig' object." });
    }
    const missing = CATEGORY_KEYS.filter((k) => !categoryConfig[k]);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing config for: ${missing.join(", ")}` });
    }
    const saved = await saveCategoryConfig(req.worldId, categoryConfig);
    res.json({ categoryConfig: saved });
  } catch (err) {
    console.error("Saving category config failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
