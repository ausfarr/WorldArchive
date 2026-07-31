// lib/locationTemplate.js
//
// Builds bodyHtml + manifest fields from structured LocationContent JSON.
// Mirrors lib/entryTemplate.js's (NPC) actual save-path pattern — no
// hardcoded per-file faction maps (those are legacy/unused; faction
// display is resolved once via lib/worldFlavor.js's resolveFactionLabel
// and passed in by lib/fileWriter.js, same as every other category).

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Builds bodyHtml from structured LocationContent JSON. `raw` (the full
// location object) is required on every entry from day one — the
// addendum specifically flags this to avoid repeating the "legacy
// entries lack raw" regenerate gap noted in the main scope doc.
function buildLocationBodyHtml(location, imageUrl) {
  const name = escapeHtml(location.name);

  // ENVIRONMENT-framed art (see prompts/artPromptPrompt.js) is a
  // landscape/establishing shot, not a bust portrait — same portrait-img
  // class/slot pattern as every other category so it inherits the site's
  // existing image styling, just holding different subject matter.
  const artBlock = `<img class="portrait-img" id="portrait-img-${location.id}" data-category="locations" data-entry-id="${location.id}" data-label="Location art" src="${imageUrl || `images/${location.id}.png`}" alt="${name}" onerror="handlePortraitError(this)">`;

  const descriptorBlock = location.descriptorLine
    ? `<div class="quote-block">${escapeHtml(location.descriptorLine)}</div>`
    : "";

  const dangerTagsHtml = (location.dangerTags || [])
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join(" ");

  const notableNpcRows = (location.notableNpcs || [])
    .map((n) => {
      const toHref = n.toId
        ? `<a href="dossier.html?category=npcs&id=${escapeHtml(n.toId)}">${escapeHtml(n.toLabel)}</a>`
        : escapeHtml(n.toLabel || "");
      return `<tr><td>${toHref}</td><td>${escapeHtml(n.why)}</td></tr>`;
    })
    .join("\n");
  const notableNpcsBlock = notableNpcRows
    ? `<h2>Notable NPCs</h2>
<table class="rel-table">
<tr><th>Name</th><th>Why</th></tr>
${notableNpcRows}
</table>
`
    : "";

  const hooksBlock = location.hooksSecrets
    ? `<h2>Hooks &amp; Secrets</h2>\n<p>${escapeHtml(location.hooksSecrets)}</p>\n`
    : "";

  return `
${artBlock}
${descriptorBlock}
<p><strong>Region/Biome:</strong> ${escapeHtml(location.regionBiome)}</p>
<h2>Notable Features</h2>
<p class="flavor">${escapeHtml(location.notableFeatures)}</p>
<p><strong>Tags:</strong> ${dangerTagsHtml}</p>
${notableNpcsBlock}${hooksBlock}<h2>Design Notes</h2>
<p>${escapeHtml(location.designNotes)}</p>
`;
}

function buildLocationManifestEntry(location, factionLabel) {
  return {
    id: location.id,
    name: location.name,
    subtitle: `${location.regionBiome} — ${factionLabel || "Unaligned"}`,
    tags: (location.dangerTags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`),
    faction: location.faction,
    regionBiome: location.regionBiome,
    locked: false
  };
}

module.exports = { buildLocationBodyHtml, buildLocationManifestEntry, slugify };
