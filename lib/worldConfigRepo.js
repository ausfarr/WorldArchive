// lib/worldConfigRepo.js
//
// Read/write access to the world_config table. Nothing in the codebase
// touched this table before the Phase 2 wizard work — each world's
// world_config row didn't necessarily exist yet, so this module handles
// get-or-create the same way middleware/resolveTenant.js does for worlds.
//
// draft_json holds in-progress, not-yet-saved field values within a step
// still being filled out (e.g. Step 1's fields autosave here). Once a
// step's own Save action is used, that step commits directly to its real
// destination (lore_sections/lore_doc_ref for Lore, factions_json below
// for Factions, etc.) rather than staying in draft_json until Step 8 --
// see this session's addendum to multi_tenant_pivot_scope.md for the full
// reasoning on why the wizard moved to this progressive-commit pattern.

const { supabase } = require("./supabaseClient");

// Race-safe get-or-create, same pattern as resolveTenant.js's
// getOrCreateWorldId — relies on a unique index on world_config.world_id
// rather than a DB trigger.
async function getOrCreateWorldConfig(worldId) {
  const { data: existing, error: selectError } = await supabase
    .from("world_config")
    .select("*")
    .eq("world_id", worldId)
    .maybeSingle();

  if (selectError) throw new Error(`getOrCreateWorldConfig select failed: ${selectError.message}`);
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from("world_config")
    .insert({ world_id: worldId, draft_json: {} })
    .select("*")
    .single();

  if (insertError && insertError.code !== "23505") {
    throw new Error(`getOrCreateWorldConfig insert failed: ${insertError.message}`);
  }
  if (inserted) return inserted;

  // Lost the race to a near-simultaneous request — re-select.
  const { data: afterRace, error: raceError } = await supabase
    .from("world_config")
    .select("*")
    .eq("world_id", worldId)
    .single();
  if (raceError) throw new Error(`getOrCreateWorldConfig re-select failed: ${raceError.message}`);
  return afterRace;
}

// Returns just this world's draft_json (always an object, never null).
async function getDraft(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.draft_json || {};
}

// Shallow-merges `fields` into draft_json[String(step)] and persists.
// Field-level merge (not a full draft replace) so autosaving one field
// can't clobber others saved moments earlier from the same step.
async function saveDraftStep(worldId, step, fields) {
  const config = await getOrCreateWorldConfig(worldId);
  const draft = config.draft_json || {};
  const stepKey = String(step);
  draft[stepKey] = Object.assign({}, draft[stepKey] || {}, fields);

  const { data, error } = await supabase
    .from("world_config")
    .update({ draft_json: draft })
    .eq("world_id", worldId)
    .select("*")
    .single();

  if (error) throw new Error(`saveDraftStep(${step}) failed: ${error.message}`);
  return data.draft_json;
}

// Progressive-commit storage for Factions (Wizard Step 4). Writes
// directly to world_config.factions_json rather than draft_json -- see
// this session's addendum to multi_tenant_pivot_scope.md for why the
// wizard moved to a progressive-commit pattern starting with Lore/Step 3.
async function getFactions(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.factions_json || [];
}

async function saveFactions(worldId, factions) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ factions_json: factions })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveFactions failed: ${error.message}`);
  return data.factions_json;
}

// Wipes a world's draft_json, factions_json, and lore_doc_ref back to
// empty -- used by the wizard's session-based auto-reset and the
// explicit "Start Over" action. Does NOT touch lore_sections (a separate
// table) -- see loreRepo.clearLoreSections, called alongside this by the
// /api/wizard/reset route.
async function resetWorldConfig(worldId) {
  await getOrCreateWorldConfig(worldId);
  // ruleset resets to the column default ('echoes') too -- "Start Over"
  // wipes the world back to its pre-wizard state entirely, and ruleset
  // is chosen fresh on the next pass through Step 1 same as everything
  // else here. Safe to reset unconditionally: this function's only two
  // callers (the auto-reset and "Start Over") already refuse to run
  // against a setup-completed world unless force:true is passed
  // explicitly (see routes/wizard.js), matching setRuleset's own
  // "permanent once complete" rule.
  const { error } = await supabase
    .from("world_config")
    .update({ draft_json: {}, factions_json: [], lore_doc_ref: null, stat_system_json: null, skill_system_json: null, race_system_json: null, style_guide_json: null, category_config_json: null, generic_system_json: null, setup_completed_at: null, ruleset: "echoes" })
    .eq("world_id", worldId);
  if (error) throw new Error(`resetWorldConfig failed: ${error.message}`);
}

// Progressive-commit storage for the Stat System (Wizard Step 5) --
// labels/descriptions only, skinning the six canonical attributes. The
// underlying formulas in lib/statFormulas.js are untouched by this --
// see multi_tenant_pivot_scope.md's locked "skinnable, not rearchitected"
// decision.
async function getStatSystem(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.stat_system_json || null;
}

async function saveStatSystem(worldId, statSystem) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ stat_system_json: statSystem })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveStatSystem failed: ${error.message}`);
  return data.stat_system_json;
}

