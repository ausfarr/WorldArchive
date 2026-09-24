// scripts/testSpellWorldClasses.js
//
// Covers the "spells attach only to this world's own classes" change (see
// lib/rulesets/5e/spellClasses.js's header), the 5e Item save crash that
// shipped with it ("save5eItemEntry is not defined", routes/generateItem.js),
// locked-placeholder Fill keeping the placeholder's name, and the admin
// bypass of every billing gate (lib/adminAccess.js).
//
// Runs the real /api/generate-spell, /generate-class and /generate-item
// routes end to end with global.fetch mocked for Anthropic and
// scripts/lib/fakeSupabase.js standing in for the database -- same
// approach as scripts/testPipeline.js. BILLING_ENABLED is forced on so the
// admin bypass is actually exercised (with billing off, every gate is
// already a no-op). No real API keys or DB needed:
//   node scripts/testSpellWorldClasses.js

process.env.ANTHROPIC_API_KEY = "test-key";
process.env.BILLING_ENABLED = "true";

const ADMIN_EMAIL = "ausfarr@gmail.com";
const prompts = []; // every system prompt the mock saw, flattened to text

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (typeof url === "string" && url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const sys = Array.isArray(body.system) ? body.system.map((b) => b.text || "").join("\n") : (body.system || "");
    prompts.push(sys);

    // Homebrew spell -- a model that ignores the rules and returns a
    // standard D&D class alongside whatever the world offers, to prove
    // code (not the prompt alone) enforces the rule.
    if (sys.includes("designing an original 5th Edition")) {
      const noClasses = sys.includes("CLASSES IN THIS WORLD: none yet");
      return jsonResponse({
        name: noClasses ? "Static Lash" : "Signal Burn",
        level: 1, school: "Evocation", ritual: false, concentration: false,
        castingTime: "1 action", range: "60 feet", components: "V, S", materialComponent: null,
        duration: "Instantaneous",
        classes: noClasses ? ["Chrome Hexer"] : ["Chrome Hexer", "Wizard", "Rogue"],
        newClass: noClasses ? { name: "Chrome Hexer", concept: "Street casters who run spells through salvaged neural rigs." } : null,
        description: "A crackling arc of current.", atHigherLevels: "+1d6 per slot level above 1st.",
        cantripBaseDamage: null, flavor: "Test flavor.", designNotes: "Test."
      });
    }
    // Reflavor spell -- same misbehavior.
    if (sys.includes("reflavoring an official 5th Edition spell")) {
      return jsonResponse({
        name: "Overclocked Bolt", flavor: "Test.", description: "Reworded.", designNotes: "Test.",
        classes: ["Wizard", "Chrome Hexer"], newClass: null
      });
    }
    // Homebrew class -- deliberately returns a DIFFERENT name than the
    // placeholder being filled, to prove the fill keeps the placeholder's.
    if (sys.includes("Full Class Name")) {
      return jsonResponse({
        name: "Something Else Entirely", hitDie: 8, primaryAbility: "Intelligence",
        savingThrowProficiencies: ["int", "wis"], casterType: "full",
        features: [{ level: 1, name: "Rig", description: "Test." }],
        subclasses: [], flavor: "Test.", designNotes: "Test."
      });
    }
    // Homebrew item.
    return jsonResponse({
      name: "Neon Knuckles", flavor: "Test.", designNotes: "Test.", description: "Test.",
      category: "Weapon", rarity: "Uncommon", itemType: "wondrous", valueGp: 100
    });
  }
  return originalFetch(url, opts);
};

// lib/entryLinker.js rewrites a saved spell's classes into {name, id}
// objects, so compare by name.
function classNames(spell) {
  return JSON.stringify((spell.raw.classes || []).map((c) => (typeof c === "object" ? c.name : c)));
}

function jsonResponse(obj) {
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(obj) }] }) };
}

const { install, db } = require("./lib/fakeSupabase");
install();
db.srd_library = [{
  id: "srd-magic-missile", ruleset: "5e", category: "spells", srd_id: "magic-missile", name: "Magic Missile",
  source_edition: "5e SRD", license_note: "SRD 5.1 (CC-BY-4.0)",
  data_json: { name: "Magic Missile", level: 1, school: "Evocation", castingTime: "1 action", range: "120 feet", components: "V, S", duration: "Instantaneous", classes: ["Sorcerer", "Wizard"], description: "Three darts." }
}];
db.world_srd_imports = [];
db.timeline_events = [];

const express = require("express");
const { getEntry, listEntries } = require("../lib/entriesRepo");
const { requireSubscriptionToRegenerate } = require("../lib/regenerateGate");
const { checkEntryCap } = require("../middleware/enforceEntryCap");
const { enforceGenerationCap, enforceImageGenerationCap } = require("../middleware/enforceGenerationCap");
const { generate5eSpellProcedurally } = require("../lib/proceduralGenerators/5e");

const WORLD = "w-spells";
db.world_config.push({ world_id: WORLD, draft_json: {}, ruleset: "5e" });

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  // Stand-in for middleware/resolveTenant.js (real Supabase Auth round
  // trip). Admin email so the billing gates (on, above) let us through.
  req.userId = "admin-user";
  req.userEmail = ADMIN_EMAIL;
  req.worldId = WORLD;
  next();
});
app.use("/api", require("../routes/generateSpell"));
app.use("/api", require("../routes/generateClass"));
app.use("/api", require("../routes/generateItem"));

const results = [];
function check(label, cond, extra) {
  results.push({ label, pass: !!cond });
  console.log(`  ${cond ? "PASS" : "FAIL"} - ${label}${!cond && extra !== undefined ? `  (${JSON.stringify(extra)})` : ""}`);
}

