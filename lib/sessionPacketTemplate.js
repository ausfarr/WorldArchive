// lib/sessionPacketTemplate.js
//
// Session Prep Companion, Phase 4 -- JSON -> bodyHtml + manifest entry
// for the new "session-packets" category, same *Template.js pattern as
// every other category (lib/logTemplate.js, lib/factionTemplate.js,
// etc.): the model never generates raw HTML, this is the single source
// of truth for what gets rendered, and `raw` (the full structured packet
// object) is always stored alongside bodyHtml so nothing is lost to
// rendering.

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(name) {
  return String(name || "session-packet")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-") || "session-packet";
}

// A resolved tagged/reminder entry always carries { category, entryId,
// name } (name hydrated by routes/generateSessionPacket.js against the
// real roster before this ever renders) -- links to the real dossier
// page the same way every other cross-reference in the archive does.
function entryLink(ref) {
  if (!ref || !ref.entryId) return "";
  return `<a href="dossier.html?category=${escapeHtml(ref.category)}&id=${escapeHtml(ref.entryId)}">${escapeHtml(ref.name || ref.entryId)}</a>`;
}

function buildSessionPacketBodyHtml(packet) {
  const questLine = packet.questName
    ? `<p class="flavor">Prep for Quest: ${escapeHtml(packet.questName)}</p>`
    : packet.campaignName
      ? `<p class="flavor">Prep for Campaign: ${escapeHtml(packet.campaignName)}</p>`
      : "";

  const beatsHtml = (packet.sceneBeats || []).map((beat, i) => {
    const tags = (beat.taggedEntries || [])
      .map((ref) => `<span class="tag">${entryLink(ref)}${ref.note ? ` — ${escapeHtml(ref.note)}` : ""}</span>`)
      .join(" ");
    return `<div class="quote-block" style="margin-bottom:14px;">
<h3>Beat ${i + 1}: ${escapeHtml(beat.title)}</h3>
<p>${escapeHtml(beat.description)}</p>
${tags ? `<p class="flavor">${tags}</p>` : ""}
</div>`;
  }).join("\n");

  const voiceRows = (packet.npcVoiceReminders || [])
    .map((r) => `<tr><td>${entryLink({ ...r, category: "npcs" })}</td><td>${escapeHtml(r.reminder)}</td></tr>`)
    .join("\n");
  const voiceBlock = voiceRows
    ? `<h2>NPC Voice Reminders</h2>\n<table class="rel-table">\n<tr><th>NPC</th><th>Reminder</th></tr>\n${voiceRows}\n</table>`
    : "";

  const complicationsBlock = (packet.complicationsDeck || []).length
    ? `<h2>Complications Deck (optional)</h2>\n` + (packet.complicationsDeck || [])
        .map((c) => `<p><strong>${escapeHtml(c.title)}:</strong> ${escapeHtml(c.description)}</p>`)
        .join("\n")
    : "";

  const openThreadsBlock = (packet.openThreads || []).length
    ? `<h2>Open Threads</h2>\n<ul>${(packet.openThreads || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
    : `<h2>Open Threads</h2>\n<p class="flavor">No prior sessions recorded yet for this Quest/Campaign.</p>`;

  const mapBlock = (packet.dungeonMaps || []).length
    ? `<h2>Linked Battle Map${packet.dungeonMaps.length > 1 ? "s" : ""}</h2>\n` + packet.dungeonMaps
        .map((m) => `<p><a href="dossier.html?category=locations&id=${escapeHtml(m.locationId)}">${escapeHtml(m.locationName)}</a> — <a href="${escapeHtml(m.imageUrl)}" target="_blank" rel="noopener">view map</a></p>`)
        .join("\n")
    : "";

  return `
${questLine}
<div class="quote-block">${escapeHtml(packet.openingReadAloud)}</div>
<h2>Scene Beats</h2>
${beatsHtml}
${voiceBlock}
${complicationsBlock}
${openThreadsBlock}
${mapBlock}
`;
}

function buildSessionPacketManifestEntry(packet) {
  return {
    id: packet.id,
    name: packet.title,
    subtitle: packet.questName || packet.campaignName || "",
    tags: [],
    faction: null,
    locked: false
  };
}

module.exports = { buildSessionPacketBodyHtml, buildSessionPacketManifestEntry, slugify };