// Progressive-commit storage for the Skill System (Wizard Step 5, same
// step as Stat Labels) -- world-flavored names for the 7 mechanically
// fixed weapon categories, plus a fixed pool of invented field skills.
// See migrations/005_skill_system.sql.
async function getSkillSystem(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.skill_system_json || null;
}

async function saveSkillSystem(worldId, skillSystem) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ skill_system_json: skillSystem })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveSkillSystem failed: ${error.message}`);
  return data.skill_system_json;
}

// Progressive-commit storage for the Race/Species reference system (5e
// only, Stats & Skills wizard step -- R4 Phase 3). See
// migrations/023_race_system.sql and lib/rulesets/5e/starterRaces.js for
// the default a world starts from before it's ever explicitly saved.
async function getRaceSystem(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.race_system_json || null;
}

async function saveRaceSystem(worldId, raceSystem) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ race_system_json: raceSystem })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveRaceSystem failed: ${error.message}`);
  return data.race_system_json;
}

// Progressive-commit storage for the Style Guide (Wizard Step 6).
async function getStyleGuide(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.style_guide_json || null;
}

async function saveStyleGuide(worldId, styleGuide) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ style_guide_json: styleGuide })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveStyleGuide failed: ${error.message}`);
  return data.style_guide_json;
}

// Progressive-commit storage for Category Configuration (Wizard Step 7).
// The 7 backend categories themselves stay fixed (Option B, locked
// decision) -- this just stores a per-category { label, enabled, blurb }.
async function getCategoryConfig(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.category_config_json || null;
}

async function saveCategoryConfig(worldId, categoryConfig) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ category_config_json: categoryConfig })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveCategoryConfig failed: ${error.message}`);
  return data.category_config_json;
}

// Returns the full world_config row as-is -- used by Step 8's review
// summary, which needs everything at once rather than one field at a
// time.
async function getFullConfig(worldId) {
  return getOrCreateWorldConfig(worldId);
}

// Multi-ruleset genericization -- see migrations/020_ruleset_foundation.sql
// and lib/rulesets/index.js. ruleset defaults to 'echoes' at the DB level
// so getRuleset never needs a null-check; every pre-migration world reads
// 'echoes' automatically, no backfill script required.
async function getRuleset(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.ruleset || "echoes";
}

// Enforces "picked once, permanent" the same way every other wizard step
// enforces its own rules -- in the repo layer, not just the frontend, so
// no future route can accidentally bypass it. Once a world's setup is
// complete, this always throws; the wizard's own Step 1 is the only
// caller that ever invokes it, and only while setup_completed_at is
// still null (see routes/wizard.js's /wizard/set-ruleset).
async function setRuleset(worldId, ruleset) {
  const config = await getOrCreateWorldConfig(worldId);
  if (config.setup_completed_at) {
    throw new Error("This world's setup is already complete -- ruleset can no longer be changed.");
  }
  const { data, error } = await supabase
    .from("world_config")
    .update({ ruleset })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`setRuleset failed: ${error.message}`);
  return data.ruleset;
}

