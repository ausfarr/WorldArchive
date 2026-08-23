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
const { resolveFactionLabel, getStatLabels, resolveWeaponSkillLabel } = require("./worldFlavor");
const { getSkillSystem, getCalendarConfig } = require("./worldConfigRepo");

const { buildBodyHtml: buildNpcBodyHtml, buildManifestEntry: buildNpcManifestEntry } = require("./entryTemplate");
const { buildEnemyBodyHtml, buildEnemyManifestEntry } = require("./enemyTemplate");
const { buildItemBodyHtml, buildItemManifestEntry } = require("./itemTemplate");
const { buildSurvivorBodyHtml, buildSurvivorManifestEntry } = require("./survivorTemplate");
const { buildLogBodyHtml, buildLogManifestEntry } = require("./logTemplate");
const { buildClassBodyHtml, buildClassManifestEntry } = require("./classTemplate");
const { buildFactionBodyHtml, buildFactionManifestEntry } = require("./factionTemplate");
const { buildLocationBodyHtml, buildLocationManifestEntry } = require("./locationTemplate");
const { buildSessionPacketBodyHtml, buildSessionPacketManifestEntry } = require("./sessionPacketTemplate");

const PORTRAIT_BUCKET = "portraits";
const MAP_BACKDROP_BUCKET = "map-backdrops";
const WORLD_ART_BUCKET = "world-art";

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

