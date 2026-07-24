// lib/fileWriter.js — Supabase-backed rewrite (Phase 1 multi-tenant pivot).
//
// The old version wrote two files per entry (a data/<id>.js file plus an
// appended manifest.js line) and a separate images/<id>.png file. Since
// the `entries` table already carries a `category` column, one row now
// covers what used to take two files — so each category collapses from
// two functions (writeXDataFile + appendToXManifest) into one
// (saveXEntry). Route files are updated accordingly.
//
// NOTE ON FIDELITY: the old *EntryFileContent() builders also generated
// polished HTML `footer` links (e.g. `<a href="dossier.html?...">The
// Ferro-Kings</a>`) using FACTION_LABEL/FACTION_CATEGORY_ID maps that are
// private to each *Template.js file (not exported). Since the live
// archive UI isn't reading from Supabase yet this phase (that's Phase
// 3/4), those pretty footer links aren't wired up here — footer is a
// plain-text placeholder for now and can be upgraded once the front-end
// rewire happens and needs it.
//
// saveImage() now uploads to the `portraits` Supabase Storage bucket at
// `{worldId}/{entryId}.png` (public bucket — see schema notes) instead of
// writing to local disk, and returns the public URL instead of a path.

const { supabase } = require("./supabaseClient");
const { upsertEntry, getEntry } = require("./entriesRepo");
const { resolveFactionLabel, getStatLabels } = require("./worldFlavor");

const { buildBodyHtml: buildNpcBodyHtml, buildManifestEntry: buildNpcManifestEntry } = require("./entryTemplate");
const { buildEnemyBodyHtml, buildEnemyManifestEntry } = require("./enemyTemplate");
const { buildItemBodyHtml, buildItemManifestEntry } = require("./itemTemplate");
const { buildSurvivorBodyHtml, buildSurvivorManifestEntry } = require("./survivorTemplate");
const { buildLogBodyHtml, buildLogManifestEntry } = require("./logTemplate");
const { buildClassBodyHtml, buildClassManifestEntry } = require("./classTemplate");
const { buildFactionBodyHtml, buildFactionManifestEntry } = require("./factionTemplate");

const PORTRAIT_BUCKET = "portraits";

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Mirrors enemyTemplate.js's private TIER_TAG_CLASS map (not exported) —
// buildEnemyManifestEntry() deliberately returns tags: [] (manifest rows
// never showed the tier badge), but the full dossier entry's `tags` field
// DOES carry it, matching style.css's .tag.tier-elite/.tag.tier-boss.
const ENEMY_TIER_TAG_CLASS = {
  Trash: "tag",
  Elite: "tag tier-elite",
  Boss: "tag tier-boss"
};