// Phase 10 (Generic ruleset) -- see migrations/021_generic_ruleset_system.sql.
// Same shape/placement as getStatSystem/saveStatSystem above; a Generic
// world's own attribute list + derived-stat formula toggle, set once
// during wizard setup (Step 5, alongside Stat Labels) and read by every
// Generic-ruleset generation route afterward.
async function getGenericSystem(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.generic_system_json || null;
}

async function saveGenericSystem(worldId, genericSystem) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ generic_system_json: genericSystem })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`saveGenericSystem failed: ${error.message}`);
  return data.generic_system_json;
}

async function markSetupComplete(worldId) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ setup_completed_at: new Date().toISOString() })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`markSetupComplete failed: ${error.message}`);
  return data;
}

// Beta-period stopgap for not having real metering/billing yet (Phase 5).
// Lifetime cap on the 7 non-wizard content-generation routes -- see
// middleware/enforceGenerationCap.js and migrations/006_generation_usage_cap.sql.
//
// v0.9 Manual Mode, Piece 2 (field assist) -- this is now a POINTS cap,
// not a raw generation count. 1 full generation = 5 points, 1 field
// assist = 1 point (see migrations/015_field_assist_points.sql for the
// full reasoning and the one-time backfill of existing counts). Moved
// 25 -> 125 to preserve the exact same real generosity in the new unit.
// Nothing user-facing shows "points" -- Settings displays
// Math.floor(generationCount / POINTS_PER_GENERATION) as before.
const GENERATION_CAP = 125;
const POINTS_PER_GENERATION = 5;
const POINTS_PER_FIELD_ASSIST = 1;

// v1.1 split-quota pricing (migrations/029_split_generation_quotas.sql) --
// replaces billingRepo.js's old one-time TRIAL_CAP for signed-up,
// non-subscribed accounts with a genuinely recurring MONTHLY allowance:
// 10 text generations (in points, same POINTS_PER_GENERATION unit as
// everything else here) + 1 image/month, forever. Kept here rather than
// in billingRepo.js since the counter + reset mechanism they spend
// against (world_config.generation_count/image_generation_count,
// resetFreeCycleIfElapsed below) lives in this file.
const FREE_MONTHLY_GENERATION_CAP = POINTS_PER_GENERATION * 10;
const FREE_MONTHLY_IMAGE_CAP = 1;

async function getGenerationCount(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.generation_count || 0;
}

// Atomically checks the cap and increments in one DB round trip (see the
// migration for why) so two near-simultaneous requests can't both slip
// through. Callers MUST stop before making any Claude/Gemini call if
// `allowed` comes back false -- the whole point of this function is
// preventing spend, not just reporting it after the fact.
//
// `amount` is in points -- pass POINTS_PER_GENERATION (5) for a full
// generation or POINTS_PER_FIELD_ASSIST (1) for a field assist. Callers
// that don't pass it explicitly are almost certainly a bug after this
// migration; there's no sensible "generic" default so this stays a
// required-in-practice param rather than defaulting to 1 silently.
async function checkAndIncrementGenerationCount(worldId, cap = GENERATION_CAP, amount = POINTS_PER_GENERATION) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase.rpc("check_and_increment_generation_count", {
    p_world_id: worldId,
    p_cap: cap,
    p_amount: amount
  });
  if (error) throw new Error(`checkAndIncrementGenerationCount failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, count: row.new_count };
}

// Reverses checkAndIncrementGenerationCount's spend when the downstream
// Claude/Gemini call fails after points were already deducted (see
// middleware/enforceGenerationCap.js's refundGeneration helper). Clamped
// server-side at 0 -- see migrations/018_generation_refund.sql.
async function refundGenerationCount(worldId, amount = POINTS_PER_GENERATION) {
  const { error } = await supabase.rpc("refund_generation_count", {
    p_world_id: worldId,
    p_amount: amount
  });
  if (error) throw new Error(`refundGenerationCount failed: ${error.message}`);
}

// Conditionally rolls a non-subscribed world's free-tier counters back to
// 0 once a full month has passed since the last reset -- a no-op (zero
// rows matched) on every other call, so callers can safely call this on
// every request before checking either counter rather than tracking cycle
// state themselves. See migrations/029_split_generation_quotas.sql's
// reset_free_cycle_if_elapsed for the atomic conditional UPDATE.
async function resetFreeCycleIfElapsed(worldId) {
  await getOrCreateWorldConfig(worldId);
  const { error } = await supabase.rpc("reset_free_cycle_if_elapsed", { p_world_id: worldId });
  if (error) throw new Error(`resetFreeCycleIfElapsed failed: ${error.message}`);
}

// Image-quota counterpart to checkAndIncrementGenerationCount -- a plain
// count, not points (no fractional image action exists the way field
// assist is a fractional text generation), so `amount` defaults to a
// whole image rather than POINTS_PER_GENERATION.
async function checkAndIncrementImageGenerationCount(worldId, cap, amount = 1) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase.rpc("check_and_increment_image_generation_count", {
    p_world_id: worldId,
    p_cap: cap,
    p_amount: amount
  });
  if (error) throw new Error(`checkAndIncrementImageGenerationCount failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, count: row.new_count };
}

