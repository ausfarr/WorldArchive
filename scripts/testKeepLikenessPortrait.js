// scripts/testKeepLikenessPortrait.js
//
// Regression/verification test for the keepLikeness option added to
// POST /api/entries/:category/:id/generate-image (routes/generateEntryImage.js)
// and lib/imagegen.js's referenceImage support. Exercises the real route +
// middleware + save path against scripts/lib/fakeSupabase.js's in-memory
// fake, with global.fetch mocked for the Anthropic (art-prompt) and Gemini
// (image) calls -- same shape as scripts/testPipeline.js/testEnemyPipeline.js.
//
// What this actually checks: that keepLikeness:true, on an entry that
// already has a real portrait, results in the Gemini request carrying an
// inlineData part (the existing portrait, fetched and base64-encoded)
// ahead of the text part -- and that keepLikeness:false/omitted, or an
// entry with no existing portrait, sends text-only, exactly as before this
// feature existed. This is the one thing unit-testing the JS alone
// couldn't catch: whether the real bodyHtml-scraping regex
// (extractExistingPortraitUrl) actually matches what lib/*Template.js's
// portraitBlock renders, and whether that reference image actually makes
// it into the real Gemini request payload.
//
// Run with: node scripts/testKeepLikenessPortrait.js

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.GEMINI_API_KEY = "test-key";
// The route only fetches reference images from this project's own public
// Storage path (see isOwnStorageUrl in routes/generateEntryImage.js) --
// point the "project" at the fake storage host so a real-shaped portrait
// URL passes that guard.
process.env.SUPABASE_URL = "https://fake-storage.test";

const EXISTING_PORTRAIT_URL = "https://fake-storage.test/storage/v1/object/public/portraits/test-world/existing-npc.png";
const FOREIGN_PORTRAIT_URL = "http://169.254.169.254/latest/meta-data/portrait.png";
const fetchedUrls = [];
const REFERENCE_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

let lastGeminiParts = null;

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === "string") fetchedUrls.push(url);
  if (typeof url === "string" && url.includes("anthropic.com")) {
    return {
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "A weathered fixer, waist-up portrait, painterly digital illustration." }]
      })
    };
  }
  if (typeof url === "string" && url.includes("fake-storage.test")) {
    return {
      ok: true,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => REFERENCE_BYTES.buffer
    };
  }
  if (typeof url === "string" && url.includes("googleapis.com")) {
    const body = JSON.parse(opts.body);
    lastGeminiParts = body.contents[0].parts;
    const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { data: tinyPng, mimeType: "image/png" } }] } }]
      })
    };
  }
  return originalFetch(url, opts);
};

const { install, db } = require("./lib/fakeSupabase");
install();

const express = require("express");
const generateEntryImageRoute = require("../routes/generateEntryImage");

const WORLD = "test-world";

const failures = [];
function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS - ${label}`);
  } else {
    console.log(`  FAIL - ${label}${detail !== undefined ? ` (${detail})` : ""}`);
    failures.push(label);
  }
}

function seedNpc(id, { withPortrait, portraitUrl = EXISTING_PORTRAIT_URL }) {
  db.entries.push({
    world_id: WORLD,
    category: "npcs",
    entry_id: id,
    name: "Vess Okoro",
    subtitle: "Informant/Fixer",
    faction: "unaligned",
    tags_json: [],
    body_html: withPortrait
      ? `<img class="portrait-img" id="portrait-img-${id}" data-category="npcs" data-entry-id="${id}" data-label="Character portrait" src="${portraitUrl}" alt="Vess Okoro">`
      : `<img class="portrait-img" id="portrait-img-${id}" data-category="npcs" data-entry-id="${id}" data-label="Character portrait" src="images/${id}.png" alt="Vess Okoro">`,
    raw_json: {
      id,
      name: "Vess Okoro",
      faction: "unaligned",
      roleArchetype: "Informant/Fixer",
      age: 34,
      signatureQuote: "Everyone's got a price.",
      physicalDescription: "Patchwork coat over salvaged tech.",
      traits: ["watchful"],
      contradiction: "Sells everyone's secrets except one.",
      wants: "Stay useful enough to stay alive.",
      actuallyNeeds: "One relationship that isn't a transaction.",
      speech: { register: "clipped street slang", rhythm: "short, guarded", tic: "prices first", neverSay: "trust me" },
      relationships: [],
      dialogue: { openingLine: "Information's not free.", branches: [] },
      questHook: null
    },
    locked: false
  });
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.userId = "test-user";
  req.worldId = WORLD;
  next();
});
app.use("/api", generateEntryImageRoute);

async function generateImage(entryId, keepLikeness) {
  lastGeminiParts = null;
  const res = await fetch(`http://localhost:4010/api/entries/npcs/${entryId}/generate-image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keepLikeness })
  });
  const data = await res.json();
  return { status: res.status, data, parts: lastGeminiParts };
}

const server = app.listen(4010, async () => {
  console.log("Test 1: keepLikeness:true with an existing real portrait sends a reference image");
  seedNpc("npc-with-portrait", { withPortrait: true });
  const withRef = await generateImage("npc-with-portrait", true);
  check("request succeeded", withRef.status === 200, JSON.stringify(withRef.data));
  check(
    "Gemini request included an inlineData part before the text part",
    Array.isArray(withRef.parts) && withRef.parts.length === 2 && !!withRef.parts[0].inlineData && !!withRef.parts[1].text,
    JSON.stringify(withRef.parts)
  );
  check(
    "reference image bytes match the fetched existing portrait",
    withRef.parts && withRef.parts[0].inlineData.data === Buffer.from(REFERENCE_BYTES).toString("base64")
  );

  console.log("\nTest 2: keepLikeness:false sends text-only, same as before this feature existed");
  seedNpc("npc-no-likeness", { withPortrait: true });
  const noLikeness = await generateImage("npc-no-likeness", false);
  check("request succeeded", noLikeness.status === 200, JSON.stringify(noLikeness.data));
  check(
    "Gemini request was text-only (no inlineData)",
    Array.isArray(noLikeness.parts) && noLikeness.parts.length === 1 && !!noLikeness.parts[0].text
  );

  console.log("\nTest 3: keepLikeness:true with NO existing real portrait falls through to text-only, not an error");
  seedNpc("npc-never-generated", { withPortrait: false });
  const noPortraitYet = await generateImage("npc-never-generated", true);
  check("request succeeded", noPortraitYet.status === 200, JSON.stringify(noPortraitYet.data));
  check(
    "Gemini request was text-only (fallback local path isn't a usable reference)",
    Array.isArray(noPortraitYet.parts) && noPortraitYet.parts.length === 1 && !!noPortraitYet.parts[0].text
  );

  console.log("\nTest 4: a portrait URL outside this project's Storage is never fetched (request-forgery guard)");
  seedNpc("npc-foreign-portrait", { withPortrait: true, portraitUrl: FOREIGN_PORTRAIT_URL });
  const foreign = await generateImage("npc-foreign-portrait", true);
  check("request succeeded", foreign.status === 200, JSON.stringify(foreign.data));
  check("foreign URL was never fetched", !fetchedUrls.some((u) => u.includes("169.254.169.254")), fetchedUrls.join(", "));
  check(
    "Gemini request fell back to text-only",
    Array.isArray(foreign.parts) && foreign.parts.length === 1 && !!foreign.parts[0].text
  );

  console.log(failures.length === 0 ? "\nAll checks passed." : `\n${failures.length} check(s) FAILED: ${failures.join(", ")}`);
  server.close();
  process.exit(failures.length === 0 ? 0 : 1);
});
