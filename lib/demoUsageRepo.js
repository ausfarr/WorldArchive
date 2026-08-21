// lib/demoUsageRepo.js
//
// Per-IP rate limiting for the unauthenticated demo generator
// (routes/demo.js) -- see session_addendum_demo_mode_scope.md. Tracks
// text and portrait generations separately per UTC calendar day, keyed
// by a SHA-256 hash of the visitor's IP, never the raw address. Mirrors
// lib/worldConfigRepo.js's checkAndIncrementGenerationCount -- same
// atomic check-and-increment-in-one-round-trip shape, same clamped-
// refund pattern -- just against migrations/027_demo_usage.sql's new
// table, with no worldId to key off of.

const crypto = require("crypto");
const { supabase } = require("./supabaseClient");

const DEMO_TEXT_CAP = 2;
const DEMO_PORTRAIT_CAP = 1;

function hashIp(ip) {
  return crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex");
}

// UTC calendar day, not a true rolling 24h window -- see the scope
// doc's "demo_usage table" section for why this simplification was
// chosen (matches the (ip_hash, day) primary key's natural shape; a
// true rolling window needs a timestamp + range query instead).
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function checkAndIncrementDemoText(ip) {
  const { data, error } = await supabase.rpc("check_and_increment_demo_text_usage", {
    p_ip_hash: hashIp(ip),
    p_day: todayUtc(),
    p_cap: DEMO_TEXT_CAP
  });
  if (error) throw new Error(`checkAndIncrementDemoText failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, count: row.new_count, cap: DEMO_TEXT_CAP };
}

async function checkAndIncrementDemoPortrait(ip) {
  const { data, error } = await supabase.rpc("check_and_increment_demo_portrait_usage", {
    p_ip_hash: hashIp(ip),
    p_day: todayUtc(),
    p_cap: DEMO_PORTRAIT_CAP
  });
  if (error) throw new Error(`checkAndIncrementDemoPortrait failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, count: row.new_count, cap: DEMO_PORTRAIT_CAP };
}

// Reverses a spend when the downstream Claude/Gemini call fails after
// the cap was already incremented -- same reasoning as
// migrations/018_generation_refund.sql's refund_generation_count.
async function refundDemoText(ip) {
  const { error } = await supabase.rpc("refund_demo_text_usage", { p_ip_hash: hashIp(ip), p_day: todayUtc() });
  if (error) throw new Error(`refundDemoText failed: ${error.message}`);
}

async function refundDemoPortrait(ip) {
  const { error } = await supabase.rpc("refund_demo_portrait_usage", { p_ip_hash: hashIp(ip), p_day: todayUtc() });
  if (error) throw new Error(`refundDemoPortrait failed: ${error.message}`);
}

module.exports = {
  DEMO_TEXT_CAP,
  DEMO_PORTRAIT_CAP,
  hashIp,
  checkAndIncrementDemoText,
  checkAndIncrementDemoPortrait,
  refundDemoText,
  refundDemoPortrait
};