async function post(path, body) {
  const res = await fetch(`http://localhost:4017/api${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json() };
}

const server = app.listen(4017, async () => {
  try {
    console.log("\n5e Item (was: save5eItemEntry is not defined):");
    const item = await post("/generate-item", { mode: "homebrew" });
    check("homebrew 5e item returns 200", item.status === 200, item);
    check("homebrew 5e item is saved", !!(await getEntry(WORLD, "items", item.data.id)));

    console.log("\nSpell in a world with NO classes:");
    const s1 = await post("/generate-spell", { mode: "homebrew" });
    check("spell returns 200", s1.status === 200, s1);
    const spell1 = await getEntry(WORLD, "spells", s1.data.id);
    check("spell.classes is the invented class only", classNames(spell1) === JSON.stringify(["Chrome Hexer"]), spell1.raw.classes);
    check("newClass isn't saved onto the spell", !("newClass" in spell1.raw));
    const stub = await getEntry(WORLD, "classes", "chrome-hexer");
    check("class stub saved as a locked placeholder", stub && stub.locked === true, stub);
    check("class stub carries the concept as its subtitle", stub && /neural rigs/.test(stub.subtitle || ""), stub && stub.subtitle);

    console.log("\nSpell in a world that HAS classes:");
    const s2 = await post("/generate-spell", { mode: "homebrew" });
    check("spell returns 200", s2.status === 200, s2);
    check("prompt lists the world's class", prompts[prompts.length - 1].includes("- Chrome Hexer"));
    const spell2 = await getEntry(WORLD, "spells", s2.data.id);
    check("off-list classes (Wizard, Rogue) dropped", classNames(spell2) === JSON.stringify(["Chrome Hexer"]), spell2.raw.classes);
    const classes = await listEntries(WORLD, "classes");
    check("no Wizard/Rogue ghost classes created, no second stub", classes.length === 1, classes.map((c) => c.name));

    console.log("\nImport + Reflavor from SRD:");
    const imp = await post("/generate-spell", { mode: "import", srdLibraryId: "srd-magic-missile" });
    check("import returns 200", imp.status === 200, imp);
    const impSpell = await getEntry(WORLD, "spells", imp.data.id);
    check("import keeps only classes that exist in the world (none here)", impSpell.raw.classes.length === 0, impSpell.raw.classes);
    const ref = await post("/generate-spell", { mode: "reflavor", srdLibraryId: "srd-magic-missile" });
    check("reflavor returns 200", ref.status === 200, ref);
    const refSpell = await getEntry(WORLD, "spells", ref.data.id);
    check("reflavor maps onto the world's classes", classNames(refSpell) === JSON.stringify(["Chrome Hexer"]), refSpell.raw.classes);
    check("still no Wizard/Sorcerer ghosts", (await listEntries(WORLD, "classes")).length === 1);
    const bad = await post("/generate-spell", { mode: "reflavor", srdLibraryId: "nope" });
    check("reflavor with an unknown SRD id is a 404 (and refunded)", bad.status === 404, bad);

    console.log("\nProcedural (Roll Randomly) spell:");
    const proc = await generate5eSpellProcedurally(WORLD);
    check("procedural spell only uses world classes", proc.classes.length === 1 && proc.classes[0] === "Chrome Hexer", proc.classes);

    console.log("\nFilling the class stub:");
    const fill = await post("/generate-class", { fillExistingId: "chrome-hexer" });
    check("fill returns 200", fill.status === 200, fill);
    const classPrompt = prompts[prompts.length - 1];
    check("class prompt is told the placeholder's name", classPrompt.includes("Name: Chrome Hexer"));
    check("class prompt is told the stub's concept", classPrompt.includes("Concept (build the class around this):") && classPrompt.includes("neural rigs"));
    const filled = await getEntry(WORLD, "classes", "chrome-hexer");
    check("filled class is unlocked", filled && !filled.locked, filled);
    check("filled class keeps the placeholder's name", filled && filled.name === "Chrome Hexer", filled && filled.name);

    console.log("\nAdmin bypass (BILLING_ENABLED=true):");
    const regen = await post("/generate-spell", { fillExistingId: s2.data.id });
    check("admin can regenerate a spell (preview, no subscription)", regen.status === 200 && regen.data.preview === true, regen);
    check("admin passes the regenerate gate", (await requireSubscriptionToRegenerate({ userId: "admin-user", userEmail: ADMIN_EMAIL })).allowed);
    const nonAdmin = await requireSubscriptionToRegenerate({ userId: "someone", userEmail: "someone@example.com" });
    check("non-admin without a subscription is still blocked", !nonAdmin.allowed && nonAdmin.body.error === "regenerate_requires_subscription");
    check("admin has unlimited entries", (await checkEntryCap(WORLD, "admin-user", ADMIN_EMAIL)).unlimited === true);
    const fakeReq = { userId: "admin-user", userEmail: ADMIN_EMAIL, worldId: WORLD };
    let nexted = false;
    await enforceGenerationCap(fakeReq, {}, () => { nexted = true; });
    check("admin skips the generation cap, nothing spent", nexted && fakeReq.generationSource === "admin" && !fakeReq.refundGeneration);
    nexted = false;
    await enforceImageGenerationCap(fakeReq, {}, () => { nexted = true; });
    check("admin skips the image cap", nexted);
  } catch (err) {
    console.error(err);
    results.push({ label: "threw", pass: false });
  }

  server.close();
  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} FAILED` : "\nALL PASS");
  process.exit(failed.length ? 1 : 0);
});
