// scripts/testSessionPrepDates.js
//
// Session Prep Companion, Phase 3 -- end-to-end (mocked-API) test for
// entry-level structured dates. Same in-memory fakeSupabase + mocked
// global.fetch harness as scripts/testPipeline.js (no live Supabase or
// real Claude spend -- see that file's header for why this sandbox can't
// reach the live project anyway). Exercises the real lib/factionDeepLore.js,
// lib/campaignEntryGenerators.js, and lib/logDateSuggestions.js code
// directly (no HTTP layer) so the test stays focused on this phase's
// actual logic rather than re-testing Express plumbing scripts/
// testPipeline.js already covers.
//
// Covers:
//   1. Faction Deep Lore generation proposes a foundingDate -> validated
//      and stored.
//   2. NPC generation proposes birthDate/deathDate -> validated and stored.
//   3. Log generation resolves a date for an NPC with NO canonical
//      deathDate yet -> a pending_entry_updates suggestion is created.
//   4. Log generation resolves a date for an NPC that ALREADY HAS a
//      canonical deathDate -> no suggestion is created (canonical wins).
//   5. An out-of-range proposed date is dropped to null rather than saved.
//
// Run with: node scripts/testSessionPrepDates.js

process.env.ANTHROPIC_API_KEY = "test-key";

const CALENDAR_CONFIG = {
  months: [{ name: "Frostmere", days: 30 }, { name: "Ashfall", days: 28 }],
  days_per_week: 7,
  weekday_names: null,
  era_name: "Age of Ash",
  current_date: { year: 812, month_index: 1, day: 10 }
};

const originalFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (url.includes("anthropic.com")) {
    const body = JSON.parse(opts.body);
    const systemText = Array.isArray(body.system) ? body.system.map((b) => b.text).join("\n") : (body.system || "");

    if (systemText.includes("You are expanding a faction's established concept")) {
      return jsonResponse({
        nickname: "The Ashen Hand", overviewQuote: "We remember.", origin: "Founded after the collapse.",
        corePhilosophy: "Order through memory.", structureHierarchy: "A council of elders.",
        territory: "The old archive district.", goalsNearTerm: "Rebuild the registry.",
        goalsLongTerm: "Restore the old order.", internalTensions: "Elders disagree on outsiders.",
        iconography: "Grey and bone-white.", relationships: [], economyResources: "Salvage and tribute.",
        joining: "Petition the council.",
        foundingDate: { year: 200, monthIndex: 0, day: 1 }
      });
    }
    if (systemText.includes("You are generating a named NPC")) {
      return jsonResponse({
        id: "miller-thom", name: "Miller Thom", callsign: null, roleArchetype: "Quest-Giver", faction: "unaligned",
        age: 54, signatureQuote: "The mill remembers everything.", physicalDescription: "Weathered, flour-dusted hands.",
        traits: ["grieving", "stubborn"], contradiction: "Gentle with strangers, cold with kin.",
        wants: "Keep the mill running.", actuallyNeeds: "To let his son's death go.",
        speech: { register: "plain", rhythm: "slow", tic: "trails off mid-sentence", neverSay: "it's fine" },
        relationships: [], dialogue: { openingLine: "Mill's closed.", branches: [] }, questHook: "Find who broke the wheel.",
        designNotes: "First Quest-Giver generated.",
        birthDate: { year: 758, monthIndex: 1, day: 5 },
        appointedDate: null,
        deathDate: null
      });
    }
    if (systemText.includes("You are generating found-text content")) {
      // Two different log bodies depending on which test is running --
      // detect via the dynamic USER INPUT name so both scenarios can
      // share one mock without a global test-order dependency.
      const isFirstMention = systemText.includes("Name/Title: first-mention-log");
      return jsonResponse({
        id: isFirstMention ? "log-first-mention" : "log-already-canonical",
        name: isFirstMention ? "first-mention-log" : "already-canonical-log",
        logType: "Journal", locationContext: "The Old Mill", locationId: null,
        characters: "Miller Thom", context: "A found journal page.",
        bodyText: "He died on the fourth day of Ashfall.",
        faction: null,
        designNotes: "Resolves Miller Thom's death date.",
        resolvedDate: { year: 812, monthIndex: 1, day: 4 },
        resolvedDateSubject: { category: "npcs", entryId: "miller-thom", dateField: "deathDate" }
      });
    }
    throw new Error("Unhandled prompt in test mock (first 120 chars): " + systemText.slice(0, 120));
  }
  return originalFetch(url, opts);
};