async function refundImageGenerationCount(worldId, amount = 1) {
  const { error } = await supabase.rpc("refund_image_generation_count", {
    p_world_id: worldId,
    p_amount: amount
  });
  if (error) throw new Error(`refundImageGenerationCount failed: ${error.message}`);
}

// v0.9 Manual Mode -- entries-per-world cap, independent of the
// generation cap above. See middleware/enforceEntryCap.js for the full
// BILLING_ENABLED-gated logic that uses these; this module only owns
// the entries_purchased column (see migrations/013_manual_entry_mode.sql).
// The live entry COUNT itself is entriesRepo.countEntries, not tracked
// here -- see that function's comment for why.
const FREE_ENTRY_CAP = 30;

async function getEntriesPurchased(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return config.entries_purchased || 0;
}

// Atomic single-round-trip increment (migrations/026_atomic_entries_
// purchased_increment.sql) -- a prior plain read-modify-write here was
// justified as safe because it's "only called once per Stripe webhook
// event," but that reasoning only covers one event; two DIFFERENT
// checkout.session.completed events for the same world (two quick entry-
// pack purchases, or a Stripe redelivery) can arrive concurrently and
// race each other, silently losing one purchase's +25 entries. Same
// shape as checkAndIncrementGenerationCount/refundGenerationCount above.
async function addPurchasedEntries(worldId, amount) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase.rpc("increment_entries_purchased", {
    p_world_id: worldId,
    p_amount: amount
  });
  if (error) throw new Error(`addPurchasedEntries failed: ${error.message}`);
  return data;
}

// v0.9 Manual Mode polish round 2 -- persisted Map page lock toggle. See
// migrations/014_map_lock.sql.
async function getLocationsMapLocked(worldId) {
  const config = await getOrCreateWorldConfig(worldId);
  return !!config.locations_map_locked;
}

async function setLocationsMapLocked(worldId, locked) {
  await getOrCreateWorldConfig(worldId);
  const { data, error } = await supabase
    .from("world_config")
    .update({ locations_map_locked: !!locked })
    .eq("world_id", worldId)
    .select("*")
    .single();
  if (error) throw new Error(`setLocationsMapLocked failed: ${error.message}`);
  return !!data.locations_map_locked;
}

module.exports = { getOrCreateWorldConfig, getDraft, saveDraftStep, getFactions, saveFactions, resetWorldConfig, getStatSystem, saveStatSystem, getSkillSystem, saveSkillSystem, getRaceSystem, saveRaceSystem, getStyleGuide, saveStyleGuide, getCategoryConfig, saveCategoryConfig, getFullConfig, getRuleset, setRuleset, getGenericSystem, saveGenericSystem, markSetupComplete, getGenerationCount, checkAndIncrementGenerationCount, refundGenerationCount, resetFreeCycleIfElapsed, checkAndIncrementImageGenerationCount, refundImageGenerationCount, GENERATION_CAP, POINTS_PER_GENERATION, POINTS_PER_FIELD_ASSIST, FREE_MONTHLY_GENERATION_CAP, FREE_MONTHLY_IMAGE_CAP, FREE_ENTRY_CAP, getEntriesPurchased, addPurchasedEntries, getLocationsMapLocked, setLocationsMapLocked };
