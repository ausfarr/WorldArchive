// lib/sessionChronicle.js
//
// Session Prep Companion, Phase 5 -- support helpers for Session
// Chronicle generation (a Logs sub-type, see prompts/sessionChroniclePrompt.js
// and routes/generateSessionChronicle.js). Deterministic, no AI calls --
// same "code writes structure, the model never proposes this part"
// split as everywhere else numbering/lookup is involved.

const { readLogManifest } = require("./roster");
const { listEntries } = require("./entriesRepo");

// Session numbering is GLOBAL across the whole world (scope doc Section
// 7.1), not per-Quest/Campaign -- a plain deterministic scan of every
// Chronicle-shaped log already on record, same "fetch everything, scan
// client-side" tolerance as lib/factionRoundup.js's archive-scan and
// lib/dateContext.js's known-dates scan. Beta-scale log counts make this
// fine; revisit if it ever needs to be cheaper.
async function getNextSessionNumber(worldId) {
  const manifest = await readLogManifest(worldId, { locked: false });
  let maxSession = 0;
  for (const m of manifest) {
    const chronicle = m.sessionChronicle;
    if (chronicle && Number.isInteger(chronicle.sessionNumber) && chronicle.sessionNumber > maxSession) {
      maxSession = chronicle.sessionNumber;
    }
  }
  return maxSession + 1;
}

// Finds the most recently generated Session Packet for this Quest/
// Campaign, if any -- "the plan" a Chronicle's prompt is grounded
// against per session_prep_companion_scope.md Section 4 ("explicitly
// tell the model which parts were planned vs. what the DM's notes say
// actually happened"). No explicit "packet consumed by this session"
// tracking exists yet, so this is a heuristic: the latest packet
// generated for the same Quest/Campaign is assumed to be the one this
// session was prepped from. Returns null if none exists (a recap-only
// session with no prep step is explicitly supported -- scope doc
// Section 9/7.7).
async function findLatestSessionPacketFor(worldId, { questId, campaignId }) {
  const rows = await listEntries(worldId, "session-packets", { locked: false });
  const matches = rows.filter((m) => {
    const raw = m.raw || {};
    if (questId && raw.questId === questId) return true;
    if (campaignId && raw.campaignId === campaignId) return true;
    return false;
  });
  if (!matches.length) return null;
  matches.sort((a, b) => (b.raw.generatedAt || 0) - (a.raw.generatedAt || 0));
  return matches[0].raw;
}

module.exports = { getNextSessionNumber, findLatestSessionPacketFor };