function jsonResponse(payload) {
  return { ok: true, json: async () => ({ content: [{ type: "text", text: JSON.stringify(payload) }] }) };
}

const fakeSupabase = require("./lib/fakeSupabase");
fakeSupabase.install();
// Pre-seed calendar_config so validateWorldDate has something real to
// check proposed dates against -- without this every date would be
// dropped as "no calendar configured," which is a real, tested case
// (see check #5 below) but not what tests 1-4 are checking.
fakeSupabase.db.world_config.push({ world_id: "test-world", draft_json: {}, calendar_config: CALENDAR_CONFIG });

const { generateFactionDeepLore } = require("../lib/factionDeepLore");
const { createNewNpc, createNewLog } = require("../lib/campaignEntryGenerators");
const { upsertEntry, getEntry } = require("../lib/entriesRepo");
const { listPendingUpdates } = require("../lib/pendingEntryUpdatesRepo");

const WORLD_ID = "test-world";
const failures = [];
function check(label, condition) {
  if (condition) console.log(`  PASS - ${label}`);
  else { console.log(`  FAIL - ${label}`); failures.push(label); }
}

async function main() {
  console.log("== Session Prep Companion, Phase 3 -- entry-level dates test ==\n");

  console.log("Test 1: Faction Deep Lore proposes and validates foundingDate");
  await upsertEntry(WORLD_ID, "factions", {
    id: "ashen-hand", name: "The Ashen Hand", subtitle: null, faction: "ashen-hand", tags: [],
    bodyHtml: "<p>stub</p>", raw: { factionKey: "ashen-hand", name: "The Ashen Hand" }
  });
  const { faction } = await generateFactionDeepLore(WORLD_ID, "ashen-hand");
  check("foundingDate proposed by the model is validated and kept", faction.foundingDate && faction.foundingDate.year === 200 && faction.foundingDate.monthIndex === 0 && faction.foundingDate.day === 1);

  console.log("\nTest 2: NPC generation proposes birthDate, leaves deathDate null");
  const npcResult = await createNewNpc(WORLD_ID, { name: "Miller Thom", role: "Quest-Giver" });
  const savedNpc = await getEntry(WORLD_ID, "npcs", npcResult.id);
  check("birthDate proposed by the model is validated and kept", savedNpc.raw.birthDate && savedNpc.raw.birthDate.year === 758);
  check("deathDate stays null when the model didn't propose one", savedNpc.raw.deathDate === null);

  console.log("\nTest 3: Log resolves a NEW date for an entry with no canonical date yet -> creates a suggestion");
  await createNewLog(WORLD_ID, { name: "first-mention-log" });
  const pendingAfterFirstMention = await listPendingUpdates(WORLD_ID);
  check("a pending_entry_updates row was created", pendingAfterFirstMention.length === 1);
  check("the suggestion targets the right entry/category/field", (() => {
    const row = pendingAfterFirstMention[0];
    // listPendingUpdates() now maps rows through Phase 7's rowToUpdate()
    // (lib/pendingEntryUpdatesRepo.js), which returns camelCase fields --
    // entryId/deltaText, not the raw snake_case entry_id/delta_text this
    // assertion originally checked back when this Phase 3 stub returned
    // raw rows untouched.
    return row.entryId === "miller-thom" && row.category === "npcs" && row.deltaText.includes("deathDate");
  })());
  check("the referenced NPC's deathDate is NOT silently written (still null)", (await getEntry(WORLD_ID, "npcs", "miller-thom")).raw.deathDate === null);

  console.log("\nTest 4: Log resolves a date for an entry that ALREADY has a canonical date -> no new suggestion");
  // Give Miller Thom a real canonical deathDate now, simulating an
  // earlier Regenerate having set it directly (Section 6a: entry-level
  // fields are the source of truth once set).
  const withDeath = { ...savedNpc.raw, deathDate: { year: 812, monthIndex: 1, day: 4 } };
  await upsertEntry(WORLD_ID, "npcs", { id: "miller-thom", name: savedNpc.name, subtitle: savedNpc.subtitle, faction: savedNpc.faction, tags: savedNpc.tags, bodyHtml: savedNpc.bodyHtml, raw: withDeath });
  await createNewLog(WORLD_ID, { name: "already-canonical-log" });
  const pendingAfterCanonical = await listPendingUpdates(WORLD_ID);
  check("no additional suggestion was created once a canonical date exists", pendingAfterCanonical.length === 1);

  console.log("\nTest 5: an out-of-range proposed date is dropped to null, not saved");
  // Reuse Test 1's faction path but with a calendar-invalid founding
  // year (>1000 years before current_date) by calling the lib function
  // directly against a hand-built invalid date, exercising
  // proposeAndValidateDate's real rejection path rather than re-mocking
  // the API for a second, separate faction.
  const { proposeAndValidateDate } = require("../lib/calendar");
  check("a year >1000 before current_date is rejected", proposeAndValidateDate({ year: -500, monthIndex: 0, day: 1 }, CALENDAR_CONFIG) === null);

  console.log("\nTest 6: routes/confirmEntry.js sanitizes date fields on manual edit/create too");
  // Uses the "logs" category (not npcs) -- logs aren't in confirmEntry.js's
  // HAS_PORTRAIT set, so this avoids needing a Storage stub in
  // fakeSupabase (which only models the query-builder/rpc surface, not
  // supabase.storage) just to exercise the date-sanitizing logic itself.
  const express = require("express");
  const confirmEntryRoute = require("../routes/confirmEntry");
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.userId = "test-user"; req.worldId = WORLD_ID; next(); });
  app.use("/api", confirmEntryRoute);
  const server = app.listen(4321);
  try {
    const priorLog = await getEntry(WORLD_ID, "logs", "log-first-mention");
    // A manual edit with an out-of-range resolvedDate (month index
    // doesn't exist in the 2-month CALENDAR_CONFIG) should save with the
    // field dropped to null, not the garbage value.
    const badEditRes = await fetch("http://localhost:4321/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "logs", entry: { ...priorLog.raw, id: "log-first-mention", resolvedDate: { year: 1, monthIndex: 99, day: 1 } } })
    });
    check("manual edit with an invalid date still saves (200)", badEditRes.status === 200);
    const afterBadEdit = await getEntry(WORLD_ID, "logs", "log-first-mention");
    check("the invalid resolvedDate was dropped to null rather than stored", afterBadEdit.raw.resolvedDate === null);

    // A manual edit with a genuinely valid date should persist unchanged.
    const goodEditRes = await fetch("http://localhost:4321/api/confirm-entry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "logs", entry: { ...afterBadEdit.raw, id: "log-first-mention", resolvedDate: { year: 812, monthIndex: 1, day: 9 } } })
    });
    check("manual edit with a valid date saves (200)", goodEditRes.status === 200);
    const afterGoodEdit = await getEntry(WORLD_ID, "logs", "log-first-mention");
    check("a valid manually-entered resolvedDate is kept", afterGoodEdit.raw.resolvedDate && afterGoodEdit.raw.resolvedDate.year === 812 && afterGoodEdit.raw.resolvedDate.day === 9);
  } finally {
    server.close();
  }

  console.log("\n== Result ==");
  if (failures.length === 0) {
    console.log("ALL PASS");
    process.exit(0);
  } else {
    console.log(`${failures.length} FAILURE(S):`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test script crashed:", err);
  process.exit(1);
});
