// lib/userSettingsRepo.js
//
// Read/write access to the user_settings table (migrations/016_ai_toggle.sql)
// -- currently just the account-level "AI features" toggle. Keyed by
// user_id, not world_id, so it survives a future multi-world feature the
// same way subscriptions/credits already do (see that migration's header
// comment).

const { supabase } = require("./supabaseClient");

// Race-safe get-or-create, same pattern as worldConfigRepo.js's
// getOrCreateWorldConfig -- select, insert, and on a 23505 (unique
// violation, i.e. a near-simultaneous request already inserted this
// user's row) re-select rather than erroring.
async function getOrCreateUserSettings(userId) {
  const { data: existing, error: selectError } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (selectError) throw new Error(`getOrCreateUserSettings select failed: ${selectError.message}`);
  if (existing) return existing;

  const { data: inserted, error: insertError } = await supabase
    .from("user_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (insertError && insertError.code !== "23505") {
    throw new Error(`getOrCreateUserSettings insert failed: ${insertError.message}`);
  }
  if (inserted) return inserted;

  // Lost the race to a near-simultaneous request -- re-select.
  const { data: afterRace, error: raceError } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (raceError) throw new Error(`getOrCreateUserSettings re-select failed: ${raceError.message}`);
  return afterRace;
}

async function getAiEnabled(userId) {
  const settings = await getOrCreateUserSettings(userId);
  return settings.ai_enabled !== false;
}

async function setAiEnabled(userId, aiEnabled) {
  await getOrCreateUserSettings(userId);
  const { data, error } = await supabase
    .from("user_settings")
    .update({ ai_enabled: !!aiEnabled, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) throw new Error(`setAiEnabled failed: ${error.message}`);
  return !!data.ai_enabled;
}

module.exports = { getOrCreateUserSettings, getAiEnabled, setAiEnabled };