async function saveImage(worldId, entryId, imageBuffer) {
  if (!imageBuffer) return null;
  const objectPath = `${worldId}/${entryId}.png`;
  const { error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .upload(objectPath, imageBuffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`saveImage(${entryId}) failed: ${error.message}`);
  const { data } = supabase.storage.from(PORTRAIT_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Returns the deterministic public URL a portrait WOULD be at for this
// entry, without uploading anything or checking whether it actually
// exists there (getPublicUrl doesn't hit the network -- it's a pure
// string build off the bucket's public base URL). Used by
// routes/confirmEntry.js so a regenerate-confirm -- which never touches
// images -- doesn't wipe out a previously-generated portrait by rebuilding
// bodyHtml with no imageUrl at all. If no portrait was ever generated for
// this id, the URL simply 404s and the existing onerror fallback on the
// <img> tag shows the usual "pending" placeholder -- same as today.
function getPortraitUrl(worldId, entryId) {
  const objectPath = `${worldId}/${entryId}.png`;
  const { data } = supabase.storage.from(PORTRAIT_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Deletes every portrait this world has ever generated, for the "Delete
// World" flow (routes/deleteWorld.js). Storage buckets don't support a
// prefix-delete in one call -- list the world's folder, then remove by
// exact object path. Safe to call on a world with no portraits at all
// (list just returns an empty array).
async function deleteAllPortraits(worldId) {
  const { data: files, error: listError } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .list(worldId);
  if (listError) throw new Error(`deleteAllPortraits list failed: ${listError.message}`);
  if (!files || files.length === 0) return;

  const paths = files.map((f) => `${worldId}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(PORTRAIT_BUCKET).remove(paths);
  if (removeError) throw new Error(`deleteAllPortraits remove failed: ${removeError.message}`);
}

// ---------- NPCs ----------
async function saveNpcEntry(worldId, npc, imageUrl) {
  const factionLabel = await resolveFactionLabel(worldId, npc.faction);
  const bodyHtml = buildNpcBodyHtml(npc, imageUrl);
  const manifestFields = buildNpcManifestEntry(npc, factionLabel);
  const entryMeta = {
    category: "npcs",
    id: npc.id,
    name: npc.name,
    eyebrow: `NPC Dossier — ${npc.roleArchetype}`,
    subtitle: manifestFields.subtitle,
    faction: npc.faction,
    roleArchetype: npc.roleArchetype,
    age: npc.age,
    contradiction: npc.contradiction,
    speechTic: npc.speech ? npc.speech.tic : undefined,
    tags: manifestFields.tags,
    raw: npc,
    footer: [`Faction: ${factionLabel}`, "Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "npcs", entryMeta);
}

// ---------- Enemies ----------
async function saveEnemyEntry(worldId, enemy, imageUrl) {
  const factionLabel = await resolveFactionLabel(worldId, enemy.faction);
  const statLabels = await getStatLabels(worldId);
  const bodyHtml = buildEnemyBodyHtml(enemy, imageUrl, statLabels);
  const manifestFields = buildEnemyManifestEntry(enemy, factionLabel);
  const entryMeta = {
    category: "enemies",
    id: enemy.id,
    name: enemy.name,
    eyebrow: `Bestiary Entry — ${enemy.tier} Tier`,
    subtitle: enemy.role,
    faction: enemy.faction,
    tier: enemy.tier,
    role: enemy.role,
    tags: [`<span class="${ENEMY_TIER_TAG_CLASS[enemy.tier] || "tag"}">${enemy.tier}</span>`],
    raw: enemy,
    footer: [`Faction: ${factionLabel}`, "Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "enemies", entryMeta);
}

// ---------- Items ----------
async function saveItemEntry(worldId, item, imageUrl) {
  const bodyHtml = buildItemBodyHtml(item, imageUrl);
  const manifestFields = buildItemManifestEntry(item);
  const tags = [];
  if (item.rarity) tags.push(`<span class="tag">${item.rarity}</span>`);
  if (item.category === "Weapon") {
    if (item.weaponSkill) tags.push(`<span class="tag">${escapeHtml(item.weaponSkillLabel || item.weaponSkill)}</span>`);
    if (item.weaponType) tags.push(`<span class="tag">${escapeHtml(item.weaponType)}</span>`);
  }
  const entryMeta = {
    category: "items",
    id: item.id,
    name: item.name,
    eyebrow: `Item Sheet — ${item.rarity ? item.rarity + " " : ""}${item.category}`,
    subtitle: manifestFields.subtitle,
    faction: null,
    rarity: item.rarity,
    itemCategory: item.category,
    tags,
    raw: item,
    footer: ["Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "items", entryMeta);
}

// ---------- Survivors ----------
async function saveSurvivorEntry(worldId, survivor, imageUrl) {
  const bodyHtml = buildSurvivorBodyHtml(survivor, imageUrl);
  const manifestFields = buildSurvivorManifestEntry(survivor);
  const entryMeta = {
    category: "survivors",
    id: survivor.id,
    name: survivor.name,
    eyebrow: "Survivor Record",
    subtitle: survivor.callsign
      ? `"${survivor.callsign}" — Class: The ${survivor.className}`
      : `Class: The ${survivor.className}`,
    faction: null,
    className: survivor.className,
    tags: [`<span class="tag">The ${survivor.className}</span>`],
    raw: survivor,
    footer: ["Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "survivors", entryMeta);
}

// ---------- Logs ----------
async function saveLogEntry(worldId, log) {
  const factionLabel = await resolveFactionLabel(worldId, log.faction, "Personal");
  const bodyHtml = buildLogBodyHtml(log);
  const manifestFields = buildLogManifestEntry(log, factionLabel);
  const entryMeta = {
    category: "logs",
    id: log.id,
    name: log.name,
    eyebrow: `${log.logType} — Found: ${log.locationContext || ""}`,
    subtitle: `Character(s): ${log.characters || ""}`,
    faction: log.faction || null,
    logType: log.logType,
    tags: log.hexTongue ? [`<span class="tag">Hex-Tongue Intercept</span>`] : [],
    raw: log,
    footer: ["Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "logs", entryMeta);
}

// ---------- Classes ----------
async function saveClassEntry(worldId, cls, imageUrl) {
  const bodyHtml = buildClassBodyHtml(cls, imageUrl);
  const manifestFields = buildClassManifestEntry(cls);
  const entryMeta = {
    category: "classes",
    id: cls.id,
    name: manifestFields.name,
    eyebrow: "Class Sheet — Full 1–99 Progression",
    subtitle: manifestFields.subtitle,
    faction: null,
    baseName: cls.baseName,
    evolvedName: cls.evolvedName,
    tags: [`<span class="tag">Generated Class</span>`],
    raw: cls,
    footer: ["Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "classes", entryMeta);
}

// ---------- Factions (always upsert — only 4-5 possible ids, never new) ----------
async function saveFactionEntry(worldId, faction, roundupRows) {
  const bodyHtml = buildFactionBodyHtml(faction, roundupRows);
  const manifestFields = buildFactionManifestEntry(faction);

  // Regenerate only ever produces fresh Deep Lore content -- it never
  // touches the accent color, which is set at creation time or later via
  // the color picker (see routes/wizardFactions.js's PATCH endpoint).
  // upsertEntry() below is a full row overwrite, so without carrying the
  // existing value forward here, every regenerate would silently reset
  // the color to the default cyan fallback.
  //
  // For a genuinely NEW faction (no existing row yet), fall through to
  // faction.accentColor instead -- lib/factionDeepLore.js's
  // createNewFaction() generates one at creation time now, and this is
  // the only place that color actually gets persisted. Existing entries
  // always win over faction.accentColor: generateFactionDeepLore()'s
  // regenerate path never sets that field on its returned object, so
  // this fallback only ever fires for a brand-new faction, never
  // silently overrides an established color during a normal regenerate.
  const existing = await getEntry(worldId, "factions", faction.id);
  const accentColor = (existing && existing.accentColor) || faction.accentColor || null;

  const entryMeta = {
    category: "factions",
    id: faction.id,
    name: faction.name,
    eyebrow: `Faction Dossier — ${faction.territory ? faction.territory.split(".")[0] : ""}`,
    subtitle: `Epithet: "${faction.nickname || ""}"`,
    faction: faction.factionKey,
    factionKey: faction.factionKey,
    tags: manifestFields.tags,
    accentColor,
    raw: faction,
    footer: ["Source: generated via World Forge pipeline"],
    bodyHtml
  };
  return upsertEntry(worldId, "factions", entryMeta);
}

module.exports = {
  saveImage,
  getPortraitUrl,
  deleteAllPortraits,
  saveNpcEntry,
  saveEnemyEntry,
  saveItemEntry,
  saveSurvivorEntry,
  saveLogEntry,
  saveClassEntry,
  saveFactionEntry
};