async function saveImage(worldId, entryId, imageBuffer, mimeType = "image/png") {
  if (!imageBuffer) return null;
  const objectPath = `${worldId}/${entryId}.png`;
  const { error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .upload(objectPath, imageBuffer, { contentType: mimeType, upsert: true });
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

// Deletes one entry's portrait, if it has one. Used by the dossier
// page's "Delete This Entry" button (routes/entries.js). Safe to call
// for a category/entry that never had a portrait (logs, factions) --
// remove() on a non-existent path is a no-op, not an error, per
// Supabase Storage's semantics.
async function deletePortrait(worldId, entryId) {
  const objectPath = `${worldId}/${entryId}.png`;
  const { error } = await supabase.storage.from(PORTRAIT_BUCKET).remove([objectPath]);
  if (error) throw new Error(`deletePortrait(${entryId}) failed: ${error.message}`);
}

// ---------- Map backdrop (one per world, not tied to any entry) ----------
// mimeType defaults to PNG only as a fallback for callers that don't have
// a real value to pass -- both the generate path (routes/map.js, Gemini
// can return JPEG) and the upload path (/map/upload-backdrop) now pass
// the real type through explicitly.
async function saveMapBackdrop(worldId, imageBuffer, mimeType = "image/png") {
  if (!imageBuffer) return null;
  const objectPath = `${worldId}/backdrop.png`;
  const { error } = await supabase.storage
    .from(MAP_BACKDROP_BUCKET)
    .upload(objectPath, imageBuffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`saveMapBackdrop(${worldId}) failed: ${error.message}`);
  const { data } = supabase.storage.from(MAP_BACKDROP_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Unlike getPortraitUrl(), this DOES check existence (via list(), same
// technique as deleteAllPortraits()) rather than just building a
// deterministic URL -- routes/map.js needs a real yes/no to decide
// whether to auto-trigger generation on page load, not just a URL that
// may 404.
async function mapBackdropExists(worldId) {
  const { data: files, error } = await supabase.storage.from(MAP_BACKDROP_BUCKET).list(worldId);
  if (error) throw new Error(`mapBackdropExists(${worldId}) failed: ${error.message}`);
  return !!(files || []).find((f) => f.name === "backdrop.png");
}

function getMapBackdropUrl(worldId) {
  const objectPath = `${worldId}/backdrop.png`;
  const { data } = supabase.storage.from(MAP_BACKDROP_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Used by the "Delete World" flow -- safe to call even if no backdrop
// was ever generated (remove() on a non-existent path is a no-op, same
// as deletePortrait()). Also removes the vision-detected anchors JSON
// alongside it, since the two are generated together and neither is
// meaningful without the other.
async function deleteMapBackdrop(worldId) {
  const { error } = await supabase.storage
    .from(MAP_BACKDROP_BUCKET)
    .remove([`${worldId}/backdrop.png`, `${worldId}/anchors.json`]);
  if (error) throw new Error(`deleteMapBackdrop(${worldId}) failed: ${error.message}`);
}

// ---------- Map faction anchors (vision-detected, one JSON per world) ----------
// Sits alongside the backdrop in the same bucket. Generated once, right
// after the backdrop itself, by a Claude vision call over the finished
// image (see routes/map.js) -- a JSON blob, not an image, so this uses
// Storage's actual download() to read real content back rather than
// getPublicUrl()'s deterministic-string-building (which only makes
// sense for assets the browser fetches directly, like the backdrop
// itself). Missing/never-generated is a normal, expected state (older
// worlds, or a world whose vision call failed) -- getMapAnchors()
// returns null rather than throwing, so callers can fall back to the
// existing circular layout default without special-casing "not found"
// as an error.
async function saveMapAnchors(worldId, anchorsObj) {
  const objectPath = `${worldId}/anchors.json`;
  const body = Buffer.from(JSON.stringify(anchorsObj || {}), "utf8");
  const { error } = await supabase.storage
    .from(MAP_BACKDROP_BUCKET)
    .upload(objectPath, body, { contentType: "application/json", upsert: true });
  if (error) throw new Error(`saveMapAnchors(${worldId}) failed: ${error.message}`);
}

async function getMapAnchors(worldId) {
  const objectPath = `${worldId}/anchors.json`;
  const { data, error } = await supabase.storage.from(MAP_BACKDROP_BUCKET).download(objectPath);
  if (error) return null; // not found (or any other read issue) -- treat as "no anchors yet"
  try {
    const text = await data.text();
    return JSON.parse(text);
  } catch (parseErr) {
    console.error(`getMapAnchors(${worldId}): stored anchors.json was not valid JSON:`, parseErr.message);
    return null;
  }
}

// ---------- Map tile cleanup (leftover from an abandoned approach) ----------
// This session tried, and abandoned, generating several composited
// "tile-*.png" images per world (per-biome, then per-faction-territory)
// before settling on a single shared backdrop + per-location vignettes
// instead (see routes/map.js and archive/map.html). Nothing generates
// tile-*.png files anymore, but worlds used for testing during that work
// may still have leftover ones sitting in storage -- this stays purely
// as a cleanup utility (wired into the "Delete World" flow below) so
// those don't linger indefinitely, not because anything still writes
// this format.
async function deleteAllMapTiles(worldId) {
  const { data: files, error: listError } = await supabase.storage
    .from(MAP_BACKDROP_BUCKET)
    .list(worldId);
  if (listError) throw new Error(`deleteAllMapTiles list failed: ${listError.message}`);
  const tileFiles = (files || []).filter((f) => f.name.startsWith("tile-"));
  if (tileFiles.length === 0) return;
  const paths = tileFiles.map((f) => `${worldId}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(MAP_BACKDROP_BUCKET).remove(paths);
  if (removeError) throw new Error(`deleteAllMapTiles remove failed: ${removeError.message}`);
}

// ---------- World Mood Board (Priority 6, one per world) ----------
// Same pattern as the map backdrop above: a deterministic public URL
// built from a fixed object path, existence checked via list() rather
// than a DB column. Generated once at the end of the Style Guide wizard
// step (see routes/worldArt.js) -- no regenerate button yet, per this
// session's decision to stub "generate once" rather than build general
// art-regeneration infrastructure as part of this feature.
async function saveWorldMoodBoard(worldId, imageBuffer, mimeType = "image/png") {
  if (!imageBuffer) return null;
  const objectPath = `${worldId}/mood-board.png`;
  const { error } = await supabase.storage
    .from(WORLD_ART_BUCKET)
    .upload(objectPath, imageBuffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`saveWorldMoodBoard(${worldId}) failed: ${error.message}`);
  const { data } = supabase.storage.from(WORLD_ART_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function worldMoodBoardExists(worldId) {
  const { data: files, error } = await supabase.storage.from(WORLD_ART_BUCKET).list(worldId);
  if (error) throw new Error(`worldMoodBoardExists(${worldId}) failed: ${error.message}`);
  return !!(files || []).find((f) => f.name === "mood-board.png");
}

function getWorldMoodBoardUrl(worldId) {
  const objectPath = `${worldId}/mood-board.png`;
  const { data } = supabase.storage.from(WORLD_ART_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function deleteWorldMoodBoard(worldId) {
  const objectPath = `${worldId}/mood-board.png`;
  const { error } = await supabase.storage.from(WORLD_ART_BUCKET).remove([objectPath]);
  if (error) throw new Error(`deleteWorldMoodBoard(${worldId}) failed: ${error.message}`);
}

// ---------- Faction Mood Banners (Priority 6, one per faction) ----------
// Shares the WORLD_ART_BUCKET with the mood board above (one new bucket
// to create in Supabase rather than two) but keyed per-faction. Unlike
// the mood board, the resulting URL IS also written onto the faction's
// own entries row (bannerImageUrl, via patchEntryMeta in
// routes/worldArt.js) so the live dossier page can read it the same way
// it already reads accentColor -- no separate lookup needed at render
// time.
async function saveFactionBanner(worldId, factionId, imageBuffer, mimeType = "image/png") {
  if (!imageBuffer) return null;
  const objectPath = `${worldId}/faction-${factionId}-banner.png`;
  const { error } = await supabase.storage
    .from(WORLD_ART_BUCKET)
    .upload(objectPath, imageBuffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`saveFactionBanner(${factionId}) failed: ${error.message}`);
  const { data } = supabase.storage.from(WORLD_ART_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

async function deleteFactionBanner(worldId, factionId) {
  const objectPath = `${worldId}/faction-${factionId}-banner.png`;
  const { error } = await supabase.storage.from(WORLD_ART_BUCKET).remove([objectPath]);
  if (error) throw new Error(`deleteFactionBanner(${factionId}) failed: ${error.message}`);
}

// Storage-truth existence check, same pattern as worldMoodBoardExists
// above. Added after discovering the entries.raw_json.bannerImageUrl
// bridge (patchEntryMeta, in routes/worldArt.js) can silently fail to
// persist even when the image itself generated and uploaded fine --
// the wizard's Step 6 flow awaits several minutes of sequential
// per-faction Claude+Gemini calls before redirecting, and anything that
// interrupts that window (proxy/platform request timeout, tab losing
// focus, etc.) can kill the request before the DB write runs, with no
// visible error to the user. The dossier page now checks Storage
// directly instead of trusting that DB field, exactly like the mood
// board already did -- so a successful image upload is sufficient for
// the banner to display, full stop. The entries bridge is left in place
// (harmless, and other future consumers may still want it) but nothing
// in the display path depends on it anymore.
async function factionBannerExists(worldId, factionId) {
  const { data: files, error } = await supabase.storage.from(WORLD_ART_BUCKET).list(worldId);
  if (error) throw new Error(`factionBannerExists(${factionId}) failed: ${error.message}`);
  return !!(files || []).find((f) => f.name === `faction-${factionId}-banner.png`);
}

function getFactionBannerUrl(worldId, factionId) {
  const objectPath = `${worldId}/faction-${factionId}-banner.png`;
  const { data } = supabase.storage.from(WORLD_ART_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Dungeon/Battle Maps -- shares WORLD_ART_BUCKET with the mood board and
// faction banners above (no new bucket to create), keyed per-location.
// Deliberately a DIFFERENT path/bucket than a location's own portrait
// (PORTRAIT_BUCKET, `{worldId}/{entryId}.png`) -- reusing that path would
// silently overwrite the location's existing portrait with the battle
// map on first generation. `upsert: true` means regenerating the map
// (routes/dungeonMap.js's /generate, called again later) just replaces
// the same object in place -- no orphaned old versions to clean up.
// mimeType defaults to PNG since the generate path (routes/dungeonMap.js)
// always produces one via compositeGridOntoImage -- the upload path
// (routes/dungeonMap.js's new /upload route) passes the uploaded file's
// real type instead, same "don't hardcode a mimetype regardless of the
// actual bytes" fix already applied to the Gemini image pipeline earlier
// this project (see session_addendum_export_generative_art_map_fix.md).
async function saveDungeonMapImage(worldId, locationId, imageBuffer, mimeType = "image/png") {
  if (!imageBuffer) return null;
  const objectPath = `${worldId}/location-${locationId}-battlemap.png`;
  const { error } = await supabase.storage
    .from(WORLD_ART_BUCKET)
    .upload(objectPath, imageBuffer, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`saveDungeonMapImage(${locationId}) failed: ${error.message}`);
  const { data } = supabase.storage.from(WORLD_ART_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

// Not currently called anywhere (no per-entry "delete just the battle
// map" UI yet -- deleting the whole Location entry is the only way to
// get rid of one today). Included for parity with deleteFactionBanner
// and so deleteAllWorldArt's world-id-prefix wipe below picks these up
// automatically for "Delete World" without needing its own special case.
async function deleteDungeonMapImage(worldId, locationId) {
  const objectPath = `${worldId}/location-${locationId}-battlemap.png`;
  const { error } = await supabase.storage.from(WORLD_ART_BUCKET).remove([objectPath]);
  if (error) throw new Error(`deleteDungeonMapImage(${locationId}) failed: ${error.message}`);
}

// Used by the "Delete World" flow -- mirrors deleteAllPortraits(). Also
// removes the mood board itself, since both live in the same bucket
// under the same worldId folder.
async function deleteAllWorldArt(worldId) {
  const { data: files, error: listError } = await supabase.storage
    .from(WORLD_ART_BUCKET)
    .list(worldId);
  if (listError) throw new Error(`deleteAllWorldArt list failed: ${listError.message}`);
  if (!files || files.length === 0) return;

  const paths = files.map((f) => `${worldId}/${f.name}`);
  const { error: removeError } = await supabase.storage.from(WORLD_ART_BUCKET).remove(paths);
  if (removeError) throw new Error(`deleteAllWorldArt remove failed: ${removeError.message}`);
}

// ---------- NPCs ----------
async function saveNpcEntry(worldId, npc, imageUrl) {
  const factionLabel = await resolveFactionLabel(worldId, npc.faction);
  const calendarConfig = await getCalendarConfig(worldId);
  const bodyHtml = buildNpcBodyHtml(npc, imageUrl, calendarConfig);
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
    footer: [`Faction: ${factionLabel}`, "Source: generated via Chronicled"],
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
    footer: [`Faction: ${factionLabel}`, "Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "enemies", entryMeta);
}

// ---------- Items ----------
async function saveItemEntry(worldId, item, imageUrl) {
  // weaponSkillLabel used to only ever get set once, at AI-generation
  // time (routes/generateItem.js), then just passed through unchanged
  // on every later save via `...raw` spread. That left two real gaps:
  // a manually-created Weapon item (v0.9 Manual Mode) never had this
  // field set at all, and editing an AI-generated item's Weapon Skill
  // dropdown to a DIFFERENT skill left the OLD label stale and now
  // mismatched. Computing it fresh here, on every save regardless of
  // origin, is the same fix already applied to Enemies/Survivors' stat
  // labels this session -- see lib/enemyTemplate.js's buildEnemyBodyHtml
  // and lib/survivorTemplate.js's buildSurvivorBodyHtml.
  // item.weaponSkill itself stays the fixed canonical key (needed for
  // lib/itemFormulas.js's damage-range clamp) -- only the label is
  // recomputed here.
  if (item.category === "Weapon" && item.weaponSkill) {
    const skillSystem = await getSkillSystem(worldId);
    item.weaponSkillLabel = resolveWeaponSkillLabel(skillSystem, item.weaponSkill);
  }

  const calendarConfig = await getCalendarConfig(worldId);
  const bodyHtml = buildItemBodyHtml(item, imageUrl, calendarConfig);
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
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "items", entryMeta);
}

// ---------- Survivors ----------
async function saveSurvivorEntry(worldId, survivor, imageUrl) {
  const factionLabel = await resolveFactionLabel(worldId, survivor.faction);
  const statLabels = await getStatLabels(worldId);
  const calendarConfig = await getCalendarConfig(worldId);
  const bodyHtml = buildSurvivorBodyHtml(survivor, imageUrl, factionLabel, statLabels, calendarConfig);
  const manifestFields = buildSurvivorManifestEntry(survivor, factionLabel);
  const entryMeta = {
    category: "survivors",
    id: survivor.id,
    name: survivor.name,
    eyebrow: "Player Character",
    subtitle: survivor.callsign
      ? `"${survivor.callsign}" — Class: The ${survivor.className}`
      : `Class: The ${survivor.className}`,
    faction: survivor.faction || null,
    className: survivor.className,
    tags: [`<span class="tag">The ${survivor.className}</span>`],
    raw: survivor,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "survivors", entryMeta);
}

// ---------- Logs ----------
async function saveLogEntry(worldId, log) {
  const factionLabel = await resolveFactionLabel(worldId, log.faction, "Personal");
  const calendarConfig = await getCalendarConfig(worldId);
  const bodyHtml = buildLogBodyHtml(log, calendarConfig);
  const manifestFields = buildLogManifestEntry(log, factionLabel);
  // Session Prep Companion, Phase 5 -- a Session Chronicle is a Logs
  // entry carrying a `sessionChronicle` field. Mirrored onto entryMeta's
  // own top level (not just nested under `raw`) exactly as
  // lib/sessionAssembly.js's header comment documents in advance --
  // entriesRepo.js's rowToManifestEntry spreads the full entryMeta onto
  // every manifest row, so Phase 1's getPriorChronicles() (which reads
  // m.sessionChronicle directly) needs it at this level, not only inside
  // m.raw.
  const chronicle = log.sessionChronicle || null;
  const entryMeta = {
    category: "logs",
    id: log.id,
    name: log.name,
    eyebrow: chronicle ? `Session ${chronicle.sessionNumber} Chronicle` : `${log.logType} — Found: ${log.locationContext || ""}`,
    subtitle: `Character(s): ${log.characters || ""}`,
    faction: log.faction || null,
    logType: log.logType,
    sessionChronicle: chronicle,
    tags: [
      ...(chronicle ? [`<span class="tag">Session ${chronicle.sessionNumber} Chronicle</span>`] : []),
      ...(log.hexTongue ? [`<span class="tag">Hex-Tongue Intercept</span>`] : [])
    ],
    raw: log,
    footer: ["Source: generated via Chronicled"],
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
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "classes", entryMeta);
}

// ---------- Factions (always upsert — only 4-5 possible ids, never new) ----------
async function saveFactionEntry(worldId, faction, roundupRows) {
  const calendarConfig = await getCalendarConfig(worldId);
  const bodyHtml = buildFactionBodyHtml(faction, roundupRows, calendarConfig);
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
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "factions", entryMeta);
}

// ---------- Locations ----------
async function saveLocationEntry(worldId, location, imageUrl) {
  const factionLabel = await resolveFactionLabel(worldId, location.faction);
  const bodyHtml = buildLocationBodyHtml(location, imageUrl);
  const manifestFields = buildLocationManifestEntry(location, factionLabel);
  const entryMeta = {
    category: "locations",
    id: location.id,
    name: location.name,
    eyebrow: `Location — ${location.regionBiome}`,
    subtitle: manifestFields.subtitle,
    faction: location.faction,
    regionBiome: location.regionBiome,
    tags: manifestFields.tags,
    raw: location,
    footer: [`Faction: ${factionLabel}`, "Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "locations", entryMeta);
}

// ---------- Session Packets (Session Prep Companion, Phase 4) ----------
async function saveSessionPacketEntry(worldId, packet) {
  const bodyHtml = buildSessionPacketBodyHtml(packet);
  const manifestFields = buildSessionPacketManifestEntry(packet);
  const entryMeta = {
    category: "session-packets",
    id: packet.id,
    name: packet.title,
    eyebrow: "Session Packet",
    subtitle: manifestFields.subtitle,
    faction: null,
    questId: packet.questId || null,
    campaignId: packet.campaignId || null,
    tags: [],
    raw: packet,
    footer: ["Source: generated via Chronicled"],
    bodyHtml
  };
  return upsertEntry(worldId, "session-packets", entryMeta);
}

module.exports = {
  saveImage,
  getPortraitUrl,
  deleteAllPortraits,
  deletePortrait,
  saveMapBackdrop,
  mapBackdropExists,
  getMapBackdropUrl,
  deleteMapBackdrop,
  saveMapAnchors,
  getMapAnchors,
  deleteAllMapTiles,
  saveWorldMoodBoard,
  worldMoodBoardExists,
  getWorldMoodBoardUrl,
  deleteWorldMoodBoard,
  saveFactionBanner,
  deleteFactionBanner,
  factionBannerExists,
  getFactionBannerUrl,
  saveDungeonMapImage,
  deleteDungeonMapImage,
  deleteAllWorldArt,
  saveNpcEntry,
  saveEnemyEntry,
  saveItemEntry,
  saveSurvivorEntry,
  saveLogEntry,
  saveClassEntry,
  saveFactionEntry,
  saveLocationEntry,
  saveSessionPacketEntry
};
